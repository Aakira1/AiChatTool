# OneChat Cloudflare Worker

Standalone backend for the OneChat Chrome extension — no local server needed.

## Setup

```bash
cd worker
npm install
```

## Deploy

```bash
npx wrangler login
npx wrangler deploy
```

After deploying, Wrangler prints a URL like `https://cia-assistant.yourname.workers.dev`.

## Configure the extension

1. Open the extension → Settings (bottom nav)
2. Set **API base URL** to your Worker URL
3. Optionally set an **Auth token** (see below)
4. Save and reload the extension

## Optional: Auth token

Add a secret so only your extension can call the Worker:

```bash
npx wrangler secret put AUTH_TOKEN
# enter a random token, e.g. a UUID
```

Then paste the same token into Settings → Auth token in the extension.

## Atlassian (Jira/Confluence)

In standalone mode, Atlassian connectors use Basic Auth (email + API token) stored locally in the extension — no OAuth app setup needed. Configure them via the extension's Options page.

## Development

```bash
npx wrangler dev
# local URL: http://localhost:8787
```

Set the extension's API URL to `http://localhost:8787` while developing.
