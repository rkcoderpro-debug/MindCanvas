# MindCanvas v6.4.0 — Mã phòng và xóa phòng

Gói cập nhật từ v6.3.0. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- **Vào phòng bằng mã:** nhập 6 chữ số ở sảnh Phòng Online, kể cả số 0 ở đầu. Có thể sao chép mã ngay trong phòng. Những phòng đang mở và phòng mẫu được cấp mã khi chạy migration. Người tìm phòng phải đăng nhập.
- **Phòng riêng:** khi tạo phòng, chọn **Nhập mật khẩu** hoặc **Chờ chủ phòng duyệt**. Mật khẩu không nằm trong mã hay link chia sẻ. Khi dùng mã để vào phòng riêng tạo trước v6.4.0, khách chờ chủ phòng duyệt; các link mời cũ giữ cách vào đã thiết lập. Phòng công khai cho phép tài khoản đã đăng nhập vào; phòng của lớp vẫn chỉ cho giáo viên và học sinh đang tham gia lớp.
- **Xóa phòng:** chủ phòng có thể xóa từ thẻ phòng ở sảnh hoặc ngay trong phòng. Hệ thống yêu cầu xác nhận, hủy mã và liên kết mời, kết thúc cuộc gọi, bỏ quyền truy cập chat, tệp và bản Canvas của phòng. Canvas gốc trong Workspace vẫn còn. Xóa phòng giải phóng một suất tạo phòng; phòng mở sẵn của MindCanvas không có nút xóa.

## Cập nhật

1. Trên Supabase, chạy toàn bộ `supabase/migrations/0043_online_room_codes_and_delete.sql` sau `0042_online_rooms_rollout.sql`. Chạy với quyền quản trị dự án; migration dùng extension `pgcrypto`.
2. Deploy **Render API** và sau đó deploy **Static Site** v6.4.0. Không cần thêm biến môi trường; giữ cấu hình Supabase, LiveKit và webhook từ v6.3.0.
3. Dùng hai tài khoản để thử cả hai chế độ riêng tư. Xác nhận có thể xóa từ sảnh, mã cũ không còn tìm thấy phòng và chủ phòng tạo được phòng khác. Với phòng họp có LiveKit, thử xóa trong lúc tài khoản thứ hai đang kết nối để kiểm tra ngắt cuộc gọi. Nếu LiveKit tạm lỗi, API chặn cấp quyền vào mới ngay sau khi xóa và tác vụ nền thử ngắt cuộc gọi lại.
