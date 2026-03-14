/**
 * Vector embedding utilities
 */

/**
 * Calculate cosine similarity between two vectors
 * @param {Float32Array} vecA - First vector
 * @param {Float32Array} vecB - Second vector
 * @returns {number} Similarity score (0-1)
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Find top K most similar jobs using vector search
 * @param {Float32Array} queryEmbedding - Query vector
 * @param {Array<Float32Array>} embeddings - Job embeddings
 * @param {Object} options - Search options
 * @param {number} options.topK - Number of results to return
 * @param {Array<number>} options.candidateIndices - Optional: only search these indices
 * @returns {Array<{index: number, score: number}>} Top K results sorted by score
 */
export function vectorSearch(queryEmbedding, embeddings, options = {}) {
  const { topK = 100, candidateIndices = null } = options;

  const scores = [];
  const indicesToSearch = candidateIndices || Array.from({ length: embeddings.length }, (_, i) => i);

  for (const idx of indicesToSearch) {
    const score = cosineSimilarity(queryEmbedding, embeddings[idx]);
    scores.push({ index: idx, score });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return top K
  return scores.slice(0, topK);
}

/**
 * Find top K most similar jobs using a weighted composite of embeddings
 * @param {Float32Array} queryEmbedding - Query vector
 * @param {Object} embeddingsByType - { explicit, inferred, company }
 * @param {Object} options - Search options
 * @param {number} options.topK - Number of results to return
 * @param {Array<number>} options.candidateIndices - Optional: only search these indices
 * @param {Object} options.weights - Weights for each embedding type
 * @returns {Array<{index: number, score: number}>} Top K results sorted by score
 */
export function compositeVectorSearch(queryEmbedding, embeddingsByType, options = {}) {
  const {
    topK = 100,
    candidateIndices = null,
    weights = { explicit: 0.6, inferred: 0.25, company: 0.15 }
  } = options;

  const explicit = embeddingsByType?.explicit || [];
  const inferred = embeddingsByType?.inferred || [];
  const company = embeddingsByType?.company || [];

  const weightTotal = (weights.explicit || 0) + (weights.inferred || 0) + (weights.company || 0);
  const normalizedWeights = {
    explicit: weightTotal ? (weights.explicit || 0) / weightTotal : 0,
    inferred: weightTotal ? (weights.inferred || 0) / weightTotal : 0,
    company: weightTotal ? (weights.company || 0) / weightTotal : 0
  };

  const scores = [];
  const indicesToSearch = candidateIndices || Array.from({ length: explicit.length }, (_, i) => i);

  for (const idx of indicesToSearch) {
    const explicitScore = explicit[idx] ? cosineSimilarity(queryEmbedding, explicit[idx]) : 0;
    const inferredScore = inferred[idx] ? cosineSimilarity(queryEmbedding, inferred[idx]) : 0;
    const companyScore = company[idx] ? cosineSimilarity(queryEmbedding, company[idx]) : 0;

    const compositeScore =
      normalizedWeights.explicit * explicitScore +
      normalizedWeights.inferred * inferredScore +
      normalizedWeights.company * companyScore;

    scores.push({ index: idx, score: compositeScore });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}

/**
 * Combine multiple embeddings with weights
 * @param {Array<Float32Array>} embeddings - Array of embeddings to combine
 * @param {Array<number>} weights - Weights for each embedding (should sum to 1)
 * @returns {Float32Array} Combined embedding
 */
export function combineEmbeddings(embeddings, weights = null) {
  if (embeddings.length === 0) {
    throw new Error('Must provide at least one embedding');
  }

  // Default to equal weights
  if (!weights) {
    weights = Array(embeddings.length).fill(1 / embeddings.length);
  }

  if (embeddings.length !== weights.length) {
    throw new Error('Number of embeddings must match number of weights');
  }

  const dim = embeddings[0].length;
  const combined = new Float32Array(dim);

  for (let i = 0; i < dim; i++) {
    let sum = 0;
    for (let j = 0; j < embeddings.length; j++) {
      sum += embeddings[j][i] * weights[j];
    }
    combined[i] = sum;
  }

  return combined;
}

/**
 * Normalize a vector to unit length
 * @param {Float32Array} vec - Vector to normalize
 * @returns {Float32Array} Normalized vector
 */
export function normalizeVector(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return vec;

  const normalized = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    normalized[i] = vec[i] / norm;
  }

  return normalized;
}
