# MindCanvas V3.5 — PWA, offline và export/layers

## Kết quả cập nhật

### 1. PWA cài được và mở offline

- Có manifest, icon thường/maskable và service worker production.
- Có nút **Cài ứng dụng** trong sidebar và Settings.
- Android/desktop dùng Chromium hoặc Brave sẽ dùng install prompt của trình duyệt khi được hỗ trợ.
- iPhone/iPad hiển thị đúng hướng dẫn Safari → Chia sẻ → Thêm vào Màn hình chính.
- App shell và project đã cache có thể mở lại khi mất mạng. Google Login, AI, PDF cloud và đồng bộ cần mạng.
- Khi deploy phiên bản mới, UI thông báo **Cập nhật ngay** thay vì âm thầm giữ bundle cũ mãi mãi.

### 2. Lưu offline bền hơn

- Project tiếp tục được cache theo từng user/guest, không trộn tài khoản.
- IndexedDB bổ sung cho localStorage để chứa canvas lớn hơn và làm lớp dự phòng khi localStorage đầy.
- Cache thiết bị được hydrate trước khi tải danh sách cloud, nên mất mạng không chặn mở workspace đã dùng.
- Pending write tự thử lại khi trình duyệt phát sự kiện online.
- Bấm nhãn trạng thái lưu để mở **Trung tâm đồng bộ**, xem mạng, chế độ local/cloud và từng file đang chờ.

### 3. SVG và PNG khớp editor

- SVG tự chứa màu thật của theme đang mở, không xuất CSS variable chưa được resolve.
- Dùng font `Inter, Arial, Helvetica, sans-serif`; không còn tự đổi sang serif.
- Node dài và nhãn connector tự xuống dòng; node giới hạn số dòng và thêm dấu `…` nếu không đủ chỗ.
- Chữ trên node tối tự chuyển sang trắng; page reference nằm trong node.
- Rich text giữ bold/italic/underline/căn lề/nền chữ.
- Nền dots/grid/ruled/graph/isometric/plain và global layer order được giữ khi xuất.
- PNG dùng chính SVG renderer này rồi rasterize ở độ phân giải tối đa an toàn; không còn hai cách vẽ khác nhau.

### 4. Bảng Elements không chồng chữ

- Mỗi element là một hàng cao cố định 44px, có ellipsis và vùng cuộn riêng.
- Có ô tìm kiếm, tổng số element, icon theo loại và trạng thái group.
- Có nút ẩn/hiện, khóa/mở khóa ngay trên từng hàng.
- Kéo một hàng lên/xuống để đổi layer; group được di chuyển như một khối, không bị tách.
- Inspector tablet rộng hơn; điện thoại vẫn dùng bottom sheet.

### 5. Tương tác editor bổ sung

- Bật biểu tượng nam châm để dùng smart guides: element bắt theo lưới và cạnh/tâm của element gần đó.
- Touchscreen hỗ trợ pinch-to-zoom hai ngón quanh tâm cử chỉ.
- Pan/zoom vẫn chỉ lưu viewport, không tạo hàng loạt bước Undo.

## Deploy

V3.5 chỉ thay đổi frontend:

1. Push các file ở mục **Changed files** lên branch đang liên kết Render.
2. Render → `mindcanvas-web` → **Manual Deploy → Deploy latest commit**.
3. Không cần redeploy `mindcanvas-api`, không cần chạy migration mới và không cần thêm env mới.
4. Sau deploy, mở web online và reload một lần để service worker nhận app shell mới.

## Checklist nghiệm thu

- Badge là `V3.5`.
- SVG và PNG có cùng font, wrapping, màu node, nền và layer order với editor.
- Tạo hơn 30 element: bảng Phần tử cuộn được và không chồng chữ.
- Kéo hàng layer rồi export: thứ tự che phủ phải đúng như editor.
- Bật nam châm rồi kéo gần cạnh/tâm element khác: guide hiện và element căn đúng.
- Trên điện thoại: pinch hai ngón zoom đúng tâm, bottom sheet Properties vẫn cuộn được.
- Mở project khi online → tắt mạng → reload/app launch: project cache mở được và trạng thái báo Offline.
- Sửa offline → bật mạng: hàng đợi trong Trung tâm đồng bộ giảm về 0 sau khi Supabase nhận dữ liệu.

## Giới hạn cần hiểu đúng

- PWA không biến Gemini hoặc Supabase thành dịch vụ offline; chỉ editor shell và dữ liệu đã cache hoạt động offline.
- Project chưa từng mở/tải trên thiết bị sẽ không thể xuất hiện lần đầu khi đang mất mạng.
- Service-worker/PWA và OAuth cần HTTPS khi deploy (Render đáp ứng điều này); localhost là ngoại lệ cho phát triển.
- Live Render/Supabase/OAuth/Gemini và thiết bị thật không được kiểm thử bằng credential production trong workspace này.

## Kiểm tra local đã chạy

- Typecheck frontend và backend: pass.
- Production build frontend và backend: pass.
- Frontend: 84 tests pass.
- Backend: 16 tests pass.
- Tổng cộng: 100 tests pass.
- Manifest JSON, cú pháp service worker và danh sách asset trong production bundle: hợp lệ.
- SVG mẫu tiếng Việt đã parse XML và render trực quan thành công; wrapping/font/contrast nằm đúng trong node.

## Changed files

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
