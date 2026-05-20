# AI Chat Plugin Tool

MVP AI chat tool built with React/Vite + Tailwind on the frontend and Node/Express on the backend.

## Features

- Streaming chat responses over SSE
- Conversation and message persistence in SQLite
- Provider-agnostic LLM adapter with OpenAI-compatible default
- **Cloudflare Vectorize RAG** — glossary, cases, and attachments (see [CLOUDFLARE_VECTORIZE.md](./CLOUDFLARE_VECTORIZE.md))
- Validation, rate limiting, and centralized error handling
- Tests for API routes, adapter behavior, and streaming parser

## Project structure

- `client/` React app with chat UI
- `server/` Express API with SQLite storage and LLM adapter

## Requirements

- Node.js 22.5+ (uses built-in `node:sqlite`, no native build tools needed)
- Cloudflare Account ID + API token (for Workers AI)

## Auth & deploy

See **[DEPLOY.md](./DEPLOY.md)** for:

- Enabling login (`AUTH_ENABLED`, email/password, session cookies)
- Docker single-container deploy
- Render blueprint with persistent SQLite disk
- Split API + static frontend (Cloudflare Pages)

## Run locally

1. Copy environment templates:
   - `server/.env.example` to `server/.env`
   - `client/.env.example` to `client/.env`
2. Set Cloudflare values in `server/.env`:
   - `CLOUDFLARE_ACCOUNT_ID` from Cloudflare dashboard → Workers AI
   - `CLOUDFLARE_API_TOKEN` from Cloudflare dashboard → My Profile → API Tokens
   - Never commit real tokens to git
3. Install dependencies:
   - `npm install`
4. Start both apps:
   - `npm run dev`

Client runs on `http://localhost:5173` and server on `http://localhost:3001`.

## CiA Assistant Chat (Phase 2 UI)

- Chat now matches the CiA demo layout (conversation + AI Insights sidebar)
- Each answer is reviewed against stored CI/CIA case data
- Rich in-chat blocks are generated from stored data:
  - Ci → CiA terminology comparison cards
  - CI vs CIA metric comparison bars
  - related case links
  - validation summaries
- Prompts, artifacts, and insights are saved in `messages.metadata`

## Dashboard (Phase 1)

1. Open app and go to **Dashboard** tab
2. Upload:
   - `sample-data/ci_cases.csv`
   - `sample-data/cia_cases.csv`
3. Review KPI cards, CI vs CIA comparison, hot topics, and likely resolutions
4. Switch to **AI Chat** and ask questions grounded in imported case data

## API

- `GET /health`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:conversationId`
- `DELETE /api/conversations/:conversationId`
- `POST /api/conversations/:conversationId/messages`
- `POST /api/chat` (SSE stream)
- `PATCH /api/messages/:messageId/feedback`
- `POST /api/import/ci`
- `POST /api/import/cia`
- `GET /api/analytics/summary`
- `GET /api/analytics/insights?q=...`

## Where things are stored

### Chat UI (frontend page)
- Main chat page: `client/src/pages/ChatPage.jsx`
- App entry point: `client/src/main.jsx`
- Chat UI components: `client/src/components/chat/*`

### Chat data (backend persistence)
- SQLite database file: `server/data/chat.db` (path set by `DB_PATH` in `server/.env`)
- DB schema/init: `server/src/db/client.js`
- Conversation/message queries: `server/src/db/repositories/conversationRepo.js`

Tables:
- `conversations` — thread list/titles
- `messages` — user/assistant messages + metadata (page context, feedback, AI insights)
- `user_preferences` — default response style settings
- `cases` — imported CI/CIA case records used for analytics and grounded chat

## Deployment notes

- Frontend: Vercel or Netlify
- Backend: Render, Railway, or Fly.io
- Persist SQLite file using mounted volume, or migrate to Postgres for multi-instance deployments
