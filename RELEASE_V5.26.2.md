# MindCanvas v5.26.2 — Mở canvas đã đồng bộ khi cloud chậm

Áp dụng trên v5.26.1. Giải nén gói vào thư mục gốc chứa `package.json`, `apps/` và `packages/`, ghi đè tệp trùng rồi build và phát hành lại ứng dụng. Không cần migration SQL hoặc biến môi trường mới. Sau khi tải lại trang, kiểm tra nhãn phiên bản v5.26.2.

- Canvas của chính tài khoản, đã có bản đã xác nhận trên thiết bị, mở từ bản đó. Ứng dụng kiểm tra phiên bản đám mây ở nền bằng truy vấn chỉ lấy thông tin. Chỉ tải toàn bộ nội dung nếu phiên bản thay đổi và chỉ áp dụng khi canvas còn mở, chưa có chỉnh sửa mới. Việc mở và di chuyển góc nhìn không tự tạo một lần lưu nội dung.
- Canvas chưa có bản trên thiết bị vẫn cần tải nội dung. Canvas chia sẻ khi online vẫn xác minh quyền qua cloud.
- Workspace tải danh sách thông tin trước. Ảnh xem trước tải theo nhóm khi thẻ sắp vào vùng nhìn; không tải toàn bộ board hoặc gửi lệnh ghi để tạo ảnh. Các yêu cầu tải lại danh sách trùng thời điểm dùng chung kết quả.

Log ngày 20/11/2026 cho thấy hai lượt đọc danh sách thành công mất khoảng 10–11 giây và trả về khoảng 2,18 MB mỗi lượt. Log 520 của `usage_monthly` từ Render và 502/520 của `PATCH notes` là các yêu cầu khác; chúng không chứng minh `usage_monthly` làm chậm thao tác mở. Lỗi 57014 xác nhận ít nhất một lần ghi đã bị PostgreSQL hủy do quá thời gian. Bản vá giảm sự phụ thuộc khi mở và giảm dữ liệu tải, chưa xử lý kích thước bản ghi khi lưu hoặc khắc phục sự cố trên Supabase.

Nếu lỗi còn tái hiện, giữ bản export `.mindcanvas.json` đã tải xuống. Kiểm tra CPU, Disk IOPS và dung lượng ổ đĩa trong Supabase Reports → Database tại lúc chậm. Trong SQL Editor có thể chạy truy vấn chỉ đọc sau hai lần cách nhau vài phút để biết lỗi lưu trữ WAL còn tiếp diễn hay chỉ xuất hiện trong lúc sự cố:

```sql
SELECT archived_count, failed_count, last_archived_time,
       last_failed_time, stats_reset
FROM pg_stat_archiver;
```

Nếu lỗi mới vẫn xuất hiện, nhất là khi `failed_count` tăng nhưng `last_archived_time` không đổi, gửi thời điểm, mã yêu cầu và log đã che thông tin khóa cho Supabase Support. Chỉ dùng các dấu hiệu này để khoanh vùng; chúng chưa xác định nguyên nhân gốc.
