# Nestly Agent / MCP Guide

Nestly menyimpan data lokal di IndexedDB (cepat & offline). Agent API (Hono) di port `8787` dipakai OpenClaw, Hermes, atau MCP supaya bisa catat tanpa buka UI.

## 1. Jalankan

```bash
# Terminal 1 — UI
npm run dev

# Terminal 2 — Agent API
npm run api

# Atau keduanya
npm run start
```

Saat API pertama kali jalan, key dicetak di terminal dan disimpan di `data/store.json`.

Paste key yang sama ke **Settings → Agent API** di app, lalu tap **Sync sekarang**.

Atau set env:

```bash
NESTLY_API_KEY=nst_your_key_here npm run api
```

## 2. Auth

Semua endpoint (kecuali `/api/health` dan `/api/tools`) butuh:

```http
Authorization: Bearer <API_KEY>
```

## 3. Endpoints

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/api/health` | Cek server hidup |
| GET | `/api/tools` | Daftar tool untuk agent |
| GET | `/api/events` | Semua event aktif |
| POST | `/api/events` | Catat 1 event |
| POST | `/api/events/sync` | Merge bulk dari app |
| GET | `/api/summary/today` | Ringkasan hari ini |
| GET | `/api/next-feed` | Estimasi nen berikutnya |

### Contoh catat susu

```bash
curl -X POST http://localhost:8787/api/events \
  -H "Authorization: Bearer $NESTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"feed","ml":90,"feedKind":"formula"}'
```

### Contoh catat tangis

```bash
curl -X POST http://localhost:8787/api/events \
  -H "Authorization: Bearer $NESTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"cry","cryCause":"hungry","soothedHow":"gendong","soothedOk":true}'
```

`cryCause`: `hungry` | `diaper` | `gas` | `sleepy` | `overstim` | `unknown`  
`diaperKind`: `wet` | `dirty` | `both`  
`feedKind`: `formula` | `breast_left` | `breast_right` | `breast_both`

## 4. MCP tool mapping

Buat MCP server tipis yang wrap HTTP di atas:

| Tool | Call |
|------|------|
| `log_feed` | `POST /api/events` `{type:"feed", ml, feedKind?}` |
| `log_diaper` | `POST /api/events` `{type:"diaper", diaperKind}` |
| `log_cry` | `POST /api/events` `{type:"cry", cryCause, ...}` |
| `log_sleep` | `POST /api/events` `{type:"sleep"}` |
| `get_today_summary` | `GET /api/summary/today` |
| `when_is_next_feed` | `GET /api/next-feed` |

Prompt agent contoh: *"Bayi baru minum 90ml formula"* → panggil `log_feed`.

## 5. Spreadsheet

Di Settings → **Export CSV**. Import ke Google Sheets sebagai backup/database manusia-readable.

## 6. Flow data

```
UI (Dexie IndexedDB)  ←→  Sync  ←→  Agent API (data/store.json)
                                      ↑
                               OpenClaw / Hermes / MCP
```
