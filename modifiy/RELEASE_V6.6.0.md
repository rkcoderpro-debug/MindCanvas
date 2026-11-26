# MindCanvas v6.6.0 — Chia sẻ theo link và email

Gói này cập nhật từ **v6.5.0** và đã bao gồm giao diện thư mục của **v6.6.0-beta.1**. Người đã cài bản beta có thể giải nén đè lên bản đó. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- **Nội dung:** chia sẻ từng thư mục, Canvas, quiz, bộ flashcard, tệp Workspace hoặc tài liệu đính kèm riêng lẻ. Có thể sao chép link, đổi vai trò, thu hồi và xem lời mời theo email trong **Được chia sẻ với tôi**. Các link mời cũ vẫn dùng được.
- **Ai có link:** mở xem ngay khi chủ sở hữu bật chia sẻ. Link Người chỉnh sửa vẫn mở ở chế độ xem khi chưa đăng nhập; sau khi đăng nhập sẽ quay về đúng nội dung cần sửa.
- **Mời qua email:** người xem xác minh bằng mã 6 chữ số gửi đến email được mời, không cần tạo tài khoản; người chỉnh sửa đăng nhập bằng đúng email đã được cấp. Chia sẻ công khai bằng link không cần cấu hình gửi mail.
- **Thư mục:** quyền áp dụng xuống cả thư mục con, tệp, Canvas và bộ thẻ nằm bên trong. Nếu chuyển nội dung ra ngoài nhánh được chia sẻ, quyền từ link thư mục hết hiệu lực. Quyền cấp trực tiếp còn hiệu lực cho đến khi chủ sở hữu thu hồi.
- **Tài liệu:** giữ giới hạn 40 MB/tệp; tài liệu PDF/Office có thể yêu cầu xem trước hoặc tải xuống. Tệp khác tải xuống nguyên bản. Quyền sửa cho phép đổi tên hoặc tải lên bản thay thế, giữ nguyên link. Với tài liệu cũ lưu riêng trên trình duyệt, hãy mở Canvas và bật chia sẻ trên thiết bị có bản gốc để đồng bộ. Muốn chia sẻ riêng: **Chia sẻ project → Chia sẻ riêng tài liệu đính kèm**. Nếu thêm tài liệu vào Canvas đang chia sẻ, mở lại hộp chia sẻ và bấm **Đồng bộ tất cả tài liệu**, hoặc dùng nút chia sẻ riêng để đồng bộ tệp mới.
- **Học liệu:** khách làm quiz mà không dùng lịch sử của chủ sở hữu; đáp án xuất hiện sau Nộp bài. Khách có thể lật thẻ ôn tập; tiến độ và lịch ôn của chủ sở hữu vẫn riêng tư.
- **Chỉnh sửa Canvas từ link:** sửa chữ, bản vẽ, hình, đường nối và trang A4 rồi bấm Lưu. Tệp đính kèm chỉnh riêng ở mục Tài liệu; website nhúng bên ngoài chỉ tải ở giao diện Canvas thông thường. Giao diện dùng kiểm tra phiên bản khi lưu để tránh ghi đè sửa đổi mới của người khác.

## Cách triển khai

1. Trên Supabase, chạy toàn bộ `supabase/migrations/0045_workspace_sharing.sql` sau `0044_workspace_folder_files.sql`. Bucket tệp vẫn ở chế độ riêng tư.
2. Deploy **Render API** rồi deploy **Static Site**. Giữ `SUPABASE_SERVICE_ROLE_KEY` và `WEB_ORIGIN` trên API, và `VITE_API_BASE_URL` trên Static Site.
3. Để gửi email thật, đặt trên **API**: `RESEND_API_KEY`, `SHARE_EMAIL_FROM` (địa chỉ gửi đã được xác minh tại Resend), và `SHARE_EMAIL_SECRET` (chuỗi ngẫu nhiên dài, dùng riêng cho xác minh email). Không thêm các biến này vào Static Site.
4. Thử link xem bằng cửa sổ ẩn danh, link sửa với tài khoản khác, lời mời đến đúng email, thư mục có nhánh con, và thu hồi link. Dữ liệu đã tải về máy người nhận trước khi thu hồi không thể tự xóa khỏi thiết bị của họ.
