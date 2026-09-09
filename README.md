# MindCanvas

MindCanvas is a V1 study workspace for turning notes and PDFs into editable visual knowledge. This repository contains a React/Vite frontend, an Express server boundary for private AI/PDF operations, shared graph types, and Supabase migration scaffolding.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on Vite's default port and the API runs on `http://localhost:8787`. Without Supabase or AI credentials, the app intentionally stays in demo mode: canvas changes persist to the browser, and the sample graph can be edited locally.

See [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) for architecture, setup, credentials, current limits, and the next implementation slices.

Để cấu hình Supabase, Google OAuth và deploy hai service lên Render, làm theo [DEPLOY_V1_VI.md](./DEPLOY_V1_VI.md).
