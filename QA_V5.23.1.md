# QA MindCanvas v5.23.1

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Web | 634/634 test đạt, 88 file test |
| Server, tách cấu hình thật | 62/62 test đạt, không bỏ qua test |
| Typecheck web/server | Đạt |
| Build web/server | Đạt; cảnh báo chunk lớn hơn 500 kB hiện có |
| Chromium 153, giao diện thực | Đạt tại 1440×1000, 768×1024 và 390×844 |
| SQL/dependency mới | Không có |

Bổ sung 10 test cho prompt không cần upload, prompt tự cập nhật/copy, quota thử lại ổn định, nhập JSON không có file ID, giữ JSON đang dở, tạo Auto trực tiếp từ text/file mẫu, chuyển chế độ giữ thiết lập, ẩn màn hình tạo khi xem kết quả, chặn nguồn chưa đọc được và phục hồi sau lỗi tạo với thao tác bấm lặp. Các test Manual cũ được cập nhật để dùng Sao chép prompt thay Lấy prompt.

Bộ web đầy đủ đã chạy trên mã cuối. Test server chạy với cấu hình Supabase/Gemini thật được tách tạm khỏi môi trường kiểm thử và được khôi phục sau đó; không gọi dịch vụ production.

## Kiểm tra trình duyệt

Dùng component React và CSS thật trong harness cục bộ, có IndexedDB và clipboard thật của Chromium; mock module API để tránh gọi AI/đăng nhập production. Trên cả ba kích thước đã kiểm tra:

- Vùng tạo bằng chiều rộng vùng nội dung, không có khung đề trống bên cạnh.
- Nhập nội dung và tạo Auto, mở riêng màn hình kết quả rồi quay lại thiết lập.
- Chuyển Manual, đổi độ khó, kiểm tra prompt mới, bấm copy và đối chiếu clipboard.
- Không tràn ngang và không có pageerror.
- Xem ảnh nội bộ của Auto/Manual; kiểm tra lại sau khi chuyển thư viện và gói gửi AI xuống dưới.

Harness, ảnh nội bộ, môi trường, node_modules và dist không được đóng gói. Worker build đã được kiểm tra mang cache v5.23.1. ZIP có bản kê SHA-256 cho từng file.

## Giới hạn

Chưa thử Safari/iPad/iPhone thật, clipboard dưới hạn chế quyền của Safari hoặc chế độ riêng tư. Kích thước 768×1024 là viewport Chromium, không đại diện kiểm chứng iPad thật. Harness kiểm tra màn hình tạo đề trực tiếp, không mô phỏng toàn bộ thanh điều hướng/đăng nhập của ứng dụng.

Chưa gọi AI ngoài/Gemini thật để tạo và đối chiếu đề, Word hoặc PDF trong phiên này; không deploy production. Chức năng đọc file Auto và DOCX/JSON hiện có được kiểm tra hồi quy bằng test/mock. Không bổ sung thuật toán chấm hoặc thay engine AI trong bản vá giao diện này.
