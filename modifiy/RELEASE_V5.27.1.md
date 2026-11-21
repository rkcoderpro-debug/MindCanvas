# MindCanvas v5.27.1 — Tách lỗi thông báo khỏi lời mời chia sẻ

Áp dụng trên v5.27.0. Giải nén vào thư mục gốc dự án, ghi đè các tệp trùng, rồi build và phát hành lại frontend. Bản này không cần migration hoặc biến môi trường mới. Nếu v5.27.0 đã bật thử đồng bộ ảnh, giữ nguyên cấu hình đó.

- Trước đây, một lỗi tải nền từ `list_my_pending_project_invitations` đủ để hiện khung “Bạn được mời vào project”. Giờ khung chỉ xuất hiện khi có lời mời thật. Nếu đã thấy lời mời rồi nhưng lần làm mới lỗi, lời mời vẫn hiện để người dùng xử lý.
- Chuông và lời mời giới hạn mỗi tính năng một yêu cầu đọc đang chạy. Các sự kiện focus/làm mới cùng lúc dùng chung yêu cầu; khi tab ẩn hoặc offline không chạy vòng đọc nền. Thời hạn một lượt đọc là 8 giây; sau lỗi tăng khoảng nghỉ từ 60 giây. Lỗi đọc chỉ hiện trong bảng thông báo khi người dùng mở chuông và có nút tải lại.
- Mở tin nhắn từ chuông không phải đợi thao tác đánh dấu đã đọc. Chấp nhận lời mời không phải đợi tải lại danh sách thông báo. Ghi hoạt động thú cưng dừng chờ đám mây sau 10 giây; thao tác ghi cục bộ vẫn dùng được.
- Dữ liệu lưu canvas và cơ chế thử nghiệm tách ảnh từ v5.27.0 không đổi. Nếu trong Network `notes` vẫn chậm, xem riêng phương thức, trạng thái và Timing của `PATCH /notes`. Cột Size ở Network phản ánh phần trả về, không dùng để xác nhận gói upload đã nhỏ hơn.

## Kiểm tra sau deploy

1. Mở lại trang, xác nhận phiên bản 5.27.1. Vào canvas và bật lại tab vài lần: không hiện khung lời mời nếu không có lời mời thật.
2. Trong DevTools mô phỏng Offline/Slow hoặc chặn riêng RPC đọc thông báo. Khung lời mời đang trống không hiện, chuông vẫn giữ dữ liệu đã tải. Mở chuông để thấy lời nhắc tải lại thay cho lỗi kỹ thuật.
3. Thử lời mời thật và thao tác xem tin nhắn, sau đó vẽ thêm một nét và kiểm tra đã đồng bộ. Bản vá giảm yêu cầu chồng nhau, không sửa lỗi 520/525 tại dịch vụ nguồn.
