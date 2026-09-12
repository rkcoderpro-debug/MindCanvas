# MindCanvas V3.8.1 — điều hướng và canvas mượt hơn

## Mục tiêu

V3.8.1 hoàn thiện các vấn đề UX còn lại sau V3.8: sidebar không còn đè logo khi thu nhỏ, folder dễ xem hơn, theme/ngôn ngữ bấm được ở mọi trạng thái, và touchpad không làm canvas giật vì ghi state ở mọi wheel event.

## Đã làm

- Sidebar được tách thành `AppSidebar.tsx` và `SidebarAppearanceControls.tsx`.
- Desktop có nút hamburger để chuyển giữa sidebar đầy đủ và icon rail. Phím `Ctrl/⌘+Shift+B` vẫn hoạt động.
- Mép phải sidebar kéo được trong khoảng `220–380px`; bấm đúp để về `280px`. Độ rộng lưu riêng trên trình duyệt.
- Mobile dùng drawer: bấm hamburger để mở, lớp nền hoặc Escape để đóng; drawer không dùng lại độ rộng desktop.
- Folder có mũi tên accordion. Khi mở sẽ hiển thị tối đa 8 project thật trong folder, không tạo dữ liệu demo.
- Theme và ngôn ngữ dùng popover button. Theme hover/focus preview tạm, rời hover hoàn nguyên, click mới lưu.
- Wheel event được chuẩn hóa cho pixel/line/page delta, preview theo `requestAnimationFrame`, rồi commit một lần sau 120ms không có event mới.
- Pan vẫn thay đổi `BoardState.viewport` riêng; element, node, connector và layer không bị di chuyển theo wheel. Space/Hand/nút giữa vẫn là pan.

## Kiểm tra local

```bash
npm run typecheck
npm test
npm run build
```

Frontend hiện có 102 test pass sau khi thêm bộ test cho viewport và wheel batching. Backend hiện có 28 test pass; chạy cùng workspace để kiểm tra đầy đủ:

```bash
npm run typecheck
npm test
npm run build
```

Không thể coi Gemini, Supabase, OAuth, Render hay touchpad vật lý là đã kiểm thử chỉ dựa trên local build; cần QA sau deploy.

## Deploy

Không có migration hoặc env mới. Push commit lên `main`, sau đó Render deploy `mindcanvas-web`. Nếu deploy cả monorepo, `mindcanvas-api` vẫn tương thích với frontend V3.8.1.

Sau deploy hãy hard refresh và chấp nhận cập nhật PWA. Kiểm tra lần lượt: hamburger, kéo sidebar, mở folder, popover theme/ngôn ngữ, hover preview theme, touchpad pan và Ctrl/Cmd + wheel zoom.
