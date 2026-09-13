# MindCanvas V4.2

MindCanvas is a visual study workspace for turning notes and private documents into editable canvases, mind maps and flashcards. V4.0 adds manually administered Free/Plus/Pro/Max plans, daily AI quotas reset at 12:00 Vietnam time, the separate 29,000₫/month AI Manual add-on, subscription history, per-account quota telemetry, a protected admin dashboard and Zalo-based upgrade requests without automatic payments or webhooks. V4.1 refines text editing, diagonal touchpad panning, connector feedback, remaining AI quota visibility, and the canvas navigator/zoom layout. V4.2 adds adaptive AI study plans, material-to-flashcard previews, deck expansion suggestions, ordered/random review, single-card flip/swipe sessions, forgotten-card retries, idempotent offline study events and streaks. V3.8 server-side AI file pipeline, responsive navigation, temporary theme previews, V3.7.1 media/resize work and the V3.5.1 shared Gemini reliability hotfix remain included. This repository contains a React/Vite frontend, an Express server boundary for private AI/document operations, shared graph types, and Supabase migration scaffolding.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on Vite's default port and the API runs on `http://localhost:8787`. Without Supabase credentials, the app intentionally uses a blank local canvas. With Supabase configured, projects, folders, notes and source documents are scoped to the signed-in user through RLS. `.doc`/`.ppt` legacy files are intentionally rejected; export them as `.docx`/`.pptx` first.

See [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) for architecture, setup, credentials, current limits, and the next implementation slices.

Để cấu hình Supabase, Google OAuth và deploy hai service lên Render, làm theo [DEPLOY_V1_VI.md](./DEPLOY_V1_VI.md).
