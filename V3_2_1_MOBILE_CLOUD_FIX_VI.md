# MindCanvas V3.2.1 — Mobile Cloud Sync Hotfix

## Lỗi đã sửa

Sau một lần autosave thành công, Supabase tăng `notes.revision` nhưng state giao diện trước đây vẫn giữ revision cũ. Lần chỉnh sửa kế tiếp vì vậy có thể báo nhầm:

```text
Cloud project changed in another tab or device
```

V3.2.1 lấy revision mới nhất từ cache đã được Supabase xác nhận. Nhiều lần autosave liên tiếp trên điện thoại vì vậy tiếp tục theo đúng `0 → 1 → 2...` thay vì tự xung đột.

## Khi có xung đột thật

Nếu hai thiết bị thật sự sửa nội dung khác nhau, autosave tạm dừng và hiển thị ba lựa chọn:

- **Dùng bản cloud:** tải bản cloud mới nhất; bản local được lưu thành checkpoint khôi phục trước.
- **Lưu bản thiết bị thành bản sao:** tạo một project cloud mới, giữ cả hai bản.
- **Lưu bản thiết bị lên cloud:** chủ động ghi bản đang mở lên cloud; bản cloud trước đó được checkpoint trước khi thay thế.

Khác biệt chỉ ở vị trí viewport/pan/zoom được tự rebase và không bắt người dùng giải quyết thủ công.

## Giao diện điện thoại

- Header gọn và có menu mở rộng.
- Hiển thị email Google trong phần tài khoản để xác minh đúng account.
- Thanh điều hướng và nhóm nút editor cuộn ngang.
- Drawing toolbar một hàng, nút đủ lớn cho thao tác chạm.
- Kéo một ngón trên vùng trống để di chuyển canvas.
- Properties mở dưới dạng bottom sheet; minimap được ẩn trên màn hình nhỏ.
- Dialog và màn hình quản lý file/flashcard co giãn theo chiều rộng điện thoại.

## Cách deploy

1. Thay các file được liệt kê trong `PROJECT_HANDOFF.md`.
2. Chạy kiểm tra tại thư mục gốc:

```bash
npm install
npm run typecheck
npm test
npm run build
```

3. Commit và push lên nhánh `main`.
4. Render chỉ cần redeploy `mindcanvas-web`; backend không đổi trong hotfix này.
5. Trong Supabase SQL Editor, xác nhận migration `supabase/migrations/0004_note_revision_lock.sql` đã chạy và bảng `notes` có cột `revision`.

## Kiểm tra sau deploy

1. Điện thoại đăng nhập Google và mở menu để kiểm tra đúng email.
2. Tạo project, thêm chữ, chờ trạng thái **Đã lưu đám mây**.
3. Sửa tiếp ít nhất ba lần; mỗi lần đều phải trở lại **Đã lưu đám mây**.
4. Refresh trang, mở lại project và kiểm tra nội dung còn nguyên.
5. Mở cùng project trên máy tính và điện thoại, chỉnh hai nội dung khác nhau để xác nhận hộp chọn phiên bản xuất hiện.
6. Đăng nhập tài khoản Google khác và xác nhận không nhìn thấy project của tài khoản trước.

Không commit `.env`, Supabase key riêng hoặc `GEMINI_API_KEY` lên GitHub.
