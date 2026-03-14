import fs from 'fs';
import readline from 'readline';
import v8 from 'v8';
import path from 'path';
import { JobSchema } from './schemas.js';

const CACHE_FILE = 'jobs.jsonl.idx.cache';

/**
 * Load jobs from jobs.jsonl into memory (with caching)
 * @param {Object} options - Loading options
 * @param {number} options.limit - Max number of jobs to load (default: all)
 * @param {boolean} options.verbose - Show detailed progress (default: true)
 * @param {boolean} options.forceRebuild - Ignore cache and rebuild (default: false)
 * @returns {Promise<Object>} { jobs, embeddings, indices, stats }
 */
export async function loadJobs(options = {}) {
  const { limit = 100000, verbose = true, forceRebuild = false } = options;
  const currentCacheFile = limit === 100000 ? CACHE_FILE : `jobs.${limit}.idx.cache`;

  // 1. Check Cache first
  const cacheStartTime = Date.now();
  if (!forceRebuild && fs.existsSync(currentCacheFile)) {
    try {
      const stats_jsonl = fs.statSync('jobs.jsonl');
      const stats_cache = fs.statSync(currentCacheFile);

      if (stats_cache.mtime > stats_jsonl.mtime) {
        if (verbose) console.log(`🚀 Loading search index from cache (${path.basename(currentCacheFile)})...`);
        const cacheBuffer = fs.readFileSync(currentCacheFile);
        const data = v8.deserialize(cacheBuffer);

        if (verbose) {
          const cacheTime = ((Date.now() - cacheStartTime) / 1000).toFixed(2);
          console.log(`✅ Cache loaded: ${data.jobs.length.toLocaleString()} jobs (in ${cacheTime}s)`);
          console.log(`   Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)}MB\n`);
        }
        return data;
      }
    } catch (err) {
      if (verbose) console.warn(`⚠️  Cache read failed: ${err.message}. Rebuilding...`);
    }
  }

  const jobs = [];
  const embeddings = {
    explicit: [],
    inferred: [],
    company: []
  };

  // In-memory indices for fast filtering
  const indices = {
    byWorkplaceType: new Map(),
    bySeniority: new Map(),
    byRemote: new Map(),
    byNonProfit: new Map(),
    byIndustry: new Map()
  };

  const stats = {
    total: 0,
    withEmbeddings: 0,
    withSalary: 0,
    remote: 0,
    nonProfit: 0,
    errors: 0
  };

  if (!fs.existsSync('jobs.jsonl')) {
    throw new Error('jobs.jsonl not found. Please ensure the dataset is in the project root.');
  }

  const fileStream = fs.createReadStream('jobs.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const startTime = Date.now();
  let lineNumber = 0;

  if (verbose) {
    console.log('📂 Building search index from jobs.jsonl...');
  }

  for await (const line of rl) {
    if (stats.total >= limit) break;

    lineNumber++;

    try {
      const rawJob = JSON.parse(line);
      
      // Validate with Zod
      const validation = JobSchema.safeParse(rawJob);
      if (!validation.success) {
        if (verbose && stats.errors < 5) {
          console.warn(`\n⚠️  Validation error at line ${lineNumber}:`, validation.error.issues[0].message);
        }
        stats.errors++;
        continue;
      }

      const extracted = extractJobFields(validation.data);
      jobs.push(extracted);

      // Extract embeddings from validated data
      const v7 = validation.data.v7_processed_job_data;
      if (v7.embedding_explicit_vector) {
        embeddings.explicit.push(new Float32Array(v7.embedding_explicit_vector));
        embeddings.inferred.push(new Float32Array(v7.embedding_inferred_vector || []));
        embeddings.company.push(new Float32Array(v7.embedding_company_vector || []));
        stats.withEmbeddings++;
      } else {
        embeddings.explicit.push(new Float32Array(1536));
        embeddings.inferred.push(new Float32Array(1536));
        embeddings.company.push(new Float32Array(1536));
      }

      // Build indices
      const jobIndex = stats.total;

      if (extracted.workplace_type) {
        addToIndex(indices.byWorkplaceType, extracted.workplace_type, jobIndex);
      }
      if (extracted.seniority_level) {
        addToIndex(indices.bySeniority, extracted.seniority_level, jobIndex);
      }
      if (extracted.is_remote) {
        addToIndex(indices.byRemote, 'true', jobIndex);
        stats.remote++;
      }
      if (extracted.is_non_profit) {
        addToIndex(indices.byNonProfit, 'true', jobIndex);
        stats.nonProfit++;
      }
      if (extracted.industries) {
        extracted.industries.forEach(industry => {
          addToIndex(indices.byIndustry, industry, jobIndex);
        });
      }

      if (extracted.min_salary || extracted.max_salary) {
        stats.withSalary++;
      }

      stats.total++;

      // Progress updates
      if (verbose && stats.total % 1000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (stats.total / elapsed).toFixed(0);
        process.stdout.write(`\r📊 Loading ${stats.total.toLocaleString()} jobs (${rate}/sec)...`);
      }

    } catch (err) {
      stats.errors++;
    }
  }

  const result = { jobs, embeddings, indices, stats };

  // Save to Cache
  if (verbose) console.log(`\n💾 Saving index to cache...`);
  try {
    const serialized = v8.serialize(result);
    fs.writeFileSync(currentCacheFile, serialized);
    if (verbose) console.log(`✅ Index cached to ${currentCacheFile}`);
  } catch (err) {
    if (verbose) console.error(`⚠️  Failed to save cache: ${err.message}`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  if (verbose) {
    console.log(`\n✅ Loading complete! (${totalTime}s)`);
    console.log(`   Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)}MB\n`);
  }

  return result;
}

/**
 * Extract relevant fields from raw job object
 * @param {object} job 
 * @returns {object}
 */
function extractJobFields(job) {
  const v7 = job.v7_processed_job_data || {};
  const v5Company = job.v5_processed_company_data || {};
  const jobInfo = job.job_information || {};

  const workArrangement = v7.work_arrangement || {};
  const compensation = v7.compensation_and_benefits || {};
  const experience = v7.experience_requirements || {};
  const skills = v7.skills || {};

  return {
    // Basic info
    id: job.id,
    title: jobInfo.title || 'N/A',
    apply_url: job.apply_url,

    // Work arrangement
    workplace_type: workArrangement.workplace_type,
    is_remote: workArrangement.workplace_type === 'Remote',
    commitment: workArrangement.commitment || [],
    individual_contributor_or_people_manager: workArrangement.individual_contributor_or_people_manager,
    locations: workArrangement.workplace_locations || [],

    // Compensation
    min_salary: compensation.salary?.low,
    max_salary: compensation.salary?.high,
    salary_currency: compensation.salary?.currency,
    salary_frequency: compensation.salary?.frequency,
    benefits: compensation.benefits || {},

    // Experience & seniority
    seniority_level: experience.seniority_level,
    min_years: experience.min_years_breakdown?.industry_and_role_yoe,
    management_years: experience.min_years_breakdown?.management_and_leadership_yoe,
    security_clearance: experience.security_clearance,

    // Skills
    skills_explicit: skills.explicit || [],
    skills_inferred: skills.inferred || [],

    // Education
    education: v7.education || {},

    // Company
    company_name: v5Company.name,
    industries: v5Company.industries || [],
    is_non_profit: v5Company.is_non_profit || false,
    is_public_company: v5Company.is_public_company || false,
    num_employees: v5Company.num_employees,
    total_funding: v5Company.total_funding_amount,

    // Metadata (not using _raw to save memory)
    // _raw: job
  };
}

/**
 * Add job index to a Map-based index
 * @param {Map} indexMap 
 * @param {string} key 
 * @param {number} jobIndex 
 */
function addToIndex(indexMap, key, jobIndex) {
  if (!indexMap.has(key)) {
    indexMap.set(key, []);
  }
  indexMap.get(key).push(jobIndex);
}

/**
 * Query jobs by filters
 * @param {Array} jobs - Array of job objects
 * @param {Object} indices - Index maps
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered job indices
 */
export function queryJobs(jobs, indices, filters = {}) {
  let candidateIndices = null;
  const exclude = filters.exclude || {};

  // Start with most restrictive filter
  if (filters.workplace_type) {
    candidateIndices = indices.byWorkplaceType.get(filters.workplace_type) || [];
  } else if (filters.seniority_level) {
    candidateIndices = indices.bySeniority.get(filters.seniority_level) || [];
  } else if (filters.is_remote) {
    candidateIndices = indices.byRemote.get('true') || [];
  } else if (filters.is_non_profit) {
    candidateIndices = indices.byNonProfit.get('true') || [];
  } else if (filters.industry) {
    candidateIndices = indices.byIndustry.get(filters.industry) || [];
  } else {
    // No index-based filter, start with all jobs
    candidateIndices = Array.from({ length: jobs.length }, (_, i) => i);
  }

  // Apply additional filters
  const filtered = candidateIndices.filter(idx => {
    const job = jobs[idx];

    if (filters.workplace_type && job.workplace_type !== filters.workplace_type) return false;
    if (filters.seniority_level && job.seniority_level !== filters.seniority_level) return false;
    if (filters.is_remote !== undefined && filters.is_remote !== null && job.is_remote !== filters.is_remote) return false;
    if (filters.is_non_profit !== undefined && filters.is_non_profit !== null && job.is_non_profit !== filters.is_non_profit) return false;
    if (filters.min_salary && (!job.min_salary || job.min_salary < filters.min_salary)) return false;
    if (filters.individual_contributor_or_people_manager &&
      job.individual_contributor_or_people_manager !== filters.individual_contributor_or_people_manager) return false;
    if (filters.company_name &&
      (!job.company_name || !job.company_name.toLowerCase().includes(filters.company_name.toLowerCase()))) return false;
    if (filters.industry) {
      const industries = Array.isArray(job.industries) ? job.industries : [];
      if (!industries.some(ind => ind.toLowerCase().includes(filters.industry.toLowerCase()))) return false;
    }

    // Location filter (city or state)
    if (filters.location && filters.location !== 'null' && filters.location !== 'N/A') {
      let locationMatch = false;

      if (Array.isArray(job.locations) && job.locations.length > 0) {
        locationMatch = job.locations.some(loc =>
          loc.city?.toLowerCase().includes(filters.location.toLowerCase()) ||
          loc.state?.toLowerCase().includes(filters.location.toLowerCase())
        );
      }

      if (!locationMatch && job.title) {
        locationMatch = job.title.toLowerCase().includes(filters.location.toLowerCase());
      }

      if (!locationMatch) return false;
    }

    // Exclude filters
    if (matchesExcludeValue(exclude.workplace_type, job.workplace_type)) return false;
    if (matchesExcludeValue(exclude.seniority_level, job.seniority_level)) return false;
    if (exclude.is_remote !== undefined && exclude.is_remote !== null &&
      matchesExcludeValue(exclude.is_remote, job.is_remote)) return false;
    if (exclude.is_non_profit !== undefined && exclude.is_non_profit !== null &&
      matchesExcludeValue(exclude.is_non_profit, job.is_non_profit)) return false;
    if (exclude.company_name && job.company_name &&
      matchesExcludeString(exclude.company_name, job.company_name)) return false;
    if (exclude.industry) {
      const industries = Array.isArray(job.industries) ? job.industries : [];
      if (matchesExcludeStringInList(exclude.industry, industries)) return false;
    }
    if (exclude.location && exclude.location !== 'null' && exclude.location !== 'N/A') {
      let locationMatch = false;
      const excludeLocations = toArray(exclude.location);
      if (Array.isArray(job.locations) && job.locations.length > 0) {
        locationMatch = excludeLocations.some(ex =>
          job.locations.some(loc =>
            loc.city?.toLowerCase().includes(String(ex).toLowerCase()) ||
            loc.state?.toLowerCase().includes(String(ex).toLowerCase())
          )
        );
      }
      if (!locationMatch && job.title) {
        locationMatch = excludeLocations.some(ex =>
          job.title.toLowerCase().includes(String(ex).toLowerCase())
        );
      }
      if (locationMatch) return false;
    }

    return true;
  });

  return filtered;
}

/**
 * Convert value to array
 * @param {any} value 
 * @returns {Array<any>}
 */
function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Check if exclude value matches job value
 * @param {any} excludeValue 
 * @param {any} jobValue 
 * @returns {boolean}
 */
function matchesExcludeValue(excludeValue, jobValue) {
  if (excludeValue === undefined || excludeValue === null) return false;
  const values = toArray(excludeValue).map(v => String(v).toLowerCase());
  return values.includes(String(jobValue).toLowerCase());
}

/**
 * Check if exclude string matches job value
 * @param {any} excludeValue 
 * @param {any} jobValue 
 * @returns {boolean}
 */
function matchesExcludeString(excludeValue, jobValue) {
  if (!excludeValue || !jobValue) return false;
  const values = toArray(excludeValue).map(v => String(v).toLowerCase());
  const job = String(jobValue).toLowerCase();
  return values.some(v => job.includes(v));
}

/**
 * Check if exclude string matches job value in list
 * @param {any} excludeValue 
 * @param {Array<any>} list 
 * @returns {boolean}
 */
function matchesExcludeStringInList(excludeValue, list) {
  if (!excludeValue) return false;
  const values = toArray(excludeValue).map(v => String(v).toLowerCase());
  return list.some(item => values.some(v => String(item).toLowerCase().includes(v)));
}
