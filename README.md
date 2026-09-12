# MindCanvas V3.5

MindCanvas is a visual study workspace for turning notes and private PDFs into editable canvases, mind maps and flashcards. V3.5 adds an installable offline-capable PWA, durable IndexedDB project drafts with a visible sync queue, matching SVG/PNG export typography and wrapping, a scalable Elements panel, smart alignment guides and two-finger mobile zoom. This repository contains a React/Vite frontend, an Express server boundary for private AI/PDF operations, shared graph types, and Supabase migration scaffolding.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on Vite's default port and the API runs on `http://localhost:8787`. Without Supabase credentials, the app intentionally uses a blank local canvas. With Supabase configured, projects, folders, notes and PDFs are scoped to the signed-in user through RLS.

See [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) for architecture, setup, credentials, current limits, and the next implementation slices.

Để cấu hình Supabase, Google OAuth và deploy hai service lên Render, làm theo [DEPLOY_V1_VI.md](./DEPLOY_V1_VI.md).
