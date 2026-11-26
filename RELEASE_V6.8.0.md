# MindCanvas v6.8.0

- Dropdown chuyển và lưu bản sao tài liệu hiển thị cây thư mục. Bấm mũi tên để mở thư mục con, bấm tên thư mục để chọn đích.
- Quiz, Flashcard và Lab có thư mục riêng và thư mục con. Học liệu cũ nằm ở Ngoài thư mục cho đến khi được chuyển.
- Thư mục Workspace có thể gửi cho bạn bè qua tin nhắn. Thư mục học liệu có thể gửi cho bạn bè hoặc mở link chỉ xem. Người nhận Free có thể xem khi được cấp quyền. Giới hạn gói hiện tại áp dụng khi gửi qua tin nhắn.
- Bản Lab chưa đồng bộ cần được đồng bộ trước khi người nhận mở được.
- Tin nhắn nằm trong bong bóng góc dưới bên phải, hiển thị số tin chưa đọc và mở hội thoại trực tiếp từ thông báo.

## Cập nhật từ v6.7.2

1. Chép nội dung các thư mục apps và supabase từ gói cập nhật vào gốc dự án. Chép các tệp bên trong modify vào gốc dự án theo cấu trúc gói.
2. Áp dụng migration 0047_study_folders.sql sau 0046 trên Supabase staging.
3. Build và cập nhật API trước web. Thử chia sẻ thư mục, mở link trên tài khoản khác, thu hồi, chuyển học liệu khỏi nhánh chia sẻ và mở hội thoại từ thông báo trước khi phát hành.

Không cần biến môi trường mới.
