# Dashboard sample data (Ci / CiA)

Use these files to populate the **TechnologyOne Analytics Dashboard** and ground the AI assistant on imported case history.

## Files

| File | Upload button | Purpose |
|------|---------------|---------|
| `ci_cases.csv` | **Upload CI CSV** | Legacy **Ci** case system export |
| `cia_cases.csv` | **Upload CIA CSV** | Target **CiA** case system export |

Upload **both** files for full CI vs CIA comparisons (open cases, search reliability, hot topics, charts).

## How to import

1. Run the app: `npm run dev`
2. Open **Dashboard** in the navbar
3. Click **Upload CI CSV** and choose `sample-data/ci_cases.csv`
4. Click **Upload CIA CSV** and choose `sample-data/cia_cases.csv`
5. Click **Refresh** if metrics do not update immediately

Each upload **replaces** all rows for that source (CI or CIA). Re-uploading the same file is safe.

## CSV format

Required columns:

- `case_id` — unique case reference (e.g. `CI-1001`, `CIA-2001`)
- `status` — `open` or `closed`

Optional columns (recommended for richer analytics):

| Column | Description | Example |
|--------|-------------|---------|
| `created_at` | Case opened date (`YYYY-MM-DD`) | `2026-05-01` |
| `resolved_at` | Case closed date (empty if open) | `2026-05-03` |
| `search_term` | What the user searched for | `rate qualifier mapping` |
| `resolution` | How the case was resolved | `Mapped legacy rate qualifier to CiA levy` |
| `search_success` | `true` / `false` (or `1` / `0`, `yes` / `no`) | `true` |
| `topic` | Grouping for hot topics | `rates and levies` |

### Example row (Ci)

```csv
case_id,status,created_at,resolved_at,search_term,resolution,search_success,topic
CI-1009,closed,2026-05-03,2026-05-04,"rate qualifier to levy mapping","Mapped legacy rate qualifier to CiA levy structure",true,rates and levies
```

### Example row (CiA)

```csv
case_id,status,created_at,resolved_at,search_term,resolution,search_success,topic
CIA-2011,closed,2026-05-04,2026-05-05,"rate qualifier equivalent levy","Documented Ci equivalent for legacy rate qualifier",true,rates and levies
```

## What the dashboard shows

After both files are imported:

- Open case counts (CI vs CIA)
- Search reliability percentages
- Open cases and reliability **deltas**
- Volume-by-day bar chart
- **Hot topics** — most common values in `search_term` (falls back to `topic` if search is empty)
- Likely resolutions from closed cases

### Hot topics → Assistant quick prompts

The **Popular searches** chips under the chat input are built from the same hot-topic ranking as the dashboard (top 5). Each chip shows the search term and count, e.g. `Rate Qualifier (8)`.

Use consistent `search_term` values in your CSV exports so related cases group together:

| search_term (examples in sample files) | Typical count after import |
|----------------------------------------|----------------------------|
| `rate qualifier` | Highest |
| `charge control` | High |
| `cdd draft` | High |
| `billing issue` | Medium |
| `password reset` | Lower |

Re-open the **Assistant** tab after importing CSVs so chips refresh from the latest data.

**Chat questions** also feed popular searches: each message stores a `searchPhrase`, and recent chat terms are merged with import hot topics (💬 = chat, 📊 = imports).

### Document attachments in chat

Attach up to **3** text files per message (`.txt`, `.csv`, `.md`, `.json`) using the 📎 button. The AI receives full file content for that turn and analyzes it alongside CI/CIA case data.

The **Assistant** tab uses the same imported data when answering questions about cases, terminology, and metrics.

## Creating your own export

1. Export from your case tool as CSV (UTF-8).
2. Rename headers to match the table above (spaces become underscores, e.g. `Case ID` → `case_id`).
3. Keep one header row and at least one data row.
4. Use separate files for Ci and CiA; do not mix sources in one file.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Missing required CSV column` | Ensure `case_id` and `status` exist in the header row |
| `CSV must include a header row...` | File needs header + at least one data line |
| Import error / DB error | Restart the server after pulling latest code (imports use SQLite transactions) |
| Empty dashboard | Upload both CI and CIA files, then click **Refresh** |
