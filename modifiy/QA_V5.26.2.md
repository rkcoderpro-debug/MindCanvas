# QA v5.26.2

- Web: 689 tests, 95 tệp. Server: 69 tests. Build production thành công.
- Mô phỏng canvas sạch mở từ thiết bị trong khi xác minh cloud đang chờ. Khi nhận phiên bản mới, canvas giữ nguyên góc nhìn. Nếu có nét vẽ mới, bản đám mây không ghi đè hoặc tự tăng revision của bản nháp.
- Kiểm tra hồi quy luồng phân quyền canvas chia sẻ, mở khi chưa có cache, chuyển canvas khi yêu cầu lưu cũ vẫn đang chờ và tự lưu có kiểm tra revision.
- Kiểm tra truy vấn danh sách không lấy `thumbnail`/`content`, tải preview theo danh sách ID, phiên bản khớp không tải lại board và hai lần refresh chồng nhau chỉ gửi một lượt tải danh sách.
- Sau khi phát hành, mở lại một canvas đã đồng bộ trên cùng trình duyệt. Trong Network, lần mở khi bản cloud không đổi chỉ cần kiểm tra metadata, không cần GET nội dung board. Mở lần đầu trên trình duyệt khác vẫn cần GET nội dung. Chỉ mở và di chuyển góc nhìn không tạo PATCH mới cho canvas đó. Đo thực tế sau deploy vì bản vá chưa được chạy trên dữ liệu production.
