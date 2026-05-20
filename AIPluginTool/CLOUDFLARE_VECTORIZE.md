# Cloudflare Vectorize + Workers AI RAG

This app can ground chat answers in your Ci/CiA knowledge using **Workers AI embeddings** (`@cf/baai/bge-base-en-v1.5`, 768 dimensions) and **Vectorize** semantic search.

## 1. Create a Vectorize index

In the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Vectorize** → **Create index**:

| Setting | Value |
|---------|--------|
| Name | `cia-transition-kb` (or your choice) |
| Dimensions | **768** |
| Metric | **cosine** |

Wait until the index status is ready.

## 2. API token permissions

**My Profile → API Tokens** → create or edit a token with:

- **Workers AI** — Read
- **Vectorize** — Edit

Use the same token as `CLOUDFLARE_API_TOKEN` in `server/.env`.

## 3. Configure `server/.env`

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-token
VECTORIZE_ENABLED=true
VECTORIZE_INDEX_NAME=cia-transition-kb
CLOUDFLARE_EMBEDDING_MODEL=@cf/baai/bge-base-en-v1.5
RAG_TOP_K=8
```

`VECTORIZE_ENABLED` must be `true` only after the index exists. Chat works without it (keyword case search still runs).

Restart the server after changes.

## 4. Build the knowledge index

**Dashboard** → **Cloudflare knowledge** → **Rebuild knowledge index**

Or via API:

```http
POST /api/knowledge/rebuild
Content-Type: application/json

{ "importSamples": true }
```

This ingests:

- Ci → CiA **terminology glossary**
- All **imported CI/CIA cases** (loads sample CSVs into SQLite first if the DB is empty)
- **Chat attachments** are indexed automatically when users upload files

Vectors may take a few seconds to appear in queries after upsert.

## 5. Verify

```http
GET /api/knowledge/status
GET /health
```

`ragEnabled: true` when index name and Cloudflare credentials are set.

## How chat uses RAG

On each message, the server:

1. Embeds the user question
2. Queries Vectorize for top matches (terminology, cases, past attachments)
3. Injects snippets into the system prompt
4. Shows matches under **AI Insights → Sources**

CSV import also triggers a background re-index for that source (`ci` or `cia`).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No sources in insights | Run **Rebuild knowledge index**; confirm index dimensions = 768 |
| `Vectorize request failed` | Check index name, token permissions, account ID |
| `Embedding request failed` | Confirm Workers AI is enabled on the account |
| Low match quality | Import more cases; ask specific Ci/CiA terms |

## Optional: wrangler CLI bulk upload

```bash
npx wrangler vectorize insert cia-transition-kb --file=embeddings.ndjson
```

NDJSON format: one JSON object per line with `id`, `values`, and optional `metadata`.
