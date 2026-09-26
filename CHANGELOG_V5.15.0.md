# MindCanvas V5.15.0

- Khôi phục phiên Supabase sau khi tải lại; nếu phiên cũ không lấy được thì thử refresh token và đưa người dùng tới màn hình khôi phục thay vì tự đổi sang khách.
- Sau khi ghi canvas, xác nhận bằng revision và nội dung cloud với các lần đọc lại trong tối đa 15 giây. Mốc thời gian chỉ còn để hiển thị.
- Thay thông báo xung đột lớn bằng trạng thái gọn và chi tiết trong Trung tâm đồng bộ; chỉ chuyển sang cloud sau khi đã xác nhận mốc khôi phục nháp local.
- Cập nhật badge phiên bản và cache PWA lên V5.15.0.
