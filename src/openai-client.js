import OpenAI from 'openai';
import dotenv from 'dotenv';
import { tokenTracker } from './utils/token-tracker.js';
import { getModelConfig } from './model-config.js';

// load ENV variables (API KEY)
dotenv.config();

/** Initialize OpenAI client */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get embedding for a text string
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text) {
  /** @type {import('openai/resources').EmbeddingModel} */
  const model = 'text-embedding-3-small';
  const response = await openai.embeddings.create({
    model,
    input: text,
    encoding_format: 'float',
  });

  tokenTracker.track(model, response.usage.prompt_tokens, 0, 'embedding');

  return response.data[0].embedding;
}

/**
 * Extract structured intent from a natural language query, considering conversation context
 * @param {string} query - user query
 * @param {Object} context - Optional conversation context { history, active_filters }
 * @returns {Promise<Object>}
 */
export async function extractSearchIntent(query, context = { history: [], active_filters: {} }) {
  const { intentModel } = getModelConfig();
  const model = intentModel || 'gpt-4o-mini';

  const previousQueries = context.history
    ?.filter(msg => msg.role === 'user')
    .slice(-2) // Only last 2 messages
    .map(msg => msg.content)
    .join('. ');

  const systemPrompt = `Extract job search filters from the query.

    Previous context: ${previousQueries || 'None'}
    Current filters: ${JSON.stringify(context.active_filters || {})}

    Rules:
    1. If query mentions a NEW job role → is_refinement: false
    2. If query only adds constraints → is_refinement: true
    3. Extract location from phrases like "in Seattle", "at Boston", "Seattle area"
    4. Seniority: Entry Level, Mid Level, Senior Level, Manager, Director, Executive
    5. Workplace: Remote, Onsite, Hybrid
    6. Handle negations like "not", "no", "exclude", "without", "anything but" using exclude_filters
    7. Do NOT include negated terms in semantic_query

    Return JSON:
    {
      "is_refinement": boolean,
      "filters": {
        "location": "city name or null",
        "workplace_type": "Remote|Onsite|Hybrid|null", 
        "is_remote": boolean or null,
        "seniority_level": "Entry Level|Mid Level|...|null",
        "is_non_profit": boolean or null,
        "min_salary": number or null,
        "company_name": "string or null",
        "industry": "string or null"
      },
      "exclude_filters": {
        "location": "city name or null",
        "workplace_type": "Remote|Onsite|Hybrid|null",
        "is_remote": boolean or null,
        "seniority_level": "Entry Level|Mid Level|...|null",
        "is_non_profit": boolean or null,
        "company_name": "string or null",
        "industry": "string or null"
      },
      "semantic_query": "clean job search terms without location/filters"
    }

    Examples:
    Query: "software engineer in Seattle"
    → {"is_refinement": false, "filters": {"location": "Seattle"}, "semantic_query": "software engineer"}

    Query: "only remote positions"
    → {"is_refinement": true, "filters": {"workplace_type": "Remote", "is_remote": true}, "semantic_query": ""}

    Query: "entry level"
    → {"is_refinement": true, "filters": {"seniority_level": "Entry Level"}, "semantic_query": ""}

    Query: "data analyst not remote, exclude finance companies"
    → {"is_refinement": false, "filters": {}, "exclude_filters": {"is_remote": true, "industry": "Finance"}, "semantic_query": "data analyst"}`.trim();

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query }
    ],
    response_format: { type: "json_object" },
    temperature: 0
  });

  tokenTracker.track(model, response.usage.prompt_tokens, response.usage.completion_tokens, 'chat');

  const result = JSON.parse(response.choices[0].message.content);

  console.log('🤖 LLM extracted:', JSON.stringify(result.filters));

  return result;
}
