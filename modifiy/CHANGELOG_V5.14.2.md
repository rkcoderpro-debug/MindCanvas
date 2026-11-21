# MindCanvas V5.14.2

- Sửa hộp thoại xung đột cloud: chỉ khóa lựa chọn đang được xử lý; các lựa chọn khác vẫn bấm được.
- Nếu người dùng chọn phương án khác khi thao tác hiện tại còn chờ, phương án mới được xếp hàng và chỉ chạy khi thao tác trước thất bại. Hai thao tác không ghi cloud đồng thời; lựa chọn xếp hàng được bỏ nếu xung đột đã giải quyết thành công.
- Hiển thị trạng thái xếp hàng bằng tiếng Việt và tiếng Anh.
- Bổ sung kiểm thử chọn bản cloud, bảo toàn mốc khôi phục bản local và xử lý lựa chọn thay thế đang chờ.
- Cập nhật version ứng dụng và cache Service Worker lên V5.14.2.
- Không thêm migration SQL.
