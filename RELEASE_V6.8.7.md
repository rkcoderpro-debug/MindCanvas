# MindCanvas v6.8.7

## Responsive

- Workspace bám chiều cao cửa sổ, kể cả khung ngang thấp. Trang thư mục và Kế hoạch học tập xử lý tên dài. Bố cục Quiz, Flashcard, Lab điều chỉnh theo phần chiều rộng thực tế còn lại sau sidebar.
- Canvas vô hạn giữ tâm vùng đang xem khi kích thước vùng vẽ thay đổi. Bảng Thuộc tính tự chuyển sang dạng phủ khi vùng làm việc hẹp. Sidebar có thêm thao tác đổi chiều rộng bằng phím mũi tên, Home và End.
- Canvas A4 giữ vị trí đọc khi chế độ vừa chiều rộng đổi tỷ lệ. Chat và hộp thoại bám vùng hiển thị còn lại khi mở bàn phím ảo. Khung chat xử lý tên người dùng và tin nhắn dài.
- Trình đọc PDF mặc định vừa chiều rộng. Có thể thu phóng thủ công và bấm chỉ số phần trăm để về chế độ vừa chiều rộng.

## Kiểm thử responsive

Bộ kiểm thử Chromium đi qua 18 màn hình ở 17 kích thước, từ 280 × 720 đến 3440 × 1440. Kiểm thử dùng dữ liệu cố định, chặn tài nguyên ngoài và đợi nội dung mẫu xuất hiện trước khi đo các trang học tập. Các luồng tương tác kiểm tra vị trí vùng vẽ, bảng Thuộc tính, trang A4, phân trang PDF, vị trí vùng nhập chat và nút xác nhận hộp thoại khi giả lập bàn phím, cùng luồng học Quiz, Flashcard và Lab.

Đã chạy 168 bài Vitest và các luồng tương tác trên Chromium. Việc kiểm tra bàn phím dùng vùng hiển thị giả lập. Build đầy đủ trong môi trường kiểm thử đang thiếu dependency `livekit-client`.

Chạy từ thư mục gốc trên Windows sau khi cài các dependency của dự án.

```powershell
$env:MINDCANVAS_CHROMIUM = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:responsive --workspace apps/web
```

Dùng `-- --quick` sau lệnh npm để thu ma trận bố cục về hai kích thước đại diện. Khi kiểm thử lỗi, đầu ra ghi kích thước, đường dẫn, số đo tràn ngang và phần tử che nút nếu có.

| Cần xác nhận ngoài bộ kiểm thử Chromium | Điều kiện đạt |
| --- | --- |
| Safari iPhone, PWA và bàn phím iOS thật | Vùng nhập, gửi, đóng và quay lại luôn bấm được, bản nháp giữ nguyên khi xoay |
| Safari iPad Split View, tablet Android và thiết bị Windows có bút | Vẽ đúng tọa độ, cử chỉ không gây nét thừa, đổi chiều rộng bảng Thuộc tính bằng chuột và bàn phím |
| Windows Snap, scaling 125% và 150%, Firefox và WebKit | Khung ngắn vẫn cuộn đúng vùng, không mất nút chính ở 320 px và chế độ thu phóng |
| Luồng có tài khoản, lớp học, Admin và cuộc gọi LiveKit | Quyền và thao tác đúng theo vai trò, bố cục ổn định với dữ liệu thật và nhiều trạng thái |
| Trạng thái tải chậm, ngoại tuyến và phục hồi | Trang và bản nháp giữ đúng trạng thái khi đứt mạng hoặc mở lại |

## Cập nhật

Chép nội dung gói vào thư mục gốc theo đúng đường dẫn. Bản này dùng schema hiện có.

```powershell
git add -A
git commit -m "Cập nhật v6.8.7 tối ưu responsive MindCanvas"
git push origin head:main
```

