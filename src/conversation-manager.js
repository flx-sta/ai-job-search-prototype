/**
 * Simple manager for conversational job search
 */
export class ConversationManager {
  constructor() {
    this.history = []; // [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }]
    this.activeFilters = {};
    this.semanticContext = [];
    this.lastIntent = null;
  }

  /**
   * Update state with new user message and extracted intent
   * @param {string} userQuery - New user query
   * @param {Object} intent - Extracted intent from the query
   */
  update(userQuery, intent) {
    this.history.push({ role: 'user', content: userQuery });
    this.lastIntent = intent;

    const cleanedFilters = cleanFilterObject(intent.filters || {});
    const cleanedExcludes = cleanFilterObject(intent.exclude_filters || {});
    if (cleanedFilters.exclude && typeof cleanedFilters.exclude === 'object') {
      Object.assign(cleanedExcludes, cleanFilterObject(cleanedFilters.exclude));
      delete cleanedFilters.exclude;
    }
    Object.assign(cleanedExcludes, inferExcludeFilters(userQuery));

    const hasFilterChanges =
      Object.keys(cleanedFilters).length > 0 ||
      Object.keys(cleanedExcludes).length > 0;
    const hasSemanticQuery =
      typeof intent.semantic_query === 'string' && intent.semantic_query.trim().length > 0;
    const hasPriorSemantic = this.semanticContext.length > 0;

    const isRefinement =
      intent.is_refinement ||
      (hasPriorSemantic && !hasSemanticQuery && hasFilterChanges);

    if (isRefinement) {
      this.activeFilters = {
        ...this.activeFilters,
        ...cleanedFilters
      };
      if (Object.keys(cleanedExcludes).length > 0) {
        this.activeFilters.exclude = mergeExcludeObjects(
          this.activeFilters.exclude || {},
          cleanedExcludes
        );
      }

      if (intent.semantic_query && intent.semantic_query.trim()) {
        const currentContext = this.semanticContext.join(' ').toLowerCase();
        const newQuery = intent.semantic_query.toLowerCase();

        if (newQuery.includes(currentContext) || currentContext.includes(newQuery)) {
          this.semanticContext = [intent.semantic_query];
        } else {
          this.semanticContext.push(intent.semantic_query);
        }
      }
    } else {
      this.activeFilters = cleanedFilters || {};
      if (Object.keys(cleanedExcludes).length > 0) {
        this.activeFilters.exclude = mergeExcludeObjects(
          this.activeFilters.exclude || {},
          cleanedExcludes
        );
      }
      this.semanticContext = intent.semantic_query ? [intent.semantic_query] : [];
    }

    Object.keys(this.activeFilters).forEach(key => {
      if (this.activeFilters[key] === null || this.activeFilters[key] === undefined) {
        delete this.activeFilters[key];
      }
    });
    if (this.activeFilters.exclude) {
      Object.keys(this.activeFilters.exclude).forEach(key => {
        if (this.activeFilters.exclude[key] === null || this.activeFilters.exclude[key] === undefined) {
          delete this.activeFilters.exclude[key];
        }
      });
      if (Object.keys(this.activeFilters.exclude).length === 0) {
        delete this.activeFilters.exclude;
      }
    }

    return this.activeFilters;
  }

  /**
   * Get combined semantic query
   * @returns {string}
   */
  getSemanticQuery() {
    return this.semanticContext.filter(Boolean).join(' ');
  }

  /**
   * Add assistant response to history
   * @param {string} response - Assistant response
   */
  addAssistantResponse(response) {
    this.history.push({ role: 'assistant', content: response });
  }

  /**
   * Reset conversation
   */
  reset() {
    this.history = [];
    this.activeFilters = {};
    this.lastIntent = null;
    this.semanticContext = [];
  }

  /**
   * Get current context for LLM
   */
  getContext() {
    return {
      history: this.history,
      active_filters: this.activeFilters,
      semantic_context: this.semanticContext
    };
  }
}

export const conversationManager = new ConversationManager();

/**
 * Clean filter object by removing null/undefined/empty strings
 * @param {Object} obj - Filter object
 * @returns {Object}
 */
function cleanFilterObject(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .map(([k, v]) => {
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (['null', 'n/a', 'none', 'undefined', ''].includes(trimmed.toLowerCase())) {
            return [k, null];
          }
          return [k, trimmed];
        }
        return [k, v];
      })
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
  );
}

/**
 * Infer exclude filters from user query
 * @param {string} userQuery - User query
 * @returns {Object}
 */
function inferExcludeFilters(userQuery) {
  if (!userQuery) return {};

  const q = userQuery.toLowerCase();
  const excludes = {};

  const seniorityMap = [
    { pattern: /(?:no|not|without|exclude|anything but)\s+(senior|sr)\b/, value: 'Senior Level' },
    { pattern: /(?:no|not|without|exclude|anything but)\s+(mid|mid-level|mid level)\b/, value: 'Mid Level' },
    { pattern: /(?:no|not|without|exclude|anything but)\s+(entry|junior|jr)\b/, value: 'Entry Level' },
    { pattern: /(?:no|not|without|exclude|anything but)\s+(manager|management)\b/, value: 'Manager' },
    { pattern: /(?:no|not|without|exclude|anything but)\s+(director)\b/, value: 'Director' },
    { pattern: /(?:no|not|without|exclude|anything but)\s+(executive|exec|vp|chief)\b/, value: 'Executive' }
  ];

  for (const { pattern, value } of seniorityMap) {
    if (pattern.test(q)) {
      excludes.seniority_level = value;
      break;
    }
  }

  if (/(?:no|not|without|exclude|anything but)\s+remote\b/.test(q)) {
    excludes.is_remote = true;
  }
  if (/(?:no|not|without|exclude|anything but)\s+hybrid\b/.test(q)) {
    excludes.workplace_type = 'Hybrid';
  }
  if (/(?:no|not|without|exclude|anything but)\s+on[-\s]?site\b/.test(q)) {
    excludes.workplace_type = 'Onsite';
  }

  return excludes;
}

/**
 * Merge exclude objects
 * @param {Object} base - Base exclude object
 * @param {Object} incoming - Incoming exclude object
 * @returns {Object}
 */
function mergeExcludeObjects(base, incoming) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === '') continue;
    merged[key] = mergeExcludeValue(merged[key], value);
  }
  return merged;
}

/**
 * Merge exclude values
 * @param {string|Array<string>} existing - Existing exclude value
 * @param {string|Array<string>} incoming - Incoming exclude value
 * @returns {string|Array<string>}
 */
function mergeExcludeValue(existing, incoming) {
  if (existing === undefined) return incoming;

  const existingArr = Array.isArray(existing) ? existing : [existing];
  const incomingArr = Array.isArray(incoming) ? incoming : [incoming];

  const normalized = new Set(existingArr.map(v => normalizeExcludeToken(v)));
  for (const v of incomingArr) {
    normalized.add(normalizeExcludeToken(v));
  }

  const mergedArr = Array.from(normalized).map(v => denormalizeExcludeToken(v));
  return mergedArr.length === 1 ? mergedArr[0] : mergedArr;
}

/**
 * Normalize exclude token
 * @param {string} value - Exclude token
 * @returns {string}
 */
function normalizeExcludeToken(value) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return String(value);
}

/**
 * Denormalize exclude token
 * @param {string} value - Exclude token
 * @returns {string}
 */
function denormalizeExcludeToken(value) {
  return value;
}
