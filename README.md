# AI Job Search Prototype

This repository contains a CLI prototype for conversational job search over a large jobs dataset. It supports multi-turn refinements, semantic ranking with embeddings, and structured filtering for practical search quality.

## Evaluation Framework (Post-hoc)

To evaluate relevance quality, the system could be tested with a set of representative queries:

- data science jobs
- remote ML engineer roles
- senior backend startup roles
- mission-driven data science companies

Results could be scored using a manual relevance scale:
2 = highly relevant
1 = partially relevant
0 = irrelevant

The metric would be average relevance of the top 5 results.

## Requirements

- **Node.js**: Version 18.x or later.
- **npm**: Version 9.x or later.
- **`jobs.jsonl`**: The dataset file must be placed in the project root.
- **OpenAI API Key**: Required for intent extraction and embeddings. Place it in a `.env` file as `OPENAI_API_KEY`.

### Typical Data Structure

The `jobs.jsonl` file is expected to contain one JSON object per line with the following structure:

```json
{
  "id": "successfactors___com___JHBP___1361752300",
  "job_information": {
    "title": "Director of Benefits (Somewhere, WA, US, 12345)",
    "description": "John Doe is the industry leader..."
  },
  "v5_processed_company_data": {
    "name": "John Doe Industries"
  },
  "v7_processed_job_data": {
    "work_arrangement": {
      "workplace_type": "Onsite",
      "workplace_locations": [
        { "city": "Somewhere", "state": "Washington", "country_code": "US" }
      ]
    },
    "experience_requirements": { "seniority_level": "Director" },
    "embedding_explicit_vector": [...],
    "embedding_inferred_vector": [...],
    "embedding_company_vector": [...]
  }
}
```

## How to Run

[**Demo Video**](./demo-video.mp4)

1. Install dependencies:

```bash
npm install
```

2. Run the CLI:

```bash
npm start
```

This loads `jobs.jsonl` (100k jobs), builds indices/embeddings cache, then opens an interactive prompt.

## Demo Script (5+ Queries + Refinement & Reset Flow)


1. Run `npm start`
2. Select a model (gpt-4o-mini or gpt-4o)
3. Search for `software engineer`
4. Refine to `in seattle`
5. Refine to `no senior roles`
6. Refine to `also no mid level`
7. **Reset** to `senior software engineer in seattle`
8. Refine to `make it remote`

This demonstrates new search, location refinement, exclude refinement, and semantic ranking.

## Approach

### How I processed and represented jobs data

- Read `jobs.jsonl` line-by-line to avoid loading raw JSON at once.
- **Validated data integrity using Zod** to ensure schema compliance for 1M+ records without memory bloat.
- Extracted a compact, search-focused job object (title, company, location, seniority, etc.) and discarded raw data to save memory.
- Loaded precomputed embeddings into **`Float32Array`** for memory-efficient vector operations. Missing vectors are filled with zero vectors.
- Built in-memory indices for fast filtering by workplace type, seniority, industry, etc.
- Cached the processed index via `v8.serialize` with **automatic timestamp validation** against the source file for fast, reliable startup.

Key files:
- `src/data-loader.js`
- `jobs.jsonl`
- `jobs.jsonl.idx.cache`

### How search works

1. **Intent extraction**: The user query + recent context is sent to a selectable intent model (`gpt-4o-mini` or `gpt-4o`) to extract filters and a semantic query. Some fallback heuristics catch missing negations.
2. **Conversation state**: Filters and semantic context are accumulated across turns with explicit refine vs new search logic.
3. **Filtering**: Index-based filtering narrows the candidate pool before semantic ranking.
4. **Semantic ranking**: The semantic query is embedded using `text-embedding-3-small`.
5. **Composite scoring**: Candidates are ranked using a weighted sum of explicit, inferred, and company embeddings.
6. **Thresholding**: If the best similarity is below a threshold, results are suppressed to avoid random matches.

```markdown
Key files:
- [`src/openai-client.js`](./src/openai-client.js)
- [`src/conversation-manager.js`](./src/conversation-manager.js)
- [`src/data-loader.js`](./src/data-loader.js)
- [`src/embeddings.js`](./src/embeddings.js)
- [`src/search.js`](./src/search.js)
```

### Relevance and ranking

Relevance is computed as a weighted composite cosine similarity:

```markdown
| Component | Weight |
| :--- | :--- |
| Explicit | `0.60` |
| Inferred | `0.25` |
| Company | `0.15` |
```

The system uses `minTopScore` thresholds to prevent weak matches. A slightly lower threshold is used when filters are active to avoid overly strict results on small candidate sets.

You can tune these in `src/search.js`:

- `minScore`
- `minTopScore`
- `minTopScoreFiltered`
- `scoreWeights`

### Trade-offs

- Using an LLM for intent parsing is flexible but occasionally brittle. I added deterministic heuristics to handle common negations.
- The full dataset is loaded in memory for speed. This is fast at 100k but not ideal for much larger datasets.
- Composite embedding ranking improves relevance, but adds compute cost compared to single-vector search.
- Filtering before ranking reduces cost but can miss semantic matches if filters are too strict.

### Queries that work well

- Role + location: `software engineer in seattle`
- Refinements: `make it remote`, `no senior roles`, `entry level`
- Company or industry: `data engineer at nonprofit`, `healthcare data analyst`

### Tricky queries

- Very vague queries: `something in tech`
- Very tight constraints: multiple excludes with low overlap
- Compound negations: `not senior, not mid, but also no startups`

### Improvements with more time

- Formal evaluation: build a small labeled query set and compare retrieval quality across `gpt-4o-mini` vs `gpt-4o`, plus threshold tuning based on measured precision/recall.
- Scalability: move embeddings and metadata into a persistent ANN index (FAISS/HNSW) and store filters in a columnar store or SQLite for fast pre-filtering beyond 100k.
- Runtime optimization: batch embedding calls, reuse query embeddings across turns, and cache intent parsing for repeated refinements.
- User persistence: store per-user preferences, prior refinements, and saved searches so returning users get personalized results without re-specifying constraints.
- Robust constraints: add explicit constraint grammar + multi-field negation logic (grouped NOT, "anything but X") with clearer explainability to the user.
- Retrieval mix: hybrid BM25 + embedding fusion with score calibration to handle sparse keywords and long-tail titles.
- Dynamic weighting: use the extracted intent to dynamically adjust scoring weights (e.g., boosting the `company_vector` if the user emphasizes company culture or mission).
- Geographic radius: utilize the `_geoloc` field to support "nearby" searches with a configurable mile/km radius instead of relying on exact city/state matches.
- Persistent reporting: migrate token tracking from local JSON files to a database (e.g., SQLite or PostgreSQL) for better multi-user scalability, easier aggregation, and historical auditability.
- Multi-provider support: abstract the AI client to support other providers (e.g., Anthropic Claude, Google Gemini) or local models (e.g., Llama via Ollama) to improve resilience and allow model-specific optimizations.
- Result pagination: implement a "load more" mechanism or paging system to allow users to navigate through the full set of relevant results beyond the initial top 5.

## Tokens Report

Token usage is tracked locally in `reports/tokens_report.YYYY-MM-DD.json` and printed with the `report` command during the CLI session.

**Total Report**:


```bash
# in the running CLI
report
```

**Report for a specific date**:

```bash
report YYYY-MM-DD
```

This prints total calls, total tokens, and estimated cost (for the given date if specified, otherwise for all time).
