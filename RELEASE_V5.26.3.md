# MindCanvas v5.26.3 — Tách đồng bộ canvas và lịch sử phiên bản

Áp dụng trên v5.26.2. Giải nén vào thư mục gốc chứa `package.json`, `apps/` và `packages/`, ghi đè đúng đường dẫn, build và phát hành lại. Không cần chạy SQL. Kiểm tra giao diện đã nhận v5.26.3 sau khi tải lại trang.

Khi vẽ thêm một nét trên canvas có ảnh nền và ảnh nhúng, lần ghi cập nhật tài liệu vẫn gửi nội dung board. Bản cũ còn tải lại toàn bộ nội dung sau lệnh ghi để xác minh, và luồng xử lý xung đột có thể gửi một bản đầy đủ nữa lên `note_versions`. Hai loại yêu cầu có thể lỗi độc lập: HTTP 500 ở `POST note_versions` không xác định kết quả của `PATCH notes`.

- Đối với canvas sở hữu có revision, `PATCH notes` kiểm tra tài khoản, ID và revision. Nếu Supabase trả đúng ID, revision kế tiếp và thời điểm của chính lần ghi, ứng dụng xác nhận từ phản hồi đó, không tải lại ảnh chỉ để xác minh. Luồng chia sẻ, lược đồ cũ hoặc phản hồi chưa đủ bằng chứng vẫn đối chiếu nội dung.
- Nút **Lưu** và Ctrl/⌘+S chỉ đồng bộ canvas đang mở. Dùng **Lịch sử phiên bản → Lưu mốc phiên bản** khi muốn tạo mốc riêng.
- Khi ứng dụng tự khôi phục từ cloud do có xung đột, nó lưu và đọc lại bản dự phòng trên IndexedDB trước khi chuyển. Nếu lưu bản dự phòng không thành công hoặc có nét mới trong lúc xử lý, ứng dụng giữ bản nháp. Mốc trên thiết bị xuất hiện cùng các mốc cloud; mốc trên thiết bị không có trên máy khác.
- Nếu lệnh ghi timeout, dữ liệu chưa xác nhận vẫn là bản nháp trên thiết bị. Khi lần đồng bộ tiếp theo thành công, thông báo lỗi của lần ghi đó được gỡ.

Nếu vẫn thấy lỗi, ưu tiên **Tải file về máy** để giữ bản có nét mới. Đo riêng `PATCH /rest/v1/notes` trong DevTools Network, chọn Headers và Timing. Thử với một canvas trống và canvas chứa nhiều ảnh để so sánh. Bản này giảm lượt tải và ghi thừa, chưa đổi định dạng lưu ảnh nhúng; nếu bản thân PATCH vẫn bị 57014, cần tối ưu lưu media và kiểm tra hiệu năng truy vấn ghi trên Supabase. Không cần xóa dữ liệu trình duyệt.
