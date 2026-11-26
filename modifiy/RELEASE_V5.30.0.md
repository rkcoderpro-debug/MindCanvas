# MindCanvas v5.30.0 — Đợt 1: Thông báo và hồ sơ

Gói này cập nhật từ **v5.29.3**. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

1. Trên Supabase, áp dụng `supabase/migrations/0036_system_announcements.sql`, rồi `supabase/migrations/0037_personal_profiles.sql`. Các migration thêm bảng/RPC mới; giữ dữ liệu hiện có.
2. Deploy lại **Render API** và **Render Static Site**. Mục gửi hệ thống dùng quyền quản trị đã có (`ADMIN_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` trên API). Không đưa khóa service role vào cấu hình web.
3. Trên staging, dùng một admin và hai tài khoản thường: thử một tin hệ thống, trạng thái đã đọc riêng, chỉnh hồ sơ và đổi ảnh. Tài khoản thường không được gửi tin hệ thống hoặc đọc thông tin riêng tư của tài khoản khác.

- Chuông có hai tab **Thông báo** và **Tin nhắn hệ thống**, mỗi tab có số chưa đọc riêng.
- Quản trị viên vào **Quản trị → Thông báo hệ thống** để soạn, xem trước, gửi đến mọi tài khoản hiện có và xem lịch sử. Tin xuất hiện trong ứng dụng.
- Mở menu ảnh đại diện → **Hồ sơ cá nhân** để sửa họ tên, tên người dùng, biệt danh, tuổi, giới tính, trường, tỉnh/thành và ảnh. Tên người dùng không làm đổi cách đăng nhập. Tuổi, giới tính, trường và tỉnh/thành mặc định chỉ chủ tài khoản nhìn thấy.
