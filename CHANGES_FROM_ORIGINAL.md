# MindCanvas — Changes Compared with the Original Handoff

## Integrated release 2026-09-12 — V3.8.0

V3.8.0 adds the next maintained slice on top of the V3.7.1 media/resize release and the V3.5.1 shared Gemini reliability hotfix. It keeps the blank local canvas behavior and does not add demo projects or broad V2 features.

### AI sources and study outputs

- Added server-side parsing for PDF, DOCX, PPTX, TXT, Markdown, CSV, TSV and JSON sources.
- Added server-side multimodal image input for JPEG, PNG, WebP and GIF, including screenshots pasted from clipboard.
- Added one authenticated `/api/ai/file` route shared by editable mind-map and flashcard previews.
- Added clipboard paste controls to both AI flows and a common drag/drop file source UI.
- Preserved private source storage and the preview-before-Apply safety boundary.
- Legacy `.doc`/`.ppt` files show a clear conversion message instead of being misread.

### Navigation and UX

- Added a persistent desktop sidebar collapse/expand rail and keyboard shortcut.
- Added source-format guidance, file size feedback and separate image/document preview treatment.
- Updated PWA cache/release markers to V3.8.0.

### Tests

- Added document adapter tests for text, image, DOCX, PPTX and unsupported legacy Office files.
- Added inline-image Gemini request coverage, clipboard source tests and sidebar persistence coverage.

## Integrated release 2026-09-12 — V3.7.1

This change set is now merged into the maintained V3.7.1 codebase. It includes the V3.7 canvas media/embedding, rotation, opacity and Figma resize work below, while retaining the V3.5.1 shared Gemini reliability hotfix, PWA update behavior, cloud/offline project persistence and flashcards already present in the repository.

This file records the changes made compared with the original `mindcanvas-v1.rar` supplied at the beginning of the task.

## Canvas media and embeds

- Added image, video and audio insertion into the canvas.
- Added browser clipboard screenshot/image paste.
- Added microphone recording and insertion as an audio element.
- Added crop controls for images and videos.
- Added playback trim controls for audio and video.
- Added web-page embedding through iframe, YouTube embedding and direct-video playback.
- Embedded items support selection, movement, resizing, rotation, layers, duplicate, copy/paste, hide and lock.

## Rotation

- Added a numeric rotation-angle property in the inspector.
- Added reset rotation to `0°`.
- Kept the rotation handle on the canvas.
- Rotation is persisted and validated when boards are imported.

## Figma-style resizing

- Replaced the single bottom-right resize handle with eight handles: four corners and four side handles.
- Corner handles resize both width and height.
- Side handles resize only the corresponding axis while keeping the opposite edge fixed.
- Directional resizing works for individual and multi-element selections, including media and embeds.

## Alpha / opacity

- Added persisted opacity for nodes, shapes, text, drawings, media, embeds and connectors.
- Added a `0–100%` opacity slider and reset action in the inspector.
- Opacity is rendered on the canvas and included in SVG/PNG export.
- Added import validation for opacity values.

## Persistence, validation and tests

- Extended `BoardState` with media, embed, crop, trim, rotation and opacity data while keeping older boards compatible.
- Added validation for embed URLs, media crop/trim ranges and opacity values.
- Added regression tests for media, embeds, rotation, clipboard paste, directional resize handles and opacity.
- Latest verification: 92 frontend tests, 16 backend tests, workspace typecheck and production build pass.

## Local run command

The original local workflow is unchanged:

```bash
npm install
cp .env.example .env
npm run dev
```

## Changed files compared with the original archive

The changed-only RAR contains the original `mindcanvas-v1/` directory structure and only the files whose contents differ from the original archive. It excludes `.env`, `node_modules` and `dist`.

- `PROJECT_HANDOFF.md`
- `CHANGES_FROM_ORIGINAL.md`
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
