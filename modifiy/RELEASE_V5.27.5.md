# MindCanvas v5.27.5 — Nét bút bám con trỏ hơn

Cập nhật trực tiếp từ **v5.27.4**. Giải nén vào thư mục repository có `package.json` và `apps/`, rồi build/deploy lại frontend. Không có migration SQL hoặc biến môi trường mới.

- Bút và bút đánh dấu đang vẽ chỉ cập nhật một lớp mực riêng, tối đa một lần mỗi khung hình. Canvas chính, ảnh, thanh công cụ và minimap không còn được dựng lại theo từng điểm của nét.
- Dùng các điểm trung gian mà trình duyệt gom lại, nếu thiết bị/trình duyệt hỗ trợ, và giữ cả điểm cuối khi nhấc bút. Nét dài chỉ cập nhật đoạn đang vẽ và bản xem trước được chuyển sang nét chính thức trước khi trình duyệt vẽ lại màn hình.
- Khi nhấc bút hoặc rời cửa sổ, nét vẫn được ghi một lần; Undo vẫn tính một nét là một thao tác. Lưu đám mây v2 và các đường link canvas vẫn dùng luồng của v5.27.4.

Sau deploy, mở `tổng hợp tài liệu ôn` và thử một nét cong nhanh cùng một nét dài trên ảnh nền. Kiểm tra độ bám khi đang rê bút, điểm cuối khi nhấc và Undo. Build web/API và bộ kiểm thử tự động đã chạy qua; chưa đo độ trễ trên thiết bị người dùng.
