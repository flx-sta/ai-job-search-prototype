import fs from 'fs';
import readline from 'readline';

/**
 * Explore jobs.jsonl file with interactive navigation
 * Usage: npm run explore
 * 
 * **Navigation:**
 *  - `↑` and `↓` arrow keys to navigate,
 *  - `n` for next,
 *  - `b` for back,
 *  - `j` to jump to a job number,
 *  - `s` to save current job to file,
 *  - `q` to quit
 */
async function explore() {
  // Read all jobs into memory (or first N jobs if file is huge)
  const jobs = [];
  const fileStream = fs.createReadStream('jobs.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Loading jobs...');
  let loadCount = 0;
  const maxLoad = 100; // Load first 100 jobs (adjust as needed)

  for await (const line of rl) {
    if (loadCount >= maxLoad) break;
    try {
      jobs.push(JSON.parse(line));
      loadCount++;
      if (loadCount % 20 === 0) {
        process.stdout.write(`\rLoaded ${loadCount} jobs...`);
      }
    } catch (err) {
      console.error(`\nError parsing line ${loadCount + 1}`);
    }
  }

  console.log(`\n✓ Loaded ${jobs.length} jobs\n`);

  // Interactive navigation
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  let currentIndex = 0;

  function displayJob(index) {
    console.clear();
    const job = jobs[index];

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Job ${index + 1} of ${jobs.length}`);
    console.log(`${'='.repeat(80)}\n`);

    console.log('📋 BASIC INFO');
    console.log(`   ID: ${job.id}`);
    console.log(`   Title: ${job.job_information?.title || 'N/A'}`);
    console.log(`   Apply URL: ${job.apply_url || 'N/A'}`);

    console.log('\n💼 JOB DETAILS (v7)');
    const v7 = job.v7_processed_job_data || {};
    console.log(`   Post Date: ${v7.estimated_post_date || 'N/A'}`);
    console.log(`   Schedule: ${v7.schedule_requirements || 'N/A'}`);

    console.log('\n🏢 WORK ARRANGEMENT');
    if (v7.work_arrangement) {
      console.log(JSON.stringify(v7.work_arrangement, null, 2));
    } else {
      console.log('   N/A');
    }

    console.log('\n💰 COMPENSATION');
    if (v7.compensation_and_benefits) {
      console.log(JSON.stringify(v7.compensation_and_benefits, null, 2));
    } else {
      console.log('   N/A');
    }

    console.log('\n🎯 SKILLS');
    if (v7.skills) {
      console.log(JSON.stringify(v7.skills, null, 2));
    } else {
      console.log('   N/A');
    }

    console.log('\n📍 LOCATION');
    if (v7.geo_locations && v7.geo_locations.length > 0) {
      v7.geo_locations.forEach(geo => {
        console.log(`   ${geo.city || ''}, ${geo.state || ''}, ${geo.country || ''}`);
      });
    } else {
      console.log('   N/A');
    }

    console.log('\n🏭 COMPANY (v5)');
    const company = job.v5_processed_company_data || {};
    console.log(`   Name: ${company.name || 'N/A'}`);
    console.log(`   Industries: ${company.industries?.join(', ') || 'N/A'}`);
    console.log(`   Non-profit: ${company.is_non_profit ? 'Yes' : 'No'}`);
    console.log(`   Public: ${company.is_public_company ? 'Yes' : 'No'}`);
    console.log(`   Employees: ${company.num_employees || 'N/A'}`);
    console.log(`   Funding: ${company.total_funding_amount ? `${company.total_funding_currency}${company.total_funding_amount}` : 'N/A'}`);

    console.log('\n🎓 EDUCATION');
    if (v7.education) {
      console.log(JSON.stringify(v7.education, null, 2));
    } else {
      console.log('   N/A');
    }

    console.log('\n📊 EXPERIENCE');
    if (v7.experience_requirements) {
      console.log(JSON.stringify(v7.experience_requirements, null, 2));
    } else {
      console.log('   N/A');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('Controls: [N] Next | [B] Back | [J] Jump to # | [S] Save | [Q] Quit');
    console.log(`${'='.repeat(80)}`);
  }

  displayJob(currentIndex);

  let jumpInput = '';
  let jumpMode = false;

  stdin.on('data', (key) => {
    // Ctrl+C
    if (key === '\u0003') {
      console.log('\nExiting...');
      process.exit();
    }

    // Jump mode input
    if (jumpMode) {
      if (key === '\r' || key === '\n') {
        // Enter pressed in jump mode
        const jumpTo = parseInt(jumpInput) - 1; // User enters 1-based
        if (jumpTo >= 0 && jumpTo < jobs.length) {
          currentIndex = jumpTo;
          displayJob(currentIndex);
        } else {
          console.log(`\nInvalid job number. Must be 1-${jobs.length}`);
          setTimeout(() => displayJob(currentIndex), 1500);
        }
        jumpInput = '';
        jumpMode = false;
      } else if (key === '\u007F' || key === '\b') {
        // Backspace
        jumpInput = jumpInput.slice(0, -1);
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        process.stdout.write(`Jump to job #: ${jumpInput}`);
      } else if (key >= '0' && key <= '9') {
        // Number input
        jumpInput += key;
        process.stdout.write(key);
      }
      return;
    }

    // Normal navigation
    switch (key.toLowerCase()) {
      case '\r': // Enter
      case '\n':
      case 'n':  // Next
        if (currentIndex < jobs.length - 1) {
          currentIndex++;
          displayJob(currentIndex);
        } else {
          console.log('\nAlready at last job');
          setTimeout(() => displayJob(currentIndex), 1000);
        }
        break;

      case 'b': // Back
      case 'p': // Previous
        if (currentIndex > 0) {
          currentIndex--;
          displayJob(currentIndex);
        } else {
          console.log('\nAlready at first job');
          setTimeout(() => displayJob(currentIndex), 1000);
        }
        break;

      case 'j': // Jump
        jumpMode = true;
        jumpInput = '';
        process.stdout.write('\nJump to job #: ');
        break;

      case 's': // Save current job to file
        const filename = `job_${currentIndex + 1}_${jobs[currentIndex].id.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        fs.writeFileSync(filename, JSON.stringify(jobs[currentIndex], null, 2));
        console.log(`\n✓ Saved to ${filename}`);
        setTimeout(() => displayJob(currentIndex), 1500);
        break;

      case 'q': // Quit
        console.log('\nExiting...');
        process.exit();
        break;

      case 'h': // Help
      case '?':
        console.log('\n=== HELP ===');
        console.log('[Enter/N] Next job');
        console.log('[B/P] Previous job');
        console.log('[J] Jump to job number');
        console.log('[S] Save current job to file');
        console.log('[Q] Quit');
        console.log('[H/?] Show this help');
        setTimeout(() => displayJob(currentIndex), 3000);
        break;
    }
  });
}

explore();