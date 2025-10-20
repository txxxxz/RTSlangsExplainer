# LinguaLens Monorepo

This workspace contains the Chrome extension and backend server scaffolding for **LinguaLens**, a subtitle slang explainer that returns a low-latency Quick Explain and a richer Deep Explain with cultural context.

## Structure

- `extension/` — Manifest V3 Chrome extension implemented with TypeScript + React, bundled via `tsup`. Contains content script (DOM + OCR detection), background worker (OpenAI + Deep orchestration), and options UI (API keys, cultural profiles, caching policy).
- `server/` — FastAPI application providing `/explain/quick`, `/explain/deep`, profile management, and collection ingest. Includes Redis cache adapters, OpenAI client, RAG retrieval helpers, online source adapters, and pytest suites.
- `ARCHITECTURE.md` — Additional implementation notes mapped to the PRD.

## Getting Started

### Extension

```bash
cd extension
npm install
npm run build
```

Load the generated `extension/dist` directory as an unpacked extension in Chrome. Populate your OpenAI (and optional LangGraph) keys through the options page before requesting explanations.

### Server

```bash
cd server
# python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --log-level debug
```

The server expects Redis at `redis://localhost:6379/0` and a populated Chroma/FAISS index under `./data/vector`. Use `python scripts/build_index.py data/slang.json` to ingest datasets.

### Custom Models

- Manage model API credentials and generation preferences from the in-player settings drawer (`Models` tab). Configurations are stored in SQLite (`data/profiles.db`) via the FastAPI backend.
- Backend endpoints: `GET /models`, `POST /models`, `POST /models/default`, and `DELETE /models/{id}` for CRUD + default selection.
- The FastAPI OpenAI client automatically falls back to the persisted default model (base URL, API key, and tuning parameters) when request headers do not provide overrides.

Run tests with:

```bash
pytest
```

### End-to-end Tests

The extension ships with a lightweight Playwright harness that exercises the content script with mocked `chrome.runtime` messaging:

```bash
cd extension
npm run build          # ensure dist/ exists for the test harness
npm run test:e2e
```

## Next Steps

- Surface profile switching inside the overlay UI so viewers can swap cultural perspectives without opening the options page.
- Stream sections from the FastAPI backend to the extension using incremental OpenAI responses (e.g., SSE + partial LLM output) instead of post-processing a full completion.
- Extend OCR heuristics with per-site configuration fetched from the backend so updates can ship without redeploying the extension.
- Expand Playwright coverage with scenarios that mock failing APIs and profile-specific caching to guard against regressions.
