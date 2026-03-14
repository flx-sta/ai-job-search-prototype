import { extractSearchIntent, getEmbedding } from './openai-client.js';
import { queryJobs } from './data-loader.js';
import { compositeVectorSearch } from './embeddings.js';
import { conversationManager } from './conversation-manager.js';

/**
 * Perform a context-aware conversational search (or refinement).
 * @param {string} query - New user query
 * @param {Object} data - { jobs, embeddings, indices }
 * @param {Object} options - { topK, minScore, minTopScore, scoreWeights }
 * @param {number} options.topK - Number of results to return
 * @param {number} options.minScore - Minimum score for a result to be included
 * @param {number} options.minTopScore - Minimum score for the top result
 * @param {number} options.minTopScoreFiltered - Minimum score for the top result when filters are applied
 * @param {Object} options.scoreWeights - Weights for the composite score
 * @param {number} options.scoreWeights.explicit - Weight for explicit matches
 * @param {number} options.scoreWeights.inferred - Weight for inferred matches
 * @param {number} options.scoreWeights.company - Weight for company matches
 * 
 * @returns {Promise<Object>} Search results and updated state
 */
export async function search(query, data, options = {}) {
  const {
    topK = 10,
    minScore = 0.42,
    minTopScore = 0.5,
    minTopScoreFiltered = 0.45,
    scoreWeights = { explicit: 0.6, inferred: 0.25, company: 0.15 }
  } = options;
  const { jobs, embeddings, indices } = data;

  const context = conversationManager.getContext();
  const intent = await extractSearchIntent(query, context);
  const activeFilters = conversationManager.update(query, intent);
  const cumulativeSemanticQuery = conversationManager.getSemanticQuery();

  console.debug('🔍 Semantic query:', cumulativeSemanticQuery);

  const queryEmbedding = new Float32Array(
    await getEmbedding(cumulativeSemanticQuery || query)
  );

  const candidateIndices = queryJobs(jobs, indices, activeFilters);
  if (candidateIndices.length === 0) {
    return {
      query,
      is_refinement: intent.is_refinement,
      active_filters: activeFilters,
      semantic_query: cumulativeSemanticQuery,
      results_count: 0,
      total_candidates: 0,
      results: [],
      summary: `No candidates match filters: ${JSON.stringify(activeFilters)}`
    };
  }

  const vectorResults = compositeVectorSearch(queryEmbedding, embeddings, {
    topK,
    candidateIndices,
    weights: scoreWeights
  });

  const topScore = vectorResults[0]?.score ?? 0;
  const hasFilters = Object.keys(activeFilters || {}).length > 0;
  const effectiveMinTopScore = hasFilters ? minTopScoreFiltered : minTopScore;
  const results = topScore < effectiveMinTopScore
    ? []
    : vectorResults
      .filter(res => res.score >= minScore)
      .map(res => ({
        score: res.score,
        job: jobs[res.index]
      }));

  const summary = topScore < effectiveMinTopScore
    ? `No strong matches (top similarity ${(topScore * 100).toFixed(1)}% below threshold ${(effectiveMinTopScore * 100).toFixed(1)}%).`
    : `Searching for "${cumulativeSemanticQuery}" with filters: ${JSON.stringify(activeFilters)}`;

  return {
    query,
    is_refinement: intent.is_refinement,
    active_filters: activeFilters,
    semantic_query: cumulativeSemanticQuery,
    results_count: results.length,
    total_candidates: candidateIndices.length,
    results,
    summary
  };
}
