# MindCanvas v5.27.6 — Làm mượt nét bút khi vẽ

Cập nhật từ **v5.27.5**. Giải nén vào thư mục gốc có `package.json` và `apps/`, sau đó build và deploy lại frontend. Không có migration SQL hay biến môi trường mới.

- Bút và bút đánh dấu làm dịu gợn nhỏ và bo các chỗ chuyển hướng nhẹ ngay khi vẽ. Đầu nét và điểm nhấc bút giữ đúng vị trí đã vẽ. Góc rõ và nét quay đầu vẫn được giữ.
- Chỉ phần cuối của nét xem trước thay đổi theo các mẫu mới. Canvas chính không dựng lại theo từng mẫu, và khi nhấc bút vẫn chỉ ghi một lần cho một nét.
- Hình nét lúc vẽ và sau khi lưu dùng cùng một bộ điểm. Nét cũ giữ nguyên. Đồng bộ v2 và đường link canvas giữ nguyên cách hoạt động.

Sau deploy, mở canvas nhiều ảnh và vẽ vòng tròn, một chữ nhỏ và một nét gấp góc. Kiểm tra độ bám khi rê, hình nét khi nhấc bút và khi mở lại canvas. Chưa đo độ trễ trên thiết bị thật.
