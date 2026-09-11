# MindCanvas V3.4 — Smart Study Canvas

## Kết quả chính

V3.4 sửa dứt điểm cảm giác “chữ trượt trên tờ giấy đứng yên”. Nền chấm/lưới/kẻ ngang giờ được render bằng SVG theo đúng `viewport.x`, `viewport.y` và `viewport.scale` của project. Khi dùng Hand, touch pan, wheel hoặc zoom, pattern và element luôn đi cùng một hệ tọa độ; tọa độ thật của element không bị đổi chỉ vì di chuyển góc nhìn.

Các phần nâng cấp đi kèm:

- 6 nền canvas được lưu theo project: Chấm, Ô lưới, Giấy kẻ ngang, Giấy đồ thị, Lưới phối cảnh và Trắng.
- Rich text trực tiếp cho text element: đậm, nghiêng, gạch chân, căn lề, bullet, checklist và màu nền chữ.
- `Ctrl/⌘ + K` tìm theo tên project lẫn nội dung text/node/connector đã cache, đồng thời mở nhanh Project mới, Flashcard, Cài đặt hoặc Import.
- Copy/paste element qua project bằng clipboard hệ điều hành; nếu trình duyệt không cấp quyền clipboard thì vẫn hoạt động trong phiên tab hiện tại.
- AI theo vùng chọn: Tóm tắt, Giải thích, Viết lại hoặc Mở rộng thành nhánh mind map; luôn Preview → sửa → Apply.
- API PDF/AI từ chối request nếu backend thiếu cấu hình Supabase thay vì tự cấp danh tính demo; Gemini key chỉ được gửi trong header ở phía server.
- Node do PDF sinh ra giữ mã tài liệu/trang nguồn và có thể mở PDF private bằng signed URL ngay trong ứng dụng.
- Flashcards có tìm kiếm, thống kê Due/New/Difficult/Learned, các chế độ ôn tương ứng, tiến độ phiên học, mục tiêu ngày và Apply AI theo một batch.

## File cần thay thế/thêm

### Shared và backend

- `packages/shared/src/index.ts`
- `apps/server/src/index.ts`
- `apps/server/src/auth.ts`
- `apps/server/src/providers.ts`
- `apps/server/src/selection.ts` — file mới
- `apps/server/tests/auth.test.ts` — file mới
- `apps/server/tests/selection.test.ts` — file mới

### Frontend

- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/components/AiPanel.tsx`
- `apps/web/src/components/AiSelectionPanel.tsx` — file mới
- `apps/web/src/components/CanvasBackground.tsx` — file mới
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/components/CanvasBoard.test.tsx`
- `apps/web/src/components/CommandPalette.tsx` — file mới
- `apps/web/src/components/FlashcardsPage.tsx`
- `apps/web/src/components/SourceDocumentPanel.tsx` — file mới
- `apps/web/src/components/WorkspaceHome.tsx`
- `apps/web/src/hooks/useFlashcards.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/board.ts`
- `apps/web/src/lib/board.test.ts`
- `apps/web/src/lib/canvasClipboard.ts` — file mới
- `apps/web/src/lib/canvasClipboard.test.ts` — file mới
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/lib/projectStore.test.ts`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/styles.css`

### Tài liệu

- `render.yaml`
- `README.md`
- `DEPLOY_V1_VI.md`
- `PROJECT_HANDOFF.md`
- `V3_4_SMART_STUDY_CANVAS_VI.md` — file mới

## Deploy Render

Không thêm biến môi trường và không có migration mới. V3.4 có route API mới nên phải deploy cả hai service theo thứ tự:

1. Push toàn bộ file trên lên branch `main`.
2. Deploy latest commit cho `mindcanvas-api`.
3. Mở `https://mindcanvas-api-ok4w.onrender.com/api/health` (hoặc domain API thật của bạn) và xác nhận `ok: true`.
4. Deploy latest commit cho `mindcanvas-web`.
5. Frontend phải giữ `VITE_API_BASE_URL=https://mindcanvas-api-ok4w.onrender.com` (thay bằng domain thật nếu Render đổi hậu tố).
6. API phải giữ `WEB_ORIGIN=https://mindcanvas-wp23.onrender.com` và các biến Supabase/Gemini hiện tại. `render.yaml` V3.4 đã đồng bộ domain này và khai báo thêm khóa Blueprint `GEMINI_MODELS` ở dạng `sync: false` để giá trị thật không nằm trong Git.

Không đặt `GEMINI_API_KEY` trong frontend hoặc bất kỳ biến nào bắt đầu bằng `VITE_`.

## Lệnh kiểm tra trước khi push

```bash
npm install
npm run typecheck
npm test
npm run build
```

Kết quả hiện tại trong workspace:

- TypeScript frontend: pass.
- TypeScript backend: pass.
- Production build frontend/backend: pass.
- Frontend: 78 tests pass.
- Backend: 16 tests pass.
- Tổng: 94 tests pass.

Live Supabase, Google OAuth, Gemini, Render và thiết bị thật chưa thể được xác nhận nếu không có credential/phiên production của bạn.

## Checklist kiểm tra sau deploy

- Badge bên cạnh MindCanvas hiển thị `V3.4`.
- Project mới vẫn là canvas trống, không có tài liệu demo.
- Hand/touch pan làm pattern nền và element chuyển động cùng nhau; tọa độ element không đổi.
- Đổi nền rồi refresh: nền vẫn đúng; Undo chỉ lùi thao tác nội dung, không phải từng bước pan.
- Text mới/cũ sửa trực tiếp và giữ rich text sau refresh.
- Copy một element, về Workspace, mở project khác và Paste; element mới có ID riêng.
- `Ctrl/⌘+K` tìm được một từ nằm trong text/node đã lưu.
- Chọn text/node, dùng AI và Apply; phần tử cũ được giữ, kết quả có thể Undo.
- Node có số trang mở được PDF private đúng trang khi session còn hiệu lực.
- AI flashcards Apply không tạo nửa bộ thẻ khi request cloud thất bại; giao diện phải ghi rõ Cloud hay thiết bị này.

## Giới hạn còn lại

- Tìm kiếm nội dung dùng board đã có trong cache; project cloud chưa từng mở trên thiết bị có thể chỉ tìm được theo tiêu đề.
- Clipboard hệ điều hành phụ thuộc quyền trình duyệt. Fallback trong phiên sẽ mất khi đóng/reload tab.
- Signed URL PDF hết hạn sau 15 phút và được tạo lại khi người dùng mở nguồn.
- AI vùng chọn cần đăng nhập, API Render hoạt động và Gemini được cấu hình; không có dữ liệu AI demo.
- Chưa thêm realtime collaboration, OCR chữ viết tay, RAG toàn workspace, app native Android/iOS hoặc nested groups trong V3.4.
