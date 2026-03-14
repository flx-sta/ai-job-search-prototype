import fs from 'fs';
import path from 'path';
import { getDateAsIso8601 } from '../utils/utils.js';

/**
 * CLI utility to track costs
 * Usage: 
 *   npm run report
 *   npm run report YYYY-MM-DD
 */

/**
 * Get all report files
 * @returns {Array<string>} Array of report file paths
 */
function getAllReportFiles() {
  const reportsDir = path.join(process.cwd(), 'reports');

  if (!fs.existsSync(reportsDir)) {
    console.error(`❌ Reports directory not found: ${reportsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('tokens_report.') && f.endsWith('.json'))
    .map(f => path.join(reportsDir, f));

  return files;
}

/**
 * Load report file
 * @param {string} filePath - Path to report file
 * @returns {Array<Object>} Array of report logs
 */
function loadReportFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  Failed to read ${path.basename(filePath)}: ${error.message}`);
    return [];
  }
}

function aggregateAllReports() {
  console.log('\n📊 Aggregate Cost Report (All Time)');
  console.log('='.repeat(50));

  const reportFiles = getAllReportFiles();

  if (reportFiles.length === 0) {
    console.error('❌ No reports found in ./reports directory');
    process.exit(1);
  }

  console.log(`📁 Found ${reportFiles.length} report file(s)\n`);

  // Aggregate across all files
  const allLogs = [];
  const byDate = {};

  reportFiles.forEach(filePath => {
    const logs = loadReportFile(filePath);
    const date = path.basename(filePath).match(/tokens_report\.(.+)\.json/)?.[1];

    allLogs.push(...logs);

    if (date) {
      byDate[date] = logs.reduce((sum, log) => sum + log.estimated_cost_usd, 0);
    }
  });

  // Calculate summary
  const summary = allLogs.reduce((acc, log) => {
    acc.total_tokens += log.total_tokens;
    acc.total_cost += log.estimated_cost_usd;
    acc.calls += 1;

    // Group by model
    acc.byModel[log.model] = (acc.byModel[log.model] || 0) + log.estimated_cost_usd;

    // Group by type (embedding, chat, etc.)
    const type = log.type || 'unknown';
    acc.byType[type] = (acc.byType[type] || 0) + log.estimated_cost_usd;

    return acc;
  }, {
    total_tokens: 0,
    total_cost: 0,
    calls: 0,
    byModel: {},
    byType: {}
  });

  // Print overall summary
  console.log('💰 Overall Summary:');
  console.log(`   Total Calls:   ${summary.calls.toLocaleString()}`);
  console.log(`   Total Tokens:  ${summary.total_tokens.toLocaleString()}`);
  console.log(`   Total Spend:   $${summary.total_cost.toFixed(4)}`);

  // Breakdown by model
  console.log('\n📈 Breakdown by Model:');
  Object.entries(summary.byModel)
    .sort(([, a], [, b]) => b - a) // Sort by cost descending
    .forEach(([model, cost]) => {
      const percentage = (cost / summary.total_cost * 100).toFixed(1);
      console.log(`   • ${model.padEnd(30)}: $${cost.toFixed(6)} (${percentage}%)`);
    });

  // Breakdown by type
  console.log('\n🏷️  Breakdown by Type:');
  Object.entries(summary.byType)
    .sort(([, a], [, b]) => b - a)
    .forEach(([type, cost]) => {
      const percentage = (cost / summary.total_cost * 100).toFixed(1);
      console.log(`   • ${type.padEnd(30)}: $${cost.toFixed(6)} (${percentage}%)`);
    });

  // Daily breakdown
  console.log('\n📅 Daily Breakdown:');
  Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a)) // Sort by date descending
    .slice(0, 10) // Show last 10 days
    .forEach(([date, cost]) => {
      console.log(`   ${date}: $${cost.toFixed(6)}`);
    });

  if (Object.keys(byDate).length > 10) {
    console.log(`   ... and ${Object.keys(byDate).length - 10} more days`);
  }

  console.log('\n✅ Report complete.\n');
}

/**
 * Generate daily cost report
 * @param {string} date - Date in YYYY-MM-DD format
 */
function dailyReport(date) {
  const fileName = `tokens_report.${date}.json`;
  const filePath = path.join(process.cwd(), 'reports', fileName);

  console.log(`\n📊 Daily Cost Report: ${date}`);
  console.log('='.repeat(50));

  if (!fs.existsSync(filePath)) {
    console.error(`❌ No report found for ${date}`);
    console.log(`   Looking for: ${fileName}`);
    console.log(`\n💡 Available dates:`);

    const available = getAllReportFiles()
      .map(f => path.basename(f).match(/tokens_report\.(.+)\.json/)?.[1])
      .filter(Boolean)
      .sort()
      .reverse()
      .slice(0, 5);

    available.forEach(d => console.log(`   • ${d}`));
    process.exit(1);
  }

  try {
    const logs = loadReportFile(filePath);

    const summary = logs.reduce((acc, log) => {
      acc.total_tokens += log.total_tokens;
      acc.total_cost += log.estimated_cost_usd;
      acc.calls += 1;

      // Group by model
      acc.byModel[log.model] = (acc.byModel[log.model] || 0) + log.estimated_cost_usd;

      // Group by type
      const type = log.type || 'unknown';
      acc.byType[type] = (acc.byType[type] || 0) + log.estimated_cost_usd;

      return acc;
    }, {
      total_tokens: 0,
      total_cost: 0,
      calls: 0,
      byModel: {},
      byType: {}
    });

    // Print summary
    console.log('💰 Daily Summary:');
    console.log(`   Total Calls:   ${summary.calls.toLocaleString()}`);
    console.log(`   Total Tokens:  ${summary.total_tokens.toLocaleString()}`);
    console.log(`   Total Spend:   $${summary.total_cost.toFixed(6)}`);

    // Breakdown by model
    console.log('\n📈 Breakdown by Model:');
    Object.entries(summary.byModel)
      .sort(([, a], [, b]) => b - a)
      .forEach(([model, cost]) => {
        const percentage = (cost / summary.total_cost * 100).toFixed(1);
        const calls = logs.filter(log => log.model === model).length;
        console.log(`   • ${model.padEnd(30)}: $${cost.toFixed(6)} (${calls} calls, ${percentage}%)`);
      });

    // Breakdown by type
    console.log('\n🏷️  Breakdown by Type:');
    Object.entries(summary.byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, cost]) => {
        const percentage = (cost / summary.total_cost * 100).toFixed(1);
        const calls = logs.filter(log => (log.type || 'unknown') === type).length;
        console.log(`   • ${type.padEnd(30)}: $${cost.toFixed(6)} (${calls} calls, ${percentage}%)`);
      });

    // Show recent calls
    console.log('\n🕐 Recent API Calls (last 5):');
    logs.slice(-5).reverse().forEach((log, i) => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      console.log(`   ${i + 1}. ${time} - ${log.model} (${log.type}): $${log.estimated_cost_usd.toFixed(6)}`);
    });

    console.log('\n✅ Report complete.\n');

  } catch (error) {
    console.error(`❌ Error reading report: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main execution of the report tool
 */
function main() {
  const dateArg = process.argv[2];

  if (!dateArg) {
    // No argument → aggregate all reports
    aggregateAllReports();
  } else {
    // Date provided → daily report
    const date = dateArg === 'today' ? getDateAsIso8601() : dateArg;
    dailyReport(date);
  }
}

main();