# MindCanvas v6.7.2 — Gửi tài liệu cho bạn bè

- Hộp thoại **Chia sẻ** của tệp hiện có **Gửi cho bạn bè**, **Quyền truy cập qua link** và **Mời qua email**. Áp dụng ở Quản lý thư mục, khi mở tệp Workspace từ Thư viện và với tài liệu đính kèm Canvas.
- Gửi trực tiếp tạo một thẻ tài liệu trong tin nhắn. Tài khoản được chọn có thể mở và tải tệp. Người gửi có thể thu hồi trong **Bạn bè đã được cấp quyền**. Gửi qua tin nhắn không bật link công khai và không dùng dịch vụ gửi email.
- Gửi tài liệu qua tin nhắn dùng điều kiện gói Pro/Max hiện có của chia sẻ tài liệu; người nhận không cần gói trả phí. Chia sẻ Quiz, Flashcard, qua link và qua email giữ nguyên các quyền trước đó.

## Cập nhật

1. Giải nén vào thư mục gốc chứa package.json, ghi đè tệp cùng tên.
2. Áp dụng `supabase/migrations/0046_workspace_file_friends.sql` sau migration `0045`. Trên Supabase đã cập nhật đến `0045`, chỉ chạy `0046`. Giữ thứ tự migration.
3. Build lại frontend. Không cần biến môi trường mới hay thay đổi dịch vụ email.
