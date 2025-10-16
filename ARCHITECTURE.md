# LinguaLens Architecture Overview

## Repository Layout

- `extension/` — Chrome Extension (Manifest v3) implemented with TypeScript and React. Bundled via `tsup` to emit background/content/option scripts individually.
  - `src/`
    - `content/` — Subtitle detection, OCR fallback, in-page overlay UI, and messaging with background worker.
    - `background/` — Service worker handling OpenAI/Deep Explain orchestration, caching policy, and storage for auth keys.
    - `options/` — Options page for managing API keys, cultural profiles, and feature toggles.
    - `shared/` — Reusable models, messaging contracts, and utility helpers (IndexedDB cache, timers, telemetry stubs).
  - `manifest.json` — MV3 definition with minimal permissions (`activeTab`, `scripting`, `storage`).
  - `tsconfig*.json`, `package.json` — TypeScript and build configuration.

- `server/` — FastAPI backend powering Deep Explain, profile management, and collection ingest.
  - `app/`
    - `main.py` — App entry point, wiring routers, middleware, and Redis connection lifecycle.
    - `routes/` — FastAPI routers for `/explain/quick`, `/explain/deep`, `/profiles`, `/collections`.
    - `core/` — Configuration, logging, dependency injection primitives.
    - `services/` — Business logic (LLM client, RAG pipeline, profile composer, caching adapters).
    - `schemas/` — Pydantic models shared by routers & services.
    - `workers/` — Background task definitions for precomputing hot-line explanations.
  - `scripts/` — CLI helpers for building RAG indices (FAISS/Chroma) and seeding collections.
  - `tests/` — Pytest suites for evidence merging, caching policy, and profile switching behaviour.
  - `requirements.txt` / `pyproject.toml` — Python dependencies.

## Data & Control Flow

1. **Content Script**
   - Observes subtitle DOM nodes; if confidence < threshold (missing text, off-DOM), triggers OCR via `Tesseract.js` using inline canvas snapshots.
   - Pushes detected lines to background worker via `chrome.runtime.sendMessage`.
   - Renders Quick Explain overlay and deep-dive drawer using React + portals injected into page.

2. **Background Worker**
   - Validates API key presence; routes Quick Explain requests directly to OpenAI `gpt-4o-mini`.
   - Maintains IndexedDB-backed cache for Quick results (`content`), Redis-backed cache for Deep results (coordinated with server responses) and request state tracking.
   - Offloads Deep Explain requests to backend (`/explain/deep`) and streams incremental sections to content script.

3. **Server Backend**
   - `POST /explain/quick`: Optional pass-through for thin clients; reuses caching and merges local knowledge base hits before returning (mirrors client schema).
   - `POST /explain/deep`: Orchestrates RAG retrieval (FAISS/Chroma) + online adapters (Urban Dictionary, Wikipedia), composes final five-part response with sources and confidence labels.
   - `GET/PUT /profiles`: Persist and retrieve up to three cultural profile templates per user.
   - `POST /collections`: Ingest curated slang datasets into vector store and metadata DB.
   - Background worker precomputes cultural variants for hot lines and publishes to Redis cache for low-latency delivery.

4. **Caching Strategy**
   - **Client**: IndexedDB for per-page Quick Explain cache; sync metadata with background; expire entries via LRU + TTL per profile.
   - **Server**: Redis stores request envelopes, job statuses, and hydrated Deep Explain payloads keyed by `(subtitle_line, profile_id)`.
   - **Vector Store**: FAISS or Chroma indexes built offline via `scripts/build_index.py`.

## Testing Focus

- **Unit**: Evidence merge logic (ensuring deterministic ordering of sources), caching policy enforcement, profile switching (ensuring correct culture variant).
- **Integration (future)**: End-to-end Quick/Deep flows using Playwright + pytest-httpx mocks.

## Permissions & Security

- Extension requests minimal scopes: `storage`, `activeTab`, `scripting`, `alarms`.
- API keys stored with `chrome.storage.sync` (encrypted at rest by browser); user may opt-in to LangGraph orchestrations.
- All network interactions respect target site ToS; OCR executes locally, no raw frames transmitted.
