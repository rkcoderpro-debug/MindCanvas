# MindCanvas v6.5.0 — Thư mục và kho tệp học tập

Gói cập nhật từ v6.4.0. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- **Thêm tài liệu:** có nút riêng ở trang Quản lý thư mục và trong từng thư mục, hỗ trợ chọn nhiều tệp hoặc kéo thả. Nhận mọi định dạng trong giới hạn 40 MB/tệp, kể cả `.asm`, `.mips`, `.cpp`, `.pcap`, `.pcapng` và tệp không có đuôi. Có thể tìm theo tên, tải xuống nguyên bản, chuyển sang thư mục khác và xóa. Tệp trong kho mới được lưu để tải xuống, không tự chạy hoặc gửi sang AI. **Nhập file** vẫn dùng để nhập project MindCanvas.
- **Thư mục con:** vào thư mục rồi bấm **Tạo thư mục con**. Dùng cây thư mục bên trái hoặc đường dẫn phía trên để di chuyển. Khi xóa một thư mục, project, tệp và các thư mục con trực tiếp chuyển ra cấp ngoài cùng; các tệp bên trong từng thư mục con vẫn đi cùng thư mục của chúng.
- **Liên kết:** bấm **Sao chép link thư mục** trong trang tổng hoặc trong một thư mục. Liên kết chỉ để truy cập nhanh, không cấp quyền cho tài khoản khác. Đăng nhập cùng tài khoản trên các thiết bị để mở thư mục và tệp được đồng bộ. Nếu chưa đăng nhập, tệp lưu trên trình duyệt hiện tại. Các tài liệu cũ trên thiết bị vẫn mở qua **Tài liệu đã tải lên** trong phần Quản lý thư mục.

## Cập nhật

1. Trên Supabase, chạy `supabase/migrations/0044_workspace_folder_files.sql` sau `0043_online_room_codes_and_delete.sql`. Migration tạo bucket riêng tư `workspace-files` và giữ cấu trúc thư mục, project cũ. Nếu dự án đặt giới hạn upload Storage toàn cục thấp hơn 40 MB, điều chỉnh giới hạn đó để người dùng tải được đến mức của ứng dụng.
2. Deploy lại **Static Site** v6.5.0 trên Render. Kho mới dùng Supabase trực tiếp và không cần thêm biến môi trường hay thay đổi API.
3. Thử tạo **DSA → Bài tập**, thêm một tệp `.cpp` hoặc `.pcapng`, rồi sao chép link. Mở link trong một trình duyệt khác với cùng tài khoản và tải thử. Xác nhận tài khoản khác không mở được thư mục riêng.
