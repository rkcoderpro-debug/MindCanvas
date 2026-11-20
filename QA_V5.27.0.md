# Kiểm thử MindCanvas v5.27.0

- Web: 697 bài, 96 tệp; server: 69 bài; build production và TypeScript đạt.
- Mô phỏng hai ảnh nhúng, dữ liệu gốc gần 12 MB: sau lần chuyển, một nét mới gửi dưới 2,5 KB qua PATCH và không upload lại ảnh. Mở phiên mới tải đủ bytes gốc; xuất/nhập lại vẫn giữ ảnh.
- Kiểm thử upload lỗi, lưu rơi vào xung đột revision, tệp hỏng/mất, tham chiếu từ canvas khác và canvas không được bật thử. Khi upload lỗi, không ghi note; khi revision sai, không thay bản cloud.
- Chạy migration và kiểm thử vai trò bằng PostgreSQL qua PGlite trong cơ sở dữ liệu cách ly. Kiểm tra RLS, bucket riêng tư, viewer không ghi, editor ghi đúng canvas, chặn đường dẫn sai và tài khoản bên ngoài, kiểm tra tham chiếu chưa tồn tại, chặn ghi đè từ định dạng cũ và tiếp tục đọc/ghi canvas đã chuyển.
- File kiểm thử SQL: `supabase/tests/canvas-media-pilot.pglite.mjs`. Dùng PGlite 0.5.17 cài ở thư mục thử, rồi chạy `PGLITE_ENTRY=/path/to/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/canvas-media-pilot.pglite.mjs`.
- Chưa chạy Supabase/Render production hoặc đo latency với Storage thật. Các bước kiểm tra staging trong RELEASE là điều kiện trước khi mở thử trên dữ liệu thật.
