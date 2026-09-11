# MindCanvas — V1 handoff

## Update 2026-09-11 — Selection, layers, groups, navigation and project management

This section supersedes older statements about missing multi-selection/layers or Enter-to-edit on mind-map nodes. See `EDITOR_WORKSPACE_UPGRADE_VI.md` for exact replacement files and deployment instructions.

- `editorCommands.ts` owns pure commands: legacy-compatible global layer order, normalized additions/deletions, multi-move/delete/duplicate/paste, flat groups, atomic layer movement, safe node reparenting, relative-node creation and fit viewport.
- `BoardState.layerOrder` stores bottom-to-top element IDs across every type. Old files retain their old visual stacking; new items append above existing items. `groups` stores flat sets of element IDs. `MindMapNode.parentId` preserves hierarchy for AI imports and subsequent edits. Existing JSON remains readable; import validates layer/group references.
- `CanvasBoard` supports marquee, Shift-click, Ctrl/Cmd+A/C/V/D/G/Shift+G, Delete, moving a multi-selection in one undo entry, front/back/step ordering in the inspector, and layer selection. Clipboard is editor-session memory (not OS clipboard or cross-project). Groups are flat; no nested groups or group resize/rotation.
- Mind maps: Tab creates a child; Enter creates a sibling; Shift+Enter/double-click edits. New relative nodes commit with their text in one operation; Escape cancels. Alt-drag a single node onto another reparents with cycle protection; direct node +/- controls collapse branches. Existing cross-links remain.
- `LayerStack.tsx` renders one global order; `CanvasNavigator.tsx` adds Fit canvas, Go to selection and a clickable minimap. Pan/zoom/fit retain the previous navigation-free Undo behavior.
- Workspace cards have favorites, rename, folder move, duplicate, soft trash and restore. `projectStore.updateProject` writes metadata only with explicit user filters and existing RLS; cloud failures are visible. Local guest metadata is stored under the existing owner-scoped cache. Duplicating a project copies its canvas, not PDF storage objects.
- Migration `supabase/migrations/0002_project_management.sql` is REQUIRED before deploying this frontend: adds `is_favorite` and `deleted_at` to notes, keeps all rows and RLS policies. No key/backend/provider changes for this slice. Cloud calls are not tested live and migration has not been applied to the user's account.
- Metadata mutations require successful flush before acting. Cloud content saves do not overwrite trash/favorite columns. Clean-cache merges accept remote metadata even when content timestamp is unchanged. Cross-device concurrent content remains last-write-wins, as before.
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
- Concurrent editing in different tabs/devices remains last-write-wins (no optimistic-locking/version conflict protocol yet).
- Recovering old cloud demo records is not automated: do not delete existing notes based on title alone.
- Raw service errors may remain in their original language; all application labels/forms/tooltips are bilingual.
- PDF extraction/provider limits remain as previously documented. No new OCR, paid fallback, sharing permissions or cloud infrastructure has been introduced.

See UPGRADE_WORKSPACE_VI.md for changed-file manifest, replacement and Git/Render steps.

## Mục tiêu hiện tại

MindCanvas là workspace học tập dạng infinite canvas: ghi chú, vẽ tự do, highlighter, hình cơ bản, connector và mind map có cấu trúc chỉnh sửa được. V1 ưu tiên PDF → graph editable, Google OAuth/Supabase persistence và autosave. Các phạm vi V2/V3 như flashcard, quiz, realtime collaboration, semantic search/RAG, handwriting OCR, analytics, tutor và presentation mode chưa được triển khai.

## Kiến trúc

```text
apps/web        React 19 + Vite + TypeScript
  ├─ App.tsx     Shell, toolbar, autosave, undo/redo, AI panel
  ├─ CanvasBoard Infinite canvas SVG foundation; nodes/edges follow drag
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
- Gemini: `GEMINI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
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

Chạy `DEPLOY_V1_VI.md` theo thứ tự: Supabase SQL → Google OAuth → local cloud test → Render API → Render frontend → cập nhật allow-list. Sau đó tách `boardReducer`/`historyReducer` và hoàn thiện repository/retry layer.
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
