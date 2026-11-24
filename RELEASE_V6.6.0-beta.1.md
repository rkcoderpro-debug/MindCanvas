# MindCanvas v6.6.0-beta.1 — Giao diện quản lý thư mục

Gói cập nhật đợt 1, áp dụng trên v6.5.0. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- **Quản lý thư mục** nằm gần đầu thanh bên, ngay bên dưới mục Workspace. Cây bên trái hiển thị thư mục con, tài liệu và Canvas theo cấp. Bấm tên thư mục để mở thư mục và bung nhánh; nút mũi tên chỉ bật/tắt nhánh. Các nhánh khác đang mở được giữ nguyên.
- Trang thư mục chỉ hiện thư mục con trực tiếp, tài liệu và project tại cấp đang mở. Link thư mục cũ tiếp tục hoạt động. Nút **Thêm tài liệu** đặt ở thanh thao tác đầu trang. **Project mới** và **Nhập file** áp dụng vào thư mục hiện tại. Trang tổng hiển thị các thư mục cấp ngoài cùng và nội dung chưa xếp thư mục.
- Bấm tên tệp để thấy nút tải xuống và **Link cá nhân**. Link dựa trên ID của tệp, nên vẫn hoạt động khi chuyển thư mục. Link cá nhân sử dụng quyền hiện có của tài khoản, chưa phải link chia sẻ cho người khác.
- Tài liệu và trình xem PDF/Office từ các bản cũ vẫn truy cập được qua **Tài liệu đã tải lên** trên trang tổng.

## Cập nhật
1. Nếu đang ở v6.5.0 và đã chạy migration `0044_workspace_folder_files.sql`, không cần migration mới.
2. Deploy lại Static Site trên Render. Bản beta này không thay đổi API.
3. Mở thử một thư mục có cấp con, một tệp và một project. Bung một nhánh khác bằng mũi tên và kiểm tra khung chính không đổi; mở một tệp bằng link cá nhân sau khi đã chuyển tệp.

Đây là **đợt giao diện** trong kế hoạch v6.6.0. Chia sẻ qua email hoặc link với vai trò Người xem/Người chỉnh sửa cho tệp, Canvas, quiz, flashcard, tài liệu trong Canvas và quyền kế thừa thư mục thuộc các đợt tiếp theo. Tính năng chia sẻ đã có từ trước vẫn dùng như cũ.
