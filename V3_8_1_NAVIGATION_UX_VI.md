# MindCanvas V3.8.1 — điều hướng, canvas và UX mượt hơn

## Mục tiêu

V3.8.1 hoàn thiện các vấn đề UX còn lại sau V3.8: sidebar không còn đè logo khi thu nhỏ, chỉ còn một nút menu responsive, folder dễ xem hơn, tài khoản nằm ở topbar, theme/ngôn ngữ bấm được ở mọi trạng thái, và touchpad không làm canvas giật vì ghi state ở mọi wheel event.

## Đã làm

- Sidebar được tách thành `AppSidebar.tsx` và `SidebarAppearanceControls.tsx`.
- Desktop có nút hamburger để chuyển giữa sidebar đầy đủ và icon rail. Phím `Ctrl/⌘+Shift+B` vẫn hoạt động.
- Mép phải sidebar kéo được trong khoảng `220–380px`; bấm đúp để về `280px`. Độ rộng lưu riêng trên trình duyệt.
- Mobile dùng drawer: bấm hamburger để mở, lớp nền hoặc Escape để đóng; drawer không dùng lại độ rộng desktop.
- Folder có mũi tên accordion. Khi mở sẽ hiển thị tối đa 8 project thật trong folder, không tạo dữ liệu demo.
- Theme và ngôn ngữ dùng popover button. Theme hover/focus preview tạm, rời hover hoàn nguyên, click mới lưu.
- Wheel event được chuẩn hóa cho pixel/line/page delta, preview theo `requestAnimationFrame`, rồi commit một lần sau 120ms không có event mới.
- Pan vẫn thay đổi `BoardState.viewport` riêng; element, node, connector và layer không bị di chuyển theo wheel. Space/Hand/nút giữa vẫn là pan.

## UX patch trong cùng V3.8.1

- Bỏ hẳn nút hamburger mobile dư khỏi DOM; cùng một nút chuyển hành vi giữa thu/mở desktop và mở/đóng mobile drawer, nên không còn hai icon chồng nhau.
- Profile/avatar/email và Đăng xuất chuyển lên topbar; sidebar không còn lặp profile hoặc nút đăng xuất. **Cài ứng dụng** chỉ còn trong Settings.
- Flashcards được tách thị giác khỏi nhóm quản lý file bằng nút điều hướng accent riêng.
- Folder list có khung trong, scrollbar mảnh và thumb có màu để vẫn dễ nhận biết khi có nhiều thư mục.
- Canvas có nút phóng to toàn màn hình. Chế độ này ẩn sidebar/topbar/inspector, chỉ giữ canvas và drawing toolbar; `Escape` để thoát.
- Settings có bốn lựa chọn vị trí toolbar: Trên, Dưới, Trái, Phải. Trái/Phải xếp dọc; Trên/Dưới xếp ngang và lựa chọn được lưu trên trình duyệt.
- Service worker đổi sang cache `mindcanvas-shell-v3.8.1-ux` để PWA nhận đúng bundle mới.

## Kiểm tra local

```bash
npm run typecheck
npm test
npm run build
```

Frontend hiện có 106 test pass sau khi thêm regression cho toggle/profile/settings và toolbar preferences. Backend hiện có 28 test pass; chạy cùng workspace để kiểm tra đầy đủ:

```bash
npm run typecheck
npm test
npm run build
```

Không thể coi Gemini, Supabase, OAuth, Render hay touchpad vật lý là đã kiểm thử chỉ dựa trên local build; cần QA sau deploy.

## Deploy

Không có migration hoặc env mới. Push commit lên `main`, sau đó Render deploy `mindcanvas-web`. Nếu deploy cả monorepo, `mindcanvas-api` vẫn tương thích với frontend V3.8.1.

Sau deploy hãy hard refresh và chấp nhận cập nhật PWA. Kiểm tra lần lượt: một hamburger duy nhất trên mobile, profile/sign out trên topbar, mở folder và scrollbar, Settings → Cài ứng dụng/vị trí toolbar, fullscreen canvas, popover theme/ngôn ngữ, hover preview theme, touchpad pan và Ctrl/Cmd + wheel zoom.
