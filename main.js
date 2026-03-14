import inquirer from 'inquirer';
import { loadJobs } from './src/data-loader.js';
import { search } from './src/search.js';
import { conversationManager } from './src/conversation-manager.js';
import { tokenTracker } from './src/utils/token-tracker.js';
import { formatLocation } from './src/utils/utils.js';
import { setModelConfig } from './src/model-config.js';

async function chooseModel() {
  const { intentModel } = await inquirer.prompt([
    {
      type: 'select',
      name: 'intentModel',
      message: 'Choose intent model:',
      choices: [
        { name: 'gpt-4o-mini (faster, cheaper)', value: 'gpt-4o-mini' },
        { name: 'gpt-4o (smarter, slower)', value: 'gpt-4o' }
      ],
      default: 'gpt-4o-mini'
    }
  ]);

  setModelConfig({ intentModel });
  console.log(`\n✅ Using intent model: ${intentModel}\n`);
}

async function main() {
  const readline = (await import('readline')).default;

  console.clear();
  console.log('🚀 AI Job Search Prototype');
  console.log('==========================');
  console.log('Building search index (100k jobs)...');

  // Load full dataset (100k jobs) to utilize caching
  const data = await loadJobs({ limit: 100000, verbose: true });

  await chooseModel();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n🔍 Search Jobs: '
  });

  console.log('✅ Ready! Type a search query like "software engineer", then refine with "make it remote".');
  console.log('Type "exit" to quit, "reset" to clear context, or "report" for cost summary.');

  rl.prompt();

  rl.on('line', async (line) => {
    const query = line.trim();

    if (query.toLowerCase() === 'exit') {
      tokenTracker.printSummary();
      process.exit(0);
    }

    if (query.toLowerCase() === 'reset') {
      conversationManager.reset();
      console.log('♻️  Conversation reset.');
      rl.prompt();
      return;
    }

    if (query.toLowerCase() === 'report') {
      tokenTracker.printSummary();
      rl.prompt();
      return;
    }

    if (!query) {
      rl.prompt();
      return;
    }

    try {
      process.stdout.write('⏳ Searching...');
      const result = await search(query, data);  // Conversational refinement

      process.stdout.write('\r' + ' '.repeat(20) + '\r'); // Clear searching text

      console.log(`\n🤖 ${result.is_refinement ? 'REFINEMENT' : 'NEW SEARCH'}: ${result.summary}`);
      console.log(`📍 Found ${result.results_count} relevant roles (out of ${result.total_candidates} candidates)`);
      console.log('-'.repeat(50));

      if (result.results.length === 0) {
        console.log('⚠️ No exact matches found. Try broadening your criteria!');
      } else {
        result.results.slice(0, 5).forEach((res, i) => {
          const { job, score } = res;
          console.log(`${i + 1}. [${(score * 100).toFixed(1)}%] ${job.title} at ${job.company_name}`);
          console.log(
            `   📍 ${job.workplace_type} | ${job.seniority_level} | ${formatLocation(job, result.filters?.location)}`
          );
          console.log(`   🔗 ${job.apply_url}`);
          console.log('');
        });
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
    }

    rl.prompt();
  }).on('close', () => {
    tokenTracker.printSummary();
    process.exit(0);
  });
}

main().catch(console.error);
