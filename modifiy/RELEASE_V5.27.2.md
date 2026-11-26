# MindCanvas v5.27.2 — Phân biệt lỗi Supabase tạm thời và phiên hết hạn

Áp dụng trên v5.27.1. Giải nén vào thư mục gốc, ghi đè các tệp trùng rồi build và phát hành lại frontend. Không yêu cầu migration hoặc biến môi trường mới.

- Bản cũ thử làm mới token sau mọi lỗi khi kiểm tra tài khoản và có thể hiển thị “Phiên Supabase đã hết hạn” cả khi lỗi xảy ra ở gateway. Bản này coi lỗi kết nối, timeout, 429 và 5xx (gồm 525) là gián đoạn tạm thời. Chỉ thử làm mới khi Auth thực sự từ chối phiên/token; vẫn xác minh đúng tài khoản trước khi truy cập dữ liệu cloud.
- Chỉ yêu cầu GET người dùng ở `/auth/v1/user` có thời hạn 8 giây; các kiểm tra đồng thời cho đúng cùng tài khoản và token dùng chung yêu cầu đang chạy. Khi lưu chưa xong do Auth tạm lỗi, bản nháp vẫn nằm trên thiết bị và thông báo không yêu cầu đăng nhập lại.
- Không bật thử nghiệm tách ảnh trên diện rộng. Cấu hình thử nghiệm của v5.27.0 và migration 0033 giữ nguyên.

## Kiểm tra canvas có ảnh còn lưu chậm

1. Xuất bản nháp của canvas quan trọng bằng **Tải file về máy** trước khi thử.
2. Mở DevTools → Network, vẽ một nét rồi chọn đúng yêu cầu **PATCH /rest/v1/notes** của canvas vừa sửa. Trong **Payload**, xem `content.version`:
   - `1` và ảnh còn là `data:image/…`: canvas vẫn ghi theo định dạng cũ và gửi ảnh cùng JSON. Để thử tách ảnh, làm theo `RELEASE_V5.27.0.md` cho ID của canvas trong môi trường thử.
   - `2` và vị trí ảnh là `mindcanvas-asset:…`: ảnh đã tách. Lần chuyển có thể upload ảnh trước PATCH; lần sửa chỉ thêm nét sau đó không upload lại ảnh.
3. Đo riêng kích thước **yêu cầu gửi lên** và Timing của PATCH. Cột **Size** của danh sách Network không phải kích thước gói ảnh gửi lên. Nếu payload đã nhỏ nhưng vẫn gặp 57014, kiểm tra thời gian chờ khóa, trigger và log PostgreSQL của đúng request thay vì tiếp tục tối ưu kích thước ảnh.
4. Nếu đồng thời có `GET /auth/v1/user` 525, lưu lại thời điểm và request ID để đối chiếu với Supabase. Nếu Auth chưa xác nhận, không suy ra tài khoản đã bị đăng xuất hay gói dịch vụ đã đổi từ trạng thái giao diện tạm thời.
