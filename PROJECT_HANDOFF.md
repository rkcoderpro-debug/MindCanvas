# MindCanvas — project handoff

## Update 2026-09-12 — V3.8.0 AI Sources, Clipboard & Collapsible Navigation (latest)

### Implemented

- Added a single authenticated `POST /api/ai/file` route for mind-map and flashcard generation from text documents, Office Open XML documents and images.
- Supported inputs: PDF, DOCX, PPTX, TXT, Markdown, CSV, TSV, JSON, JPEG, PNG, WebP and GIF. DOCX/PPTX are parsed server-side from their XML entries; PDF keeps controlled `[PAGE n]` markers; images are passed to Gemini as inline multimodal input.
- Added clipboard source handling in both AI panels. Text is pasted into the source field; copied screenshots become an image source. File picker and drag-and-drop share the same accepted-format/size guard.
- Kept the editable-preview contract for both generated graph and flashcards: AI output is not applied until the user reviews and applies it. Uploaded source files are saved through the existing private Supabase Storage flow after a successful preview.
- Added a persisted desktop sidebar collapse state with `Ctrl/⌘+Shift+B`; the collapsed rail keeps icon actions available and mobile menu behavior remains separate.
- Bumped the API release and PWA shell cache to `3.8.0` so installed clients can receive the new source pipeline.

### Architecture and deployment

- `apps/server/src/document.ts` is the format adapter boundary. It deliberately rejects legacy `.doc`/`.ppt`; Google Docs/Slides should be downloaded as `.docx`/`.pptx` before upload. The Office parser is dependency-free and bounded to avoid adding a runtime ZIP package for this slice.
- `apps/server/src/index.ts` owns multipart validation/auth and routes both AI tasks through the existing scheduler/provider abstraction. No Gemini secret is read by the browser.
- `apps/web/src/lib/aiSource.ts` owns clipboard/file-source normalization; `apps/web/src/lib/api.ts` owns the authenticated file request; `AiPanel.tsx` and `FlashcardsPage.tsx` own preview UX.
- No Supabase migration or new environment variable is required. Redeploy both Render services because the API route and web UI changed. `/api/health` reports release `3.8.0`.
- Local verification for this release covers the document adapters, Gemini inline-image request, clipboard normalization, sidebar persistence and the existing V3.7.1/V3.5.1 regression suites. Production Gemini quota, Google OAuth, Supabase Storage and physical-device clipboard permissions still require post-deploy QA.

### Known limits and next slice

- Office extraction currently preserves readable text and slide/page markers, not tables, images, speaker notes or exact layout. PDF scan/OCR and richer DOCX/PPTX structure remain future work.
- `navigator.clipboard.read()` may require a user gesture and browser permission; the UI keeps a text-area fallback.
- Large binary sources are bounded by the existing 10 MB upload limit. A later storage-first upload path can raise this without exposing provider keys.

### Changed files in V3.8.0

- `apps/server/src/document.ts`
- `apps/server/src/gemini.ts`
- `apps/server/src/providers.ts`
- `apps/server/src/flashcards.ts`
- `apps/server/src/index.ts`
- `apps/server/tests/document.test.ts`
- `apps/server/tests/gemini.test.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/aiSource.ts`
- `apps/web/src/lib/aiSource.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/components/AiPanel.tsx`
- `apps/web/src/components/FlashcardsPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/styles.css`
- `apps/web/public/sw.js`
- `README.md`
- `DEPLOY_V1_VI.md`
- `CHANGES_FROM_ORIGINAL.md`
- `V3_8_AI_SOURCES_NAV_VI.md`

## Update 2026-09-12 — V3.7.1 Media, Figma Resize & Shared AI Reliability (latest)

### Implemented

- Merged the supplied V3.7 change set into the maintained V3.5.1 codebase. Canvas elements now include self-contained image/video/audio media and validated web/YouTube/video embeds.
- Added file picker, drag-and-drop media, clipboard screenshot paste and browser microphone recording. Media is persisted in the board JSON as data URLs so project export/import remains self-contained.
- Added media crop, audio/video trim, rotation and persisted opacity. The inspector exposes these properties and the same values are rendered in the editor and SVG/PNG export.
- Replaced the single resize handle with eight Figma-style handles. Corner and side resizing work for individual and multi-element selections; opposite edges remain fixed for side handles.
- Extended layer ordering, group/ungroup, duplicate, copy/paste, hide/lock, thumbnails, search and selection to include media and embeds. Existing boards missing the new arrays are normalized to empty arrays.
- Retained the V3.5.1 Gemini scheduler/retry/fallback hotfix and PWA cache update. Media is frontend-only; no new Supabase migration or secret is required.

### Architecture and deployment

- `packages/shared/src/index.ts` is the persisted schema boundary; `apps/web/src/lib/board.ts` validates geometry/data URLs and owns portable SVG/PNG serialization.
- `apps/web/src/components/CanvasBoard.tsx` owns media/embed creation and playback UI. `apps/web/src/lib/editorCommands.ts` owns pure resize/layer/duplicate commands. `LayerStack` continues to render all element kinds in persisted order.
- Media files are intentionally bounded at 12 MB and embedded in board JSON. This keeps `.mindcanvas.json` portable but can make large projects heavy; cloud storage references can be introduced in a later slice without changing the editor element contract.
- No Supabase migration is required for V3.7.1. Deploy the API first if taking the combined package, then deploy the web service and update an installed PWA. The API health endpoint remains release `3.5.1`; the visible web badge is `V3.7.1` because the media release is frontend/shared-model work.
- Local verification passed TypeScript and production builds, 94 frontend tests and 22 backend tests (116 total). Live Gemini quota, Render, Supabase sessions/storage and physical-device media permission behavior still require production QA.

### Changed files in V3.7.1 integration

- `CHANGES_FROM_ORIGINAL.md`
- `V3_7_MEDIA_ROTATION_ALPHA_VI.md`
- `README.md`
- `DEPLOY_V1_VI.md`
- `packages/shared/src/index.ts`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/components/CanvasBoard.test.tsx`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/components/ElementsPanel.tsx`
- `apps/web/src/components/WorkspaceHome.tsx`
- `apps/web/src/lib/board.ts`
- `apps/web/src/lib/board.test.ts`
- `apps/web/src/lib/canvasClipboard.ts`
- `apps/web/src/lib/editorCommands.ts`
- `apps/web/src/lib/editorCommands.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/styles.css`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/public/sw.js`

The server files and AI tests from the V3.5.1 section below remain part of the combined release package.

## Update 2026-09-12 — V3.5.1 Shared AI Reliability

### Implemented

- Fixed the cross-account AI failure mode shown on mobile. The request had already passed Supabase auth and reached Gemini; the failure sequence was upstream `503`, timeout and a final unavailable-model `404`, not a Google OAuth or browser CORS failure.
- Added bounded transient retries with exponential backoff and jitter for `408`, `429`, `5xx`, network failures and timeouts. A model is retried before fallback, while `403`/other client errors and safety blocks still stop immediately.
- Changed provider cooldown semantics: `404` is cached for five minutes, `429` honors shared-project `Retry-After`, and one `503` no longer disables the model for the next user's request.
- Added `AiScheduler`, a process-local FIFO capacity gate. The API runs at most two AI tasks concurrently, at most one active task per account, at most two queued tasks per account and 20 queued tasks globally. A full/expired queue returns retryable `429 AI_BUSY` instead of hanging.
- Added a 120-second bounded fallback deadline and reserves time for later models so early slow models cannot consume the entire chain. Production values are configurable without code changes.
- Replaced long model-by-model browser errors with typed API errors and concise Vietnamese/English guidance for shared capacity, queue saturation, invalid model configuration and expired sessions.
- Extended `/api/health` with safe release/config diagnostics (`release`, `aiConfigured`, `aiModelCount`, `aiCapacity`) and changed the visible web badge to `V3.5.1`. No credential, document text or provider body is exposed.
- Bumped the PWA shell cache to V3.5.1 and disabled HTTP-cache reuse for service-worker update checks so installed clients receive the hotfix instead of remaining on the V3.5 bundle.
- Added the officially listed `gemini-2.5-flash-lite` as an explicit final fallback in examples. No paid provider, alternate key, demo output or automatic billing path was added.

### Architecture and deployment

- `apps/server/src/gemini.ts` owns provider retry/fallback/cooldown behavior; `apps/server/src/aiScheduler.ts` owns cross-user process capacity and queue fairness. All three AI routes pass through the scheduler.
- `apps/web/src/lib/api.ts` preserves safe error metadata; `apps/web/src/lib/aiErrors.ts` maps it to localized UI copy without dumping diagnostic chains on small screens.
- New server configuration: `GEMINI_RETRIES_PER_MODEL`, `GEMINI_TOTAL_TIMEOUT_MS`, `GEMINI_RETRY_BASE_MS`, `AI_MAX_CONCURRENT`, `AI_MAX_QUEUE`, `AI_MAX_QUEUE_PER_USER`, and `AI_QUEUE_TIMEOUT_MS`. Defaults are production-safe and mirrored in `.env.example`/`render.yaml`.
- No Supabase migration is required. Redeploy `mindcanvas-api` first, verify `/api/health` reports release `3.5.1` and `aiConfigured=true`, then redeploy `mindcanvas-web` and accept the PWA update.
- Local verification passed frontend/server TypeScript and production builds, 86 frontend tests and 22 backend tests (108 total). Tests cover retry/backoff, fallback, cooldown isolation, queue fairness/capacity and localized error mapping. Live Gemini quota, Render concurrency, Supabase sessions and two physical accounts still require post-deploy QA with production credentials.
- The hotfix improves transient reliability but cannot make one free Gemini project quota unlimited. Sustained `AI_UNAVAILABLE` across users still requires checking project quota/capacity rather than adding browser-side keys.

### Changed files

- `.env.example`
- `render.yaml`
- `apps/server/src/aiScheduler.ts`
- `apps/server/src/config.ts`
- `apps/server/src/gemini.ts`
- `apps/server/src/providers.ts`
- `apps/server/src/flashcards.ts`
- `apps/server/src/selection.ts`
- `apps/server/src/index.ts`
- `apps/server/tests/aiScheduler.test.ts`
- `apps/server/tests/gemini.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/public/sw.js`
- `apps/web/src/components/AiPanel.tsx`
- `apps/web/src/components/AiSelectionPanel.tsx`
- `apps/web/src/components/FlashcardsPage.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/aiErrors.ts`
- `apps/web/src/lib/aiErrors.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/pwa.ts`
- `apps/web/src/styles.css`
- `README.md`
- `DEPLOY_V1_VI.md`
- `V3_5_PWA_EXPORT_LAYERS_VI.md`
- `V3_5_1_SHARED_AI_RELIABILITY_VI.md`
- `PROJECT_HANDOFF.md`

## Update 2026-09-12 — V3.5 Offline PWA & Export/Layers

### Implemented

- Added an installable PWA manifest, adaptive app icons and a production service worker. The worker caches the deployed Vite shell, discovers fingerprinted JS/CSS assets, provides an offline navigation fallback and exposes an in-app update prompt.
- Added an owner-scoped IndexedDB project cache alongside localStorage. Writes remain immediately available in memory, large drafts survive localStorage quota failures, cached projects hydrate before remote fetch, and pending edits retry when connectivity returns.
- Added a bilingual Sync Center showing connection state, device/cloud mode and every pending project. The topbar save status now opens this truthful queue instead of being a passive label.
- Rebuilt SVG/PNG export around one self-contained renderer: active theme colors, canvas paper style, explicit portable sans-serif font stack, wrapped/clipped node and connector labels, rich-text formatting, source pages, dark-fill contrast and the persisted global layer order. PNG is rasterized from the same SVG at a bounded high resolution, so the two formats no longer diverge.
- Replaced the overflowing inspector layer list with a fixed-row Elements panel. It has independent scrolling, stable truncation, search, count, type/group metadata, selected/hidden states, direct lock/visibility controls and drag-to-reorder without splitting groups.
- Added optional smart alignment guides while dragging. Grid and nearby left/center/right/top/middle/bottom anchors are resolved by a pure tested command and rendered as non-scaling guide lines.
- Added two-finger pinch zoom around the gesture midpoint on touch devices. The gesture commits once and remains a viewport-only change, so it does not pollute document Undo history.
- Updated the visible version badge and tests to `V3.5`. No sample project, demo flashcard or browser-side provider secret was added.

### Architecture and deployment

- `apps/web/public/sw.js` and `manifest.webmanifest` own PWA/offline shell behavior; `lib/pwa.ts` owns install/update browser events.
- `lib/offlineProjectCache.ts` is the IndexedDB adapter. `lib/projectStore.ts` keeps cache normalization and pending flags authoritative; `useWorkspace.ts` hydrates the device cache before cloud reconciliation.
- `lib/board.ts` owns both SVG and PNG rendering. Export files never depend on editor-only `foreignObject` layout or unresolved CSS variables.
- `components/ElementsPanel.tsx` and `components/SyncCenter.tsx` isolate the new inspector and persistence UI. `lib/editorCommands.ts` keeps layer movement and smart snapping pure/testable.
- V3.5 is frontend-only: no Supabase migration, backend route or environment variable was added. Redeploy `mindcanvas-web`. Existing migrations `0001` through `0005` remain required for all prior cloud features.
- Local verification passed frontend/server TypeScript and production builds, 84 frontend tests and 16 backend tests (100 total). The production bundle contains the manifest, service worker, all three app icons and both fingerprinted JS/CSS assets discovered by the offline shell. The SVG renderer was also parsed as XML and visually rasterized with wrapped Vietnamese labels. Live Render, Supabase, Google OAuth, Gemini, service-worker installation and physical-device offline behavior still require production credentials/device QA.

### Changed files

- `apps/web/index.html`
- `apps/web/public/favicon.svg`
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/sw.js`
- `apps/web/public/icons/mindcanvas-192.png`
- `apps/web/public/icons/mindcanvas-512.png`
- `apps/web/public/icons/mindcanvas-maskable-512.png`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/components/CanvasBoard.test.tsx`
- `apps/web/src/components/ElementsPanel.test.tsx`
- `apps/web/src/components/ElementsPanel.tsx`
- `apps/web/src/components/SyncCenter.tsx`
- `apps/web/src/hooks/useWorkspace.ts`
- `apps/web/src/lib/board.ts`
- `apps/web/src/lib/board.test.ts`
- `apps/web/src/lib/editorCommands.ts`
- `apps/web/src/lib/editorCommands.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/offlineProjectCache.ts`
- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/lib/pwa.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `README.md`
- `DEPLOY_V1_VI.md`
- `V3_5_PWA_EXPORT_LAYERS_VI.md`
- `PROJECT_HANDOFF.md`

## Update 2026-09-11 — V3.4 Smart Study Canvas

### Implemented

- Fixed the canvas navigation defect at the rendering boundary. The paper pattern and every canvas element now derive from the same persisted viewport (`x`, `y`, `scale`), so Hand/touch pan and zoom move the visual paper together with its content. Navigation still does not create document Undo entries.
- Added six persisted canvas paper styles: dots, square grid, ruled notebook paper, graph paper, isometric grid and blank. Old boards default safely to dots; workspace thumbnails and SVG/PNG exports reflect the selected paper style.
- Added direct rich-text properties for canvas text: bold, italic, underline, left/center/right alignment, bullet/checklist toggles and removable text background color. These values are part of the validated board JSON and cloud autosave.
- Added contextual AI for selected canvas text/mind-map nodes: summarize, explain, rewrite or expand into editable child nodes. The authenticated server endpoint validates bounded input/output, uses the existing Gemini model fallback, and never exposes the API key to Vite/browser code. Results always have a preview/edit step before Apply.
- Hardened protected backend routes to fail closed when Supabase authentication is missing. The active and legacy Gemini provider paths now share the header-based key transport and validated model-fallback runner, avoiding API keys in request URLs.
- Added global quick search/actions with `Ctrl/⌘ + K`. It searches project titles plus cached canvas text, node labels and connector labels, and opens projects or common actions without inserting demo data.
- Upgraded copy/paste to an OS-clipboard envelope with a safe in-session fallback. Elements can be copied, another project opened, then pasted with fresh IDs and increasing offsets; invalid or oversized clipboard data is rejected.
- Preserved PDF provenance on generated mind-map nodes and added private signed-URL source viewing at the referenced page. Flashcards linked to a project can also open the latest private source PDF page.
- Hardened AI flashcard Apply to one multi-row Supabase upsert instead of sequential writes, with complete-batch local fallback. Added card search, Due/New/Difficult/Learned launch modes, review-session progress and a persisted per-browser daily goal.
- Updated the visible badge to `V3.4`; all new UI has Vietnamese/English parity and mobile-responsive styling.

### Architecture and deployment

- `components/CanvasBackground.tsx` is the only interactive background renderer. It draws screen-space SVG patterns whose offsets and spacing are calculated from the board viewport; `CanvasBoard` no longer relies on a fixed CSS grid.
- `lib/board.ts` owns background/rich-text validation, export and pure contextual-AI Apply operations. Shared persisted types live in `packages/shared/src/index.ts`.
- `components/AiSelectionPanel.tsx` and `apps/server/src/selection.ts` own the contextual-AI preview and validated Gemini request. The API route is `POST /api/ai/selection` and is protected by the existing Supabase bearer-session middleware.
- `components/CommandPalette.tsx` owns cached-content search. `lib/canvasClipboard.ts` owns cross-project clipboard serialization and validation.
- No new Supabase migration or environment variable was added. Existing migrations `0001` through `0005` remain required. Because V3.4 adds a server route, redeploy both `mindcanvas-api` and `mindcanvas-web`. Keep `GEMINI_API_KEY` and `GEMINI_MODELS` only on the API service.
- Local verification: frontend/server TypeScript and production builds passed; 78 frontend tests and 16 backend tests passed (94 total). Live Supabase, Google OAuth, Gemini, Render and physical-device behavior still require production credentials/device QA. The managed browser preview could not start because its isolated frontend root could not see the workspace-level Vite install; build/component interaction checks remain green.

### Changed files

- `packages/shared/src/index.ts`
- `apps/server/src/index.ts`
- `apps/server/src/auth.ts`
- `apps/server/src/providers.ts`
- `apps/server/src/selection.ts`
- `apps/server/tests/auth.test.ts`
- `apps/server/tests/selection.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/components/AiPanel.tsx`
- `apps/web/src/components/AiSelectionPanel.tsx`
- `apps/web/src/components/CanvasBackground.tsx`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/components/CanvasBoard.test.tsx`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/components/FlashcardsPage.tsx`
- `apps/web/src/components/SourceDocumentPanel.tsx`
- `apps/web/src/components/WorkspaceHome.tsx`
- `apps/web/src/hooks/useFlashcards.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/board.ts`
- `apps/web/src/lib/board.test.ts`
- `apps/web/src/lib/canvasClipboard.ts`
- `apps/web/src/lib/canvasClipboard.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/lib/projectStore.test.ts`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/styles.css`
- `render.yaml`
- `README.md`
- `DEPLOY_V1_VI.md`
- `V3_4_SMART_STUDY_CANVAS_VI.md`
- `PROJECT_HANDOFF.md`

## Update 2026-09-11 — V3.3.1 Expanded Themes & Motion

### Implemented

- Expanded the persisted theme catalog from 5 to 10, balanced into five light and five dark themes. Existing IDs remain compatible.
- Added cool-color choices: Ocean Breeze and Mint Frost for light mode; Cobalt Night, Cyber Teal and Nordic Slate for dark mode. Aurora, Sunset, Berry, Midnight and Emerald remain available.
- Grouped the visual Settings picker and compact sidebar selector into Light themes / Dark themes. Every new theme has complete app, surface, canvas, status, editor and new-element palette tokens.
- Added restrained interaction motion: button press/hover feedback, active navigation icon, staggered project cards, page/content entrance, dialog/backdrop, project menu, theme selection check, error notice, saving status, flashcard answer, mobile navigation and inspector sheet.
- Motion does not animate the background continuously and does not change canvas data. `prefers-reduced-motion: reduce` disables animation/transition durations globally.
- Updated the visible badge to `V3.3.1` and the pre-React theme bootstrap list in `index.html`.

### Verification and deployment

- Core text/background and primary-button contrast for all 10 themes exceeds 5:1; required semantic token coverage was checked for every theme.
- V3.3.1 is frontend-only: no Supabase migration, backend change, environment variable or credential change. Redeploy only `mindcanvas-web`.
- Local TypeScript, frontend/server production builds, 69 frontend tests and 13 backend regression tests pass. Live Render, OAuth/Supabase/Gemini and physical-device visual QA still require the production environment.

### Changed files

- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/components/ThemePicker.tsx`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/theme.ts`
- `apps/web/src/lib/theme.test.ts`
- `apps/web/src/styles.css`
- `DEPLOY_V1_VI.md`
- `V3_3_1_EXPANDED_THEMES_MOTION_VI.md`
- `PROJECT_HANDOFF.md`

## Update 2026-09-11 — V3.3 Vibrant Themes

### Implemented

- Replaced the old two-color override with a reusable semantic token system covering the app background, surfaces, canvas, controls, borders, text, status colors, shadows and editor chrome.
- Added five persisted themes: Aurora Light, Midnight Dark, Sunset Coral, Emerald Forest and Berry Pop. Liquid Glass is not present.
- Added a visual, keyboard-accessible theme picker in Settings and kept a compact five-theme selector in the sidebar/mobile menu. Changes apply immediately and persist in `mindcanvas:theme`.
- Added an early theme bootstrap in `index.html` to reduce the wrong-theme flash during reload, and synchronize the browser `theme-color` metadata after a change.
- Removed the remaining dark-theme-only CSS patches by making project cards, folder manager, dialogs, AI/PDF panels, flashcards, conflict/error states, toolbar, inspector, minimap and mobile controls consume the same theme tokens.
- Canvas selection, connectors, handles and new-element colors now follow the active palette. Existing custom element colors remain data, while legacy default canvas text adapts for readability. Node labels calculate light/dark contrast from their fill.
- Updated the visible app badge to `V3.3`. No sample content, Liquid Glass animation or service credential was added.

### Architecture and deployment

- `lib/theme.ts` is the source of truth for theme IDs, validation, browser colors and new-canvas palettes.
- `components/ThemePicker.tsx` owns the visual selector; `lib/i18n.tsx` owns persistence/application and bilingual labels; `styles.css` owns semantic CSS tokens.
- V3.3 is frontend-only. It requires no Supabase migration, backend change or new environment variable. Redeploy only `mindcanvas-web` after pushing the changed files.
- Local verification covers TypeScript, production builds, 69 frontend tests and 13 backend regression tests. Live Render/Supabase/OAuth/Gemini and physical-device visual QA still require the production environment.

### Changed files

- `apps/web/index.html`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/components/CanvasNavigator.tsx`
- `apps/web/src/components/ThemePicker.tsx`
- `apps/web/src/components/WorkspaceHome.tsx`
- `apps/web/src/lib/color.ts`
- `apps/web/src/lib/color.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/theme.ts`
- `apps/web/src/lib/theme.test.ts`
- `apps/web/src/styles.css`
- `DEPLOY_V1_VI.md`
- `V3_3_VIBRANT_THEMES_VI.md`
- `PROJECT_HANDOFF.md`

## Update 2026-09-11 — V3.2.1 Mobile Cloud Sync Hotfix

### Fixed

- Fixed the false `PROJECT_CONFLICT` that appeared after consecutive cloud saves. The local cache now advances to the revision returned by Supabase after every successful save, including when a newer edit arrives while an older snapshot is in flight.
- `stage()` reads the acknowledged revision from the owner-scoped cache instead of relying on potentially stale React summary state.
- Viewport-only cross-device changes can rebase automatically. A real content/folder conflict pauses autosave and opens an explicit recovery dialog: use latest cloud, save the device copy as a new project, or intentionally overwrite cloud.
- Recovery actions create checkpoints before replacing a version. The local pending copy remains intact while a conflict is unresolved.
- Google OAuth now explicitly persists/refreshes sessions and requests the Google account chooser, making account switching on mobile easier to verify. The mobile account panel displays the signed-in email.
- Reworked the phone layout: compact app header, horizontal navigation/actions, scrollable single-row drawing toolbar, touch-sized controls, one-finger empty-canvas pan, hidden mobile minimap and a bottom-sheet properties panel.
- Updated the visible app badge to `V3.2.1`.

### Changed files

- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/hooks/useWorkspace.ts`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/CloudConflictDialog.tsx`
- `apps/web/src/components/Dialog.tsx`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/projectStore.test.ts`
- `apps/web/src/hooks/useWorkspace.test.tsx`
- `apps/web/src/components/CanvasBoard.test.tsx`
- `DEPLOY_V1_VI.md`
- `V3_2_1_MOBILE_CLOUD_FIX_VI.md`
- `PROJECT_HANDOFF.md`

### Deployment

- This is a frontend-only runtime change. Redeploy `mindcanvas-web`; no backend environment variable changed.
- No new migration was added. `0004_note_revision_lock.sql` must already be applied for revision-safe cloud saves, and `0005_flashcards.sql` remains required for cloud flashcards.
- Live Supabase/Google OAuth/Render and physical-device QA still require the user's production credentials and devices.

## Update 2026-09-11 — V3.2 AI Flashcards

### Implemented

- Added `/api/ai/flashcards`, protected by the existing server-side Supabase session boundary.
- Gemini generation accepts source text, a selected project canvas, or a PDF. PDF input uses the existing server extraction endpoint and private document storage flow.
- AI returns a bounded structured preview (`title` plus up to 50 cards). The server trims/validates fields, removes duplicate question/answer pairs, validates source pages and never falls back to demo cards.
- Flashcards UI now has Generate with AI → editable preview → Apply to deck. Users can edit the title, question, answer and source page, remove generated cards or add a preview card before applying.
- Reused the existing Gemini model priority/cooldown behavior. `GEMINI_MODELS` can hold a comma-separated priority list; `GEMINI_API_KEY`, model configuration and provider calls remain server-only.
- Refactored the Gemini JSON request runner so mind-map and flashcard generation share timeout, model fallback, safety-block and controlled-error handling.

### Changed files

- `apps/server/src/gemini.ts`
- `apps/server/src/flashcards.ts`
- `apps/server/src/index.ts`
- `apps/server/tests/flashcards.test.ts`
- `apps/server/package.json`
- `apps/web/src/lib/api.ts`
- `apps/web/src/components/FlashcardsPage.tsx`
- `apps/web/src/hooks/useFlashcards.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/styles.css`
- `.env.example`
- `DEPLOY_V1_VI.md`
- `package.json`
- `PROJECT_HANDOFF.md`
- `V3_2_AI_FLASHCARDS_VI.md`

### Verification and deployment

- V3.2 requires both services to redeploy because `apps/server` now exposes `/api/ai/flashcards`; the existing `0005_flashcards.sql` migration is still required for cloud persistence.
- Set `GEMINI_API_KEY` and optionally `GEMINI_MODELS` only on `mindcanvas-api`. Do not add either to frontend `VITE_*` variables or Git.
- Local typecheck/build and frontend/server tests are run before handoff. Live Gemini, Supabase, Google OAuth and Render were not tested from this workspace.
- If AI generation fails, the user keeps the existing deck unchanged because cards are only written after preview approval.

### Known limits

- AI source text is bounded at 120,000 characters and generated output at 50 cards. The project source currently includes readable text, mind-map labels and labeled connectors; shapes without text are not meaningful AI input.
- Historical V3.2 limit: the first Apply implementation wrote cards one by one. V3.4 supersedes this with a single multi-row cloud upsert and complete-batch local fallback.
- AI-generated cards are not automatically scheduled as reviewed; new cards remain due immediately and follow the V3.1 scheduler after review.

## Update 2026-09-11 — V3.1 Flashcards MVP

### Implemented

- Added a first-class Flashcards workspace in the sidebar. It starts empty and never injects sample decks/cards.
- Added deck CRUD: create, rename and delete, with an optional link to an existing user-owned project/folder.
- Added card CRUD through accessible in-app dialogs: question, answer and optional source page. No browser `prompt`/`alert` is used.
- Added a basic review loop with four ratings: Again, Hard, Good and Easy. Review metadata (`due_at`, interval, ease, repetitions and lapses) is stored with each card.
- Added owner-scoped local fallback/cache and Supabase persistence. The UI shows Cloud or On this device so a missing migration/network does not masquerade as cloud sync.
- Added bilingual Vietnamese/English labels and dark-theme coverage for the flashcard workspace.

### Architecture and setup

- `components/FlashcardsPage.tsx`: deck list, card list, CRUD dialogs and review UI.
- `hooks/useFlashcards.ts`: lifecycle, selected deck, CRUD and review actions.
- `lib/flashcards.ts`: portable types plus deterministic review scheduler; no network or React dependency.
- `lib/projectStore.ts`: owner-scoped cache and Supabase repository for `flashcard_decks` and `flashcards`.
- `supabase/migrations/0005_flashcards.sql`: tables, indexes, ownership checks and RLS policies.
- No server/API/provider environment variable changed in V3.1. AI-generated flashcards from PDF/mind-map are deliberately a later slice after this data contract is proven.

### Verification and limitations

- `npm run typecheck --offline`, `npm run build --offline`, and `npm test --offline` pass locally; the suite has 60 tests.
- Live Supabase migration, Google OAuth, Gemini, Render and browser/device QA were not run from this workspace.
- Apply migration `0005_flashcards.sql` in the same Supabase project before expecting cloud decks/cards. Until then, signed-in fallback data is local and is labeled as such.
- The MVP scheduler is intentionally simple. It does not include quiz modes, analytics, AI generation, spaced-repetition history charts, sharing, collaboration or RAG.

### Changed files

- `apps/web/src/App.tsx`
- `apps/web/src/components/FlashcardsPage.tsx`
- `apps/web/src/hooks/useFlashcards.ts`
- `apps/web/src/lib/flashcards.ts`
- `apps/web/src/lib/flashcards.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/App.test.tsx`
- `apps/web/src/styles.css`
- `supabase/migrations/0005_flashcards.sql`
- `PROJECT_HANDOFF.md`
- `V3_1_FLASHCARDS_MVP_VI.md`

## Update 2026-09-11 — Selection, layers, groups, navigation and project management

This section supersedes older statements about missing multi-selection/layers or Enter-to-edit on mind-map nodes. See `EDITOR_WORKSPACE_UPGRADE_VI.md` for exact replacement files and deployment instructions.

- `editorCommands.ts` owns pure commands: legacy-compatible global layer order, normalized additions/deletions, multi-move/delete/duplicate/paste, flat groups, atomic layer movement, safe node reparenting, relative-node creation and fit viewport.
- `BoardState.layerOrder` stores bottom-to-top element IDs across every type. Old files retain their old visual stacking; new items append above existing items. `groups` stores flat sets of element IDs. `MindMapNode.parentId` preserves hierarchy for AI imports and subsequent edits. Existing JSON remains readable; import validates layer/group references.
- `CanvasBoard` supports marquee, Shift-click, Ctrl/Cmd+A/C/V/D/G/Shift+G, Delete, moving a multi-selection in one undo entry, front/back/step ordering in the inspector, and layer selection. This slice originally used editor-session clipboard only; V3.4 supersedes it with OS clipboard plus cross-project session fallback. Groups remain flat; no nested groups or group resize/rotation.
- Mind maps: Tab creates a child; Enter creates a sibling; Shift+Enter/double-click edits. New relative nodes commit with their text in one operation; Escape cancels. Alt-drag a single node onto another reparents with cycle protection; direct node +/- controls collapse branches. Existing cross-links remain.
- `LayerStack.tsx` renders one global order; `CanvasNavigator.tsx` adds Fit canvas, Go to selection and a clickable minimap. Pan/zoom/fit retain the previous navigation-free Undo behavior.
- Workspace cards have favorites, rename, folder move, duplicate, soft trash and restore. `projectStore.updateProject` writes metadata only with explicit user filters and existing RLS; cloud failures are visible. Local guest metadata is stored under the existing owner-scoped cache. Duplicating a project copies its canvas, not PDF storage objects.
- Migration `supabase/migrations/0002_project_management.sql` is REQUIRED before deploying this frontend: adds `is_favorite` and `deleted_at` to notes, keeps all rows and RLS policies. No key/backend/provider changes for this slice. Cloud calls are not tested live and migration has not been applied to the user's account.
- Metadata mutations require successful flush before acting. Cloud content saves do not overwrite trash/favorite columns. Clean-cache merges accept remote metadata even when content timestamp is unchanged. The older last-write-wins behavior described in this slice was superseded by V3.0 revision locking and the V3.2.1 recovery UI.
- No permanent deletion, PDF preview, exported images/PDF, nested groups, multi-resize or persistent version history in this slice. Those were not in the approved scope.
- Validation uses TypeScript/build and local unit/component tests with jsdom/mocked cloud calls; no real Render/Supabase account or browser QA performed.

## Update 2026-09-09 — Workspace + editable elements (authoritative for this slice)

This section supersedes older shell/demo UI descriptions below.

### Implemented

- Workspace is a real home view with owned project cards, last-edited sorting, search, folder filtering and reopen.
- No blank project is auto-created just by visiting the dashboard. No sample/demo notes are loaded.
- New project/folder and move flows use styled native HTML dialogs (focus trapping, Escape, form validation), never browser prompt/alert.
- Project title edits inline. Double-click text/node (or press Enter with selection) to edit on canvas.
- Text, shapes, nodes and individual strokes can be selected, dragged, resized via bottom-right handle, nudged, duplicated and deleted.
- Connections can link nodes or shapes and follow endpoints. Removing an endpoint removes its connections.
- Inspector changes position/size/color, text font size, stroke width/opacity; layers list selects items. Node branches collapse/expand.
- Drawing prevents native text selection; only the active textarea allows selecting text. Pointer capture + cancel handling prevent stray strokes. One drag/draw commits once for undo.
- Vietnamese/English UI dictionary, persisted language preference and document lang. Existing project titles/content are never translated automatically.
- Download/import versioned .mindcanvas.json files (10 MB input bound, graph/geometry validation, new project ID on import).
- AI preview labels editable before Apply; Apply remaps IDs and places new graph after existing content. Existing title/content preserved, undo supported. Demo-provider responses are explicitly rejected in UI.
- PDF upload retains private Supabase Storage and now sets documents.note_id.

### Architecture and safety

- App.tsx: auth boundary (preserves working OAuth), per-user keyed workspace, navigation/forms.
- components/WorkspaceHome.tsx: dashboard cards and search; preview uses available cached data, uncached cloud projects show file icon until opened.
- components/CanvasBoard.tsx: pointer gestures, inline editing, toolbar/inspector and shortcuts.
- components/Dialog.tsx / AiPanel.tsx: accessible form shell and cancellable AI workflow.
- lib/i18n.tsx: bilingual UI only; lib/board.ts: pure geometry, selection, graph and file operations.
- lib/projectStore.ts: user-scoped local drafts + Supabase repository, explicit user filters in addition to existing RLS, serial save queue.
- hooks/useWorkspace.ts: latest board ref, bounded undo history, flush before navigation, account isolation, exact-snapshot acknowledgement, retry on reconnection, unload warning for unsynced edits.
- Existing notes.content JSON remains compatible. Optional text height/fontSize/color fields added to shared types. No new SQL migration or dependency required.
- Local v3 caches keyed by user ID; migrate only v2 per-user/guest board. Never read shared v1 demo key; no existing user data is deleted.
- Legacy v2 snapshots are never automatically replayed to cloud: older board.id could differ from notes.id. Keep old browser storage untouched, reopen the authoritative cloud record. Only v3 pending drafts auto-sync.
- API/provider credentials never appear in this patch. Auth listener is synchronous, no nested Supabase calls.

### Verified vs pending

- npm run typecheck, npm run build, npm test passed (27 meaningful tests).
- Tests cover pure geometry, cache isolation, queue ordering/errors, stale-save acknowledgement, home/create/open/undo, form UI, language, first node, drag commit, draw cancellation and inline edit cancellation.
- Component/hook tests run in jsdom, not a real browser. Live OAuth, Supabase RLS/storage, AI generation and Render deployment require the user's environment and were NOT end-to-end tested here.
- The live website could not be retrieved from this environment. Existing successful OAuth behavior was preserved instead of changing client IDs/redirects.
- No .git directory in this working copy; no GitHub commit/push or Render deployment was performed.

### Remaining limitations

- Single-element selection only; not full Figma parity (no multi-select, rotation, custom layer ordering, realtime collaboration).
- Cross-device cloud cards show file icons until opened; preview only renders up to 40 elements per type.
- LocalStorage capacity is browser-dependent. A quota/error is shown and navigation is blocked if the current board cannot be cached. Export JSON for a portable backup.
- This older slice originally used last-write-wins across tabs/devices; V3.0 and V3.2.1 supersede it with revision checks, safe viewport rebasing and explicit conflict recovery.
- Recovering old cloud demo records is not automated: do not delete existing notes based on title alone.
- Raw service errors may remain in their original language; all application labels/forms/tooltips are bilingual.
- PDF extraction/provider limits remain as previously documented. No new OCR, paid fallback, sharing permissions or cloud infrastructure has been introduced.

See UPGRADE_WORKSPACE_VI.md for changed-file manifest, replacement and Git/Render steps.

## Mục tiêu hiện tại

MindCanvas là workspace học tập dạng infinite canvas: ghi chú, vẽ tự do, highlighter, hình cơ bản, connector và mind map có cấu trúc chỉnh sửa được. V1 ưu tiên PDF → graph editable, Google OAuth/Supabase persistence và autosave. V3.1 đã thêm flashcard CRUD và ôn tập cơ bản; quiz, realtime collaboration, semantic search/RAG, handwriting OCR, analytics, tutor và presentation mode vẫn chưa nằm trong phạm vi.

## Kiến trúc

```text
apps/web        React 19 + Vite + TypeScript
  ├─ App.tsx     Shell, toolbar, autosave, undo/redo, AI panel
  ├─ CanvasBoard Infinite canvas SVG foundation; nodes/edges follow drag
  ├─ FlashcardsPage Flashcard deck/card CRUD and basic review workspace
  └─ lib/        Supabase browser client và API client

apps/server     Express + TypeScript
  ├─ auth.ts     Server-side Supabase bearer-session validation boundary
  ├─ pdf.ts      PDF text extraction adapter
  ├─ providers.ts Provider interface + Experiential Labs → Gemini → demo router
  └─ index.ts    Health, PDF upload và structured mind-map endpoints

packages/shared Shared canvas, graph, viewport và provider types
supabase/       Postgres tables, RLS và private documents Storage policies
```

Canvas data không được flatten thành ảnh. `BoardState` giữ text, drawings, shapes, nodes, edges và viewport riêng; edge lấy vị trí node ở mỗi render nên tự bám khi node di chuyển. Undo/redo hiện hoạt động ở frontend cho các thay đổi canvas và thao tác Apply graph.

## Đã hoàn thành trong V1 hiện tại

- UI desktop-first theo hướng Notion/Excalidraw/XMind: light surface, navy text, indigo accent, dot-grid.
- Sidebar workspace, user-scoped folders/projects, recent navigation, profile/auth state and logout.
- Toolbar: select, text, pen, highlighter, rectangle, ellipse và connector.
- Pan canvas, zoom, drag node, double-click để đổi label, add child node, nối node bằng connector.
- Autosave localStorage với trạng thái `Đang lưu`, `Đã lưu`, `Offline · đã lưu trên máy`.
- PDF picker và API flow upload → extract text → provider router → structured graph preview → Apply vào canvas.
- Provider abstraction server-side; browser chỉ gọi API, không nhận provider key.
- Supabase migration cho profiles, folders, notes, documents, RLS và bucket `documents` private.
- Google OAuth client scaffolding và session listener; access token được gửi trong API requests.
- Cloud note sync: load note gần nhất theo RLS và debounce autosave board vào `notes.content` khi user đã đăng nhập.
- Blank-canvas start: không còn `demoBoard`/folder hard-code; mỗi user có local key riêng, project mới và mở project từ `notes`.
- Project/folder actions: tạo project trắng, mở project, tạo folder, lọc theo folder, di chuyển project, copy link và xem cài đặt.
- PDF được upload trực tiếp vào Supabase Storage theo path `{user_id}/{document_id}.pdf`, đồng thời tạo record `documents`.
- Render Blueprint gồm API Node service; frontend deploy riêng bằng Render Static Site vì Blueprint parser hiện không nhận `type: static`.
- Demo mode hiển thị rõ khi credentials chưa có; live cloud cần chạy checklist trong `DEPLOY_V1_VI.md`.
- V3.1 Flashcards MVP: bộ thẻ/thẻ học theo user, liên kết project tùy chọn, review Again/Hard/Good/Easy, local fallback và migration RLS riêng.

## Chưa hoàn thành / việc tiếp theo

1. Chạy migration và cấu hình OAuth/Render theo `DEPLOY_V1_VI.md` với project Supabase thật.
2. Tách repository layer rõ hơn cho folders/notes/boards/documents và thêm retry/backoff khi autosave cloud lỗi.
3. Thêm preview graph dạng mini-map, validate graph bằng schema chặt hơn, chống duplicate node và giữ source-page metadata.
4. Hoàn thiện thao tác collapse branch, resize/edit text trực tiếp và keyboard shortcuts.
5. Xác minh contract API chính thức của Experiential Labs khi có endpoint/model cụ thể; hiện adapter không tự giả định endpoint ngoài giá trị env.
6. Thêm test component/integration cho reducer/history, graph validation, provider fallback và upload size/type limits.

## Environment variables

Xem `.env.example`. Các biến `VITE_*` được phép đi vào browser: Supabase URL/anon key và API base URL. Các biến provider, model và Supabase server boundary không có prefix `VITE_`, không được đưa vào frontend bundle.

- Supabase: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, server `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
- Experiential Labs: `EXPERIENTIAL_LABS_BASE_URL`, `EXPERIENTIAL_LABS_API_KEY`, `EXPERIENTIAL_LABS_MODEL`.
- Gemini: `GEMINI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, optional priority list `GEMINI_MODELS`.
- Model mặc định hiện tại: `gemini-3.6-flash`; có thể đổi bằng `GEMINI_MODEL` mà không sửa code.
- Giới hạn: `MAX_DOCUMENT_BYTES` mặc định 10 MB.

Không điền credentials vào git, `.env.example`, hoặc client code. Fallback Gemini chỉ chạy khi `GEMINI_API_KEY` được cấu hình rõ ràng; khi không có provider nào, demo provider tạo graph local.

## Setup và chạy

```bash
npm install
cp .env.example .env
npm run dev
```

- Web: `npm run dev:web` (Vite, mặc định `5173`).
- API: `npm run dev:server` (`8787`).
- Production checks: `npm run typecheck`, `npm run build`, `npm test`.
- Supabase: chạy `supabase/migrations/0001_mindcanvas.sql` trong SQL editor hoặc Supabase CLI sau khi tạo project.

## Quyết định và trade-off

- Chọn SVG canvas tự quản lý thay vì ghép nhiều engine canvas ở V1: đủ rõ để giữ node/edge/drawing trong một model, dễ kiểm thử và không khóa vào license/pricing chưa xác minh. Có thể thay implementation bằng engine chuyên dụng sau khi data contract ổn định.
- Express boundary được tách khỏi Vite để secrets và PDF/AI work luôn server-side; frontend chỉ nhận publishable/anon Supabase key.
- PDF extraction hiện dùng `pdf-parse` và giới hạn text trước khi đưa vào provider. Page references phụ thuộc text extractor/provider; không bịa page nếu nguồn không có.
- Demo mode là fallback có chủ đích, không giả vờ rằng cloud auth, storage hay live AI đã được test khi chưa có credentials.

## Known issues

- Khi frontend deploy trên Render, `VITE_*` phải được set trước build vì chúng được bake vào static bundle.
- Chia sẻ hiện copy URL; quyền chia sẻ project đa tài khoản chưa triển khai và vẫn được bảo vệ bởi RLS.
- Connector hiện tạo edge khi click node đích sau khi chọn node nguồn; chưa có edge selection/delete UI.
- `ExperientialLabsProvider` dùng endpoint OpenAI-compatible `https://api.experientiallabs.ai/v1/chat/completions`; model phải là model ID có trong catalog Experiential.
- Chưa có credentials trong environment này, nên chưa claim Google OAuth, Supabase Storage, Experiential Labs hoặc Gemini live request đã chạy thành công.

## Next safe slice

Chạy `DEPLOY_V1_VI.md` theo thứ tự: Supabase SQL → Google OAuth → local cloud test → Render API → Render frontend → cập nhật allow-list. Với V3.1, chạy thêm `supabase/migrations/0005_flashcards.sql`, kiểm tra tạo deck/card sau khi đăng nhập, rồi mới làm AI-generated flashcards ở slice kế tiếp.
# UPDATE — 2026-09-11: Folder management and theme cleanup

- Folder management now supports local/cloud rename and delete; deleting a folder moves its projects to Workspace.
- Projects are draggable from the home grid into a folder, or onto Workspace to remove folder assignment.
- Liquid Glass was removed. The supported themes are Light and Dark; accent color is now a warmer purple.
- Dark theme coverage was expanded across workspace surfaces, cards, dialogs, controls and empty states.
- No Gemini, OAuth, server API or Supabase migration changes were made in this update.

# UPDATE — 2026-09-11: Folder manager and folder-aware projects

- Creating a project while a folder is selected now stores that folder ID.
- Sidebar folders show a compact canvas dropdown; the folder name still opens the complete folder view.
- Added `FolderManager.tsx` with file-style selection, copy, paste, duplicate, move, rename and trash actions.
- Dragging a project onto a folder or Workspace updates its folder assignment.

# UPDATE — 2026-09-11: V2.1 Editor Pro

- Added backward-compatible optional element fields: `rotation`, `locked`, and `hidden`.
- Added multi-element resize, rotation handle, align/distribute commands, optional grid snap, and lock/hide controls.
- Canvas rendering and layer list now respect element visibility and rotation.
- Added editor command coverage; current frontend test suite has 53 passing tests.
- V2.1 intentionally does not include sharing, realtime collaboration, version history, or flashcards; those remain later V2 phases.

# UPDATE — 2026-09-11: V2.2 AI Document Workspace

- PDF extraction now adds controlled `[PAGE n]` markers on the server for source-aware graph generation.
- AI panel includes browser PDF preview, page range selection, selected-range regeneration, editable graph preview, and Apply-to-current/new-canvas choice.
- Applying to the current canvas remains one undoable editor change; creating a new canvas persists a separate project.
- Backend and frontend both require redeployment for the new PDF flow. No new Supabase migration or environment variable is required.
- Scan-only PDFs still need OCR in a future phase; this update retains the existing text-based PDF limit.

# UPDATE — 2026-09-11: V2.3 Version History and Recovery

- Added explicit project checkpoints. Autosave continues to persist the current board, but pan/zoom and ordinary autosave cycles do not create extra history entries.
- Added a Version History dialog from the editor top bar. Users can create a stable checkpoint and restore it without stepping through many Undo actions.
- Restore creates a checkpoint of the current state first and then applies the selected snapshot as one undoable canvas change.
- Added owner-scoped local checkpoint storage for guest/offline mode and a Supabase `note_versions` table migration for cloud history.
- Apply `supabase/migrations/0003_note_versions.sql` before expecting cloud version history. If it is not applied or the network is unavailable, the UI falls back to local checkpoints and marks their source.
- No Gemini, OAuth, PDF extraction or provider environment variable changes were made in V2.3.
- Live Supabase/Render integration and migration execution were not tested from this workspace.

# UPDATE — 2026-09-11: V2.4 Save Checkpoint Shortcut

- The editor Save button now flushes the current board and creates a version checkpoint, so normal manual saves are immediately available in Version History.
- The Version History dialog remains available for loading, restoring and creating additional checkpoints.
- The UI badge is now `V2.4`; no backend, Gemini, OAuth or new migration changes were made beyond the V2.3 `note_versions` migration.

# UPDATE — 2026-09-11: V3.0 Production Core

- Added SVG and PNG canvas export. Export uses the current layer order, hidden elements, rotations, connectors and connector labels; JSON export remains the portable editable backup.
- Connector labels are now visible on canvas and editable from the inspector. Existing connector selection/delete behavior remains intact.
- Added optimistic note revision checks when `notes.revision` exists. A stale cloud save returns a conflict error instead of overwriting a newer tab/device revision. Projects opened before the migration retain the legacy save path until revision metadata is available.
- Added `supabase/migrations/0004_note_revision_lock.sql` for the additive `notes.revision` column.
- No Gemini, OAuth, PDF, flashcard, RAG, tutor, analytics or realtime collaboration changes were made in this slice.
