# QA MindCanvas v5.27.3

- 715 kiểm thử frontend và 69 kiểm thử API đã đạt. Build production cho web và API đã chạy qua.
- Kiểm tra PostgreSQL cách ly với migrations 0033/0034: canvas cũ tự chuyển khi được bật; canvas mới không được công khai trước khi có đủ ảnh; người ngoài không thể chiếm draft/đọc hoặc tải ảnh lên prefix không thuộc quyền; quota tính ảnh không trùng; không thể giả số byte; hạ về v1 bị chặn; canvas đã chuyển vẫn lưu được khi tắt chuyển đổi chung.
- Kiểm tra luồng lưu trên dữ liệu mô phỏng gần 12 MB: lần lưu sau chuyển gửi payload dưới 2,5 KB cho một nét vẽ, không upload lại hai ảnh, mở lại khôi phục được ảnh và PNG/data nguồn. Lỗi upload không tạo canvas rỗng hoặc ghi đè dữ liệu cloud.
- Kiểm tra UI trong trình duyệt mô phỏng: mở thẳng canvas từ URL, sao chép đúng link, lịch sử Quay lại/Tiến tới, canvas không có trên thiết bị, đích sau đăng nhập được lấy một lần. Link không sao chép mã mời hoặc tham số phiên.
- Chưa chạy migration, bật công tắc, đo latency hoặc thử OAuth trên Supabase/Render production.
