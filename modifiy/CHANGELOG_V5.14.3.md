# MindCanvas V5.14.3

- Khi cloud xác nhận có xung đột, mặc định tự dùng snapshot cloud mới nhất thay vì chờ người dùng chọn.
- Trước khi chuyển, giữ bản thiết bị làm mốc khôi phục. Nếu tự dùng cloud không hoàn tất do mất mạng/quyền truy cập, hộp thoại phục hồi vẫn mở để người dùng chọn cách khác.
- Chuyển lỗi xác minh nội dung sau khi ghi thành xung đột có cấu trúc để đi vào cùng luồng xử lý cloud mặc định.
- Giữ các phương án thay thế xếp hàng tuần tự của V5.14.2, tránh ghi cloud đồng thời.
- Cập nhật version ứng dụng và cache Service Worker lên V5.14.3.
- Không thêm migration SQL.
