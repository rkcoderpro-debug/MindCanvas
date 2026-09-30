# MindCanvas V5.14.6

Nền sửa lỗi: V5.14.4. Gói này cũng áp dụng được lên V5.14.5 vì phiên bản đó chỉ thay đổi thông báo xanh và metadata phát hành.

- Canvas của chủ sở hữu và người có quyền chỉnh sửa vẫn vẽ được khi đồng bộ gặp xung đột. Quyền xem và project chia sẻ ngoại tuyến vẫn giữ chế độ chỉ xem.
- Bỏ thông báo xanh toàn chiều rộng khi tự chọn bản cloud. Lỗi đồng bộ hiển thị ở badge trên thanh công cụ và trong Trung tâm đồng bộ; nút “Đồng bộ ngay” có thể thử lại lựa chọn cloud.
- Xác nhận nội dung sau khi ghi cloud trong tối đa 15 giây, chấp nhận độ trễ đọc lại và so sánh dữ liệu JSONB theo nội dung, không phụ thuộc thứ tự khóa. Khi chưa xác nhận, bản nháp tiếp tục chờ đồng bộ và hệ thống tự thử lại.
- Bắt buộc xác nhận bản khôi phục lưu bền vững trước khi tự thay bản nháp bằng cloud. Nếu việc sao lưu lỗi hoặc người dùng vừa sửa thêm, giữ nguyên bản nháp.
- Badge và khóa bộ nhớ PWA cập nhật lên V5.14.6. Không có migration SQL mới.
