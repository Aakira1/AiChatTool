# Auth & deployment guide

## Authentication

The API supports **session cookies** (signed, httpOnly). When enabled, all `/api/*` routes except `/api/auth/login` require a valid session.

### Demo admin (quick start)

With `AUTH_ENABLED=true`:

| Field | Value |
|-------|--------|
| Email | `admin@demo.local` |
| Password | `Admin12345!` |

These are the server defaults if `AUTH_EMAIL` / `AUTH_PASSWORD` are not set. Use **Sign in as demo admin** on the login page.

### Local development (auth off)

No login screen:

```env
AUTH_ENABLED=false
```

### Enable auth locally

In `server/.env`:

```env
AUTH_ENABLED=true
AUTH_SECRET=use-a-random-string-at-least-32-characters-long
AUTH_EMAIL=you@company.com
AUTH_PASSWORD=YourSecurePassword123
CLIENT_ORIGIN=http://localhost:5173
```

Restart the server and sign in at the login screen.

### Production password hash (optional)

Instead of `AUTH_PASSWORD`, store only a hash:

```powershell
cd server
npm run hash-password -- "YourSecurePassword123"
```

Put the output in `AUTH_PASSWORD_HASH` and remove `AUTH_PASSWORD`.

---

## Deployment options

### Option A — Single Docker container (recommended)

Serves the built React app and API from one Node process.

```powershell
# From repo root
docker build -t t1-assistant .
docker run -p 3001:3001 --env-file server/.env -v t1-data:/app/server/data t1-assistant
```

Open `http://localhost:3001`.

**Production `.env` essentials:**

```env
NODE_ENV=production
PORT=3001
SERVE_CLIENT=true
TRUST_PROXY=true
COOKIE_SECURE=true
AUTH_ENABLED=true
AUTH_SECRET=<32+ random chars>
AUTH_EMAIL=<your email>
AUTH_PASSWORD=<strong password>
CLIENT_ORIGIN=https://your-app.onrender.com
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
DB_PATH=/app/server/data/chat.db
```

`CLIENT_ORIGIN` must match the public URL exactly (HTTPS, no trailing slash).

---

### Option B — Render (blueprint)

1. Push the repo to GitHub.
2. In Render: **New → Blueprint** → connect repo → use `render.yaml`.
3. Set sync secrets in the dashboard:
   - `CLIENT_ORIGIN` → your Render URL, e.g. `https://t1-cia-assistant.onrender.com`
   - `AUTH_EMAIL`, `AUTH_PASSWORD`
   - Cloudflare keys
4. Deploy. The persistent disk keeps the SQLite database.

---

### Option C — Split frontend + API

**API** — Docker or any Node host (Railway, Fly.io, VM) with `SERVE_CLIENT=false`.

**Frontend** — Cloudflare Pages / Netlify / static host:

Build with API URL:

```env
# client/.env.production
VITE_API_URL=https://api.your-domain.com
```

```powershell
npm run build -w client
```

Deploy `client/dist/`. Set `CLIENT_ORIGIN` on the API to your Pages URL (comma-separated if multiple).

---

## Health check

```http
GET /health
```

Returns `{ status: "ok", authEnabled: true|false }`.

---

## Security notes

- Always use **HTTPS** in production (`COOKIE_SECURE=true`).
- Rotate `AUTH_SECRET` if compromised — all sessions invalidate.
- Do not commit `server/.env` or real Cloudflare tokens.
- For Microsoft SSO / Entra ID, replace this login with an OAuth provider (next step).
