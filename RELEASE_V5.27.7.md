# MindCanvas v5.27.7 — Không gian học gọn và chọn ngôn ngữ nội dung

Cập nhật từ **v5.27.6**. Giải nén vào thư mục gốc có `package.json` và `apps/`. Bản này thay đổi API tạo nội dung, vì vậy deploy lại **backend trước, frontend sau**. Không có migration SQL hay biến môi trường mới.

- Quiz, Flashcard và Lab dùng khung vừa màn hình, kể cả các luồng học liệu chia sẻ. Nút chuyển câu, nộp bài, lật/đánh giá thẻ hoặc chạy lại Lab không nằm cuối vùng cuộn. Câu hỏi và thẻ dài chỉ cuộn trong vùng nội dung. Thư viện Lab chia trang; màn đọc tài liệu và danh sách canvas vẫn cuộn bình thường.
- Các màn hình chi tiết dùng điều hướng Quay lại thống nhất. Nút đóng ở ngoài vùng cuộn của hộp tạo và Cài đặt; bấm nền hoặc Esc cũng đóng hộp thoại. Các luồng tạo giữ bản nháp trong phiên; Lab lưu bản nháp trên thiết bị khi đóng.
- Sửa xem trước Quiz: phương án dài xuống dòng; công thức có vùng xem trước riêng; nút chuyển bước và lưu luôn thấy. Hộp tạo tài liệu giữ màn hình toàn trang.
- Chọn **Tiếng Việt / English** độc lập với giao diện trong Quiz, Flashcard AI, sơ đồ tư duy, AI theo vùng chọn, Lab AI và kế hoạch học AI. Takenote, Learning Hub, đề thi và bài tập có thêm **Song ngữ Việt–Anh**. Hai bản nằm liền nhau; câu hỏi vẫn dùng chung số thứ tự, đáp án và điểm. AI Manual dùng lựa chọn trong prompt; file nhập tay giữ nội dung gốc.

Sau khi triển khai, thử nguồn tiếng Việt và chọn English trong Quiz, sau đó thử một Learning Hub song ngữ. Kiểm tra Quiz có lời giải dài, Flashcard dài và Lab trên điện thoại/iPad ở cả hai hướng xoay. Các kích thước và thao tác chạm trên thiết bị thật cần xác nhận sau deploy.
