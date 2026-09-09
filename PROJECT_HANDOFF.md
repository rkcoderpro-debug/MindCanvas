# MindCanvas — V1 handoff

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
- Sidebar workspace, folders placeholder, recent navigation, profile/auth state.
- Toolbar: select, text, pen, highlighter, rectangle, ellipse và connector.
- Pan canvas, zoom, drag node, double-click để đổi label, add child node, nối node bằng connector.
- Autosave localStorage với trạng thái `Đang lưu`, `Đã lưu`, `Offline · đã lưu trên máy`.
- PDF picker và API flow upload → extract text → provider router → structured graph preview → Apply vào canvas.
- Provider abstraction server-side; browser chỉ gọi API, không nhận provider key.
- Supabase migration cho profiles, folders, notes, documents, RLS và bucket `documents` private.
- Google OAuth client scaffolding và session listener; access token được gửi trong API requests.
- Cloud note sync: load note gần nhất và debounce autosave board vào `notes.content` khi user đã đăng nhập.
- PDF được upload trực tiếp vào Supabase Storage theo path `{user_id}/{document_id}.pdf`, đồng thời tạo record `documents`.
- Render Blueprint gồm API Node service và frontend static service.
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
- Nút folder/chia sẻ/cài đặt mới là shell UI; chưa có backend behavior.
- Connector hiện tạo edge khi click node đích sau khi chọn node nguồn; chưa có edge selection/delete UI.
- `ExperientialLabsProvider` dùng contract cấu hình `/v1/generate` làm adapter placeholder vì chưa có endpoint/model chính thức được cung cấp trong environment; không nên bật production nếu chưa xác minh contract.
- Chưa có credentials trong environment này, nên chưa claim Google OAuth, Supabase Storage, Experiential Labs hoặc Gemini live request đã chạy thành công.

## Next safe slice

Chạy `DEPLOY_V1_VI.md` theo thứ tự: Supabase SQL → Google OAuth → local cloud test → Render API → Render frontend → cập nhật allow-list. Sau đó tách `boardReducer`/`historyReducer` và hoàn thiện repository/retry layer.
