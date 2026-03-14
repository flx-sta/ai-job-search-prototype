import fs from 'fs';
import path from 'path';
import { getDateAsIso8601 } from './utils.js';

const REPORT_FILE = path.join(process.cwd(), 'reports', `tokens_report.${getDateAsIso8601()}.json`);

const PRICES = {
  'text-embedding-3-small': { input: 0.00002 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 }
};

class TokenTracker {
  constructor() {
    this.logs = this.loadLogs();
  }

  loadLogs() {
    try {
      if (fs.existsSync(REPORT_FILE)) {
        return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load token logs');
    }
    return [];
  }

  saveLogs() {
    try {
      fs.writeFileSync(REPORT_FILE, JSON.stringify(this.logs, null, 2));
    } catch (e) {
      console.error('Failed to save token logs');
    }
  }

  /**
   * Track an OpenAI API call
   * @param {string} model 
   * @param {number} promptTokens 
   * @param {number} completionTokens 
   * @param {string} type - 'embedding' or 'chat'
   */
  track(model, promptTokens, completionTokens = 0, type = 'chat') {
    const pricing = PRICES[model] || { input: 0, output: 0 };
    const cost = (promptTokens / 1000) * pricing.input +
      (completionTokens / 1000) * (pricing.output || 0);

    const entry = {
      timestamp: new Date().toISOString(),
      type,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      estimated_cost_usd: parseFloat(cost.toFixed(6))
    };

    this.logs.push(entry);
    this.saveLogs();
    return entry;
  }

  getSummary() {
    return this.logs.reduce((acc, log) => {
      acc.total_tokens += log.total_tokens;
      acc.total_cost += log.estimated_cost_usd;
      acc.calls += 1;
      return acc;
    }, { total_tokens: 0, total_cost: 0, calls: 0 });
  }

  printSummary() {
    const summary = this.getSummary();
    console.log(`\n💰 OpenAI Usage Report:`);
    console.log(`   Total Calls: ${summary.calls}`);
    console.log(`   Total Tokens: ${summary.total_tokens.toLocaleString()}`);
    console.log(`   Estimated Cost: $${summary.total_cost.toFixed(4)}`);
  }
}

export const tokenTracker = new TokenTracker();
