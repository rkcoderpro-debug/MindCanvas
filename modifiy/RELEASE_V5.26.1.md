# MindCanvas v5.26.1 — Mở canvas khi đồng bộ bị chậm

Áp dụng trên v5.26.0. Giải nén gói vào thư mục gốc chứa package.json, apps/ và packages/, ghi đè đúng đường dẫn. Build và phát hành lại frontend để dùng bản vá; không có migration SQL, biến môi trường mới hay thay đổi API. Tệp phiên bản được đồng bộ giữa root, web, server và lockfile; PWA tạo phiên bản cache mới khi build.

- Trước đây, khi mở canvas, Workspace đợi đồng bộ tất cả bản nháp đang chờ. Một PATCH bị PostgreSQL hủy với mã 57014 có thể khiến thao tác mở chậm dù canvas cần mở đã có trên thiết bị.
- Mở bản nháp của mình ngay từ bản trên thiết bị; lưu riêng trong nền theo từng canvas. Chuyển canvas hoặc quay về Workspace chỉ đợi việc giữ bản nháp trên thiết bị, không đợi yêu cầu ghi cloud. Yêu cầu ghi chưa thành công vẫn giữ bản nháp và trạng thái chưa đồng bộ. Thử lại bằng nút Thử lại hoặc trung tâm đồng bộ.
- Canvas của mình đã đồng bộ vẫn đọc bản cloud để nhận thay đổi từ thiết bị khác. Nếu đọc cloud lỗi timeout tạm thời và có bản của chủ sở hữu trên thiết bị, dùng bản đó. Canvas chia sẻ mở online vẫn phải xác minh quyền với cloud. Giữ nguyên kiểm tra revision và quy trình xử lý xung đột khi ghi.
- Mở và chỉ đổi vùng nhìn không làm canvas sạch thành bản nháp cần PATCH. Lịch sử phiên bản được tải khi người dùng mở bảng lịch sử.

## Nếu Supabase vẫn báo 57014

Bản vá tách thao tác mở canvas khỏi lỗi đồng bộ. Nó không thay đổi giới hạn SQL hay khẳng định đã sửa nguyên nhân khiến UPDATE mất nhiều thời gian trên production.

Nếu vẫn lỗi khi bấm đồng bộ, giữ bản nháp trên thiết bị. Trong Supabase SQL Editor, chạy truy vấn chỉ đọc dưới đây ngay lúc PATCH còn đang chờ:

```sql
SELECT pid, now() - query_start AS elapsed,
       wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND state = 'active'
  AND query ILIKE '%"public"."notes"%';
```

Nếu blocked_by có PID và wait_event_type là Lock, kiểm tra giao dịch giữ khóa. Nếu không thấy phiên nào, kiểm tra lại trong lúc yêu cầu đang chạy; kết quả trống sau timeout không loại trừ chờ khóa. Nếu truy vấn không chờ khóa, đối chiếu Query Performance và Postgres Logs đúng lúc lỗi để xem khả năng tải ghi, dữ liệu lớn hoặc phần xử lý trong truy vấn. Không cần xóa bản trên thiết bị hoặc tăng timeout để áp dụng bản vá.
