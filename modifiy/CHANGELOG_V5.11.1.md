# MindCanvas v5.11.1

## Fixed

- Cloud flashcard reads and writes no longer fail when the browser cannot write the local `localStorage` cache because its quota is full.
- Latest flashcard cache values remain available in memory for the active session when browser storage rejects a write.
- Offline-only flashcard saves report a storage-full error instead of returning a false success.
- Service Worker cache key updated to `mindcanvas-shell-v5.11.1` so the PWA can activate the patched application shell.

## Database

- No Supabase schema, RLS policy, or migration changes.
