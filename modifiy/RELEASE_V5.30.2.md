# MindCanvas v5.30.2 — Đợt 3: Flashcard, Chat và Nhạc tập trung

Gói này cập nhật từ **v5.30.1**. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- **Thư viện Flashcard:** Mỗi bộ có thẻ riêng, hiện tổng số thẻ và số thẻ đến hạn. Ô tìm kiếm theo tên hỗ trợ chữ tiếng Việt không dấu. Bộ lọc **Tất cả / Đã lưu** kết hợp với tìm kiếm.
- **Bạn bè và tin nhắn:** Hai cột trên màn hình lớn; trên màn hình nhỏ chỉ hiện danh sách hoặc khung chat, có nút quay lại. Danh sách hiện tin mới nhất, thời gian và số tin chưa đọc. Nội dung được chia sẻ có nút mở mục **Được chia sẻ với tôi**. Chỉ lịch sử tin nhắn cuộn bên trong khung chat; ô soạn tin luôn nằm dưới.
- **Nhạc tập trung:** Đang phát và Danh sách phát xuất hiện ngay khi mở trang. Nút **Thêm nhạc** chứa hai lựa chọn: tệp trên thiết bị hoặc liên kết. Trình phát thu nhỏ tiếp tục hoạt động khi chuyển trang.
- **Workspace:** Nền phần tên và ngày cập nhật trên thẻ Canvas chuyển chéo từ góc trái trên xuống góc phải dưới, dùng hai màu của chủ đề đang chọn.

## Cập nhật

1. Áp dụng `supabase/migrations/0038_study_library_summaries.sql` sau migration `0037_personal_profiles.sql`. Migration chỉ thêm hai hàm đọc; không sửa dữ liệu bộ thẻ hay tin nhắn hiện có. Số liệu Flashcard trên cloud và nội dung xem trước trong Chat dùng hai hàm mới.
2. Cập nhật và build **Render Static Site**. Không cần đổi cấu hình hoặc deploy lại **Render API**.
3. Kiểm tra một bộ thẻ chưa mở, một hội thoại có học liệu, lối quay về hội thoại trên màn hình nhỏ và thao tác thêm nhạc.

Đã kiểm tra bằng test web, API, build và chạy migration trên PostgreSQL cục bộ với nhiều tài khoản và quyền khác nhau.
