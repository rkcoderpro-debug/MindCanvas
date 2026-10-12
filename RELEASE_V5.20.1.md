# MindCanvas v5.20.1

Ngày: 12/10/2026. Bản vá áp dụng trên nguồn v5.20.0 trong `mindcanvas-v1 (4).zip`.

## Thay đổi

- API health lấy `release` từ package server thay cho chuỗi hardcode 5.11.4; dùng được trong cả source và bản build.
- Web/server bỏ khoảng trắng quanh khóa Supabase, ưu tiên publishable có nội dung rồi fallback sang anon. Thiếu cả hai vẫn giữ chế độ local hoặc từ chối API cần xác thực như trước.
- Build Vite tự chèn version package web vào service worker. Worker chỉ đọc cache shell của chính phiên bản đang chạy, không lấy nhầm shell cũ khi offline; không ghi HTTP lỗi đè lên shell tốt, vẫn trả nội dung mạng khi cache đầy hoặc không dùng được.
- Giữ cơ chế chờ người dùng áp dụng cập nhật PWA. Chỉ xóa cache shell cũ khi activate; không xóa IndexedDB/localStorage.
- Loại file migration 0018 `_FIXED` bị trùng số và giống hệt từng byte với file 0018 chính. Không sửa nội dung migration hoặc schema database.
- Root, web, server và lockfile cùng phiên bản 5.20.1. Package shared giữ phiên bản riêng.
- Khi chạy hồi quy toàn bộ nguồn nền, sửa thêm ba lỗi đã có test: dấu nhớ tài khoản được xóa trước sự kiện đăng xuất và khôi phục nếu đăng xuất lỗi; lỗi đọc thư viện tài liệu của tài khoản được báo rõ thay vì trả danh sách rỗng, các callback tải lại tài liệu bắt lỗi; tiêu đề/nút tải/trạng thái trống của trang tài liệu theo lựa chọn tiếng Anh. Không thêm tính năng mới.

## Áp dụng ZIP changed files

1. Giải nén ghi đè vào thư mục gốc project có `package.json`, `apps` và `supabase`. Các đường dẫn trong ZIP tương đối với gốc này; không có thư mục bọc `mindcanvas-v1`.
2. **Xóa đúng file cũ** `supabase/migrations/0018_v4_9_learning_shares_FIXED.sql`. ZIP không tự xóa file đã tồn tại. Giữ nguyên `0018_v4_9_learning_shares.sql`, migration thông báo 0031 và Lab 0032.
3. File `_FIXED` trong nguồn nền có SHA-256 `5d9c7e5a689a5cf20c2ae72d172af6ce803f4619027bb2d7c60c61dbbfd5afbb`, giống hệt file 0018 chính. Nếu đã chỉnh sửa riêng file này, so sánh trước khi xóa. Không tự sửa lịch sử migration CLI trên database.
4. Chạy `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` ở gốc project.

**Không có SQL mới cần chạy cho v5.20.1.** Nếu database chưa có Lab v5.20.0, vẫn cần 0032 theo hướng dẫn phát hành v5.20.0; không chạy lại migration 0018 chỉ vì dọn file trùng.

ZIP chỉ chứa file nguồn/test/tài liệu thêm hoặc thay đổi và manifest `CHANGED_FILES_V5.20.1.json`. Không kèm `.env`, Git, dependencies, output build hoặc toàn bộ repository.

## Kiểm tra trước khi phát hành lên production

Đọc `QA_V5.20.1.md` để phân biệt kiểm thử đã chạy với kiểm tra còn thiếu. Sau deploy, đối chiếu badge và API health cùng 5.20.1; thử cập nhật từ PWA cũ và mở offline. Kiểm tra đăng nhập/F5, Canvas autosave và Lab trên trình duyệt cùng Supabase thật. Phiên sửa này không push, deploy hoặc chạy SQL trên database.
