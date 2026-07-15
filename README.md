# Nestly

Baby tracker PWA — susu, popok, tidur, tangis. Offline-first, responsive, siap agent (API key / MCP).

## Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS v4
- Dexie (IndexedDB lokal)
- Framer Motion + Phosphor icons
- Hono Agent API (port 8787)
- PWA installable

## Jalankan

```bash
npm install
npm run start
```

- UI: http://localhost:5173  
- Agent API: http://localhost:8787  

Lihat [docs/AGENT.md](docs/AGENT.md) untuk OpenClaw / Hermes / MCP.

## Fitur

- Quick log 1–2 tap (Susu / Popok / Tidur / Tangis)
- Estimasi nen berikutnya dari interval feeding
- Timeline + Insights 7 hari
- Export CSV ke spreadsheet
- Sync lokal ↔ Agent API via API key
