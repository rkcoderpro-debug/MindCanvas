# Kiểm thử v5.26.3

- Web: 692 bài / 95 tệp. Server: 69 bài. Build production cả hai đạt. Service worker dùng cache v5.26.3.
- Mô phỏng UPDATE có revision trả đúng ID/revision/timestamp; xác nhận chỉ một lệnh ghi và không tải lại board. Kiểm tra xác minh vẫn chạy khi thiếu dữ liệu phản hồi hoặc là project chia sẻ.
- Mô phỏng 57014: giữ bản nháp chờ đồng bộ và gỡ thông báo khi thử lại thành công. Kiểm tra visitor/viewer, xung đột, nét mới trong khi đối chiếu và luồng khôi phục vẫn qua.
- Tạo bản khôi phục từ board có ảnh nhúng hơn 11 MiB, đọc lại qua IndexedDB và xác nhận tách theo tài khoản. Bản khôi phục trên máy và bản cloud có thể cùng hiển thị.
- Sau deploy: vẽ một nét, xác nhận badge Đã lưu, tải lại trang để kiểm tra nét; trong Network không có GET toàn bộ nội dung chỉ để xác nhận PATCH có phản hồi hợp lệ và không có POST note_versions tự động cho lần lưu đó. Kiểm tra nút Lưu mốc riêng và thử mô phỏng mất kết nối. Chưa đo trực tiếp trên Supabase production.
