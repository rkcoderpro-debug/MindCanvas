# MindCanvas v5.27.8 — Sửa câu hỏi Quiz bị cắt

Cập nhật từ **v5.27.7**. Giải nén vào thư mục gốc repo và deploy lại **frontend**. Bản này không đổi API, không cần deploy lại backend v5.27.7 hoặc chạy SQL.

V5.27.7 đặt khung làm bài bên trong một vùng giữ `transform` sau hiệu ứng chuyển cảnh. Khi đó, trình duyệt tính chiều cao khung cố định theo vùng cha, khiến phần câu hỏi co lại dù màn hình còn nhiều chỗ. Khung hoạt động giờ bám trực tiếp vào vùng hiển thị; câu hỏi dài chỉ cuộn bên trong và hàng nút vẫn ở ngoài vùng cuộn.

Sửa cùng khung cho Quiz cá nhân, Quiz lớp học, Flashcard, Lab và các hoạt động chia sẻ. Khi đổi mục đang xem, khung tương ứng ẩn đi và phiên hiện tại vẫn được giữ theo hành vi trước đó.

Sau deploy, tải lại trang nếu vẫn thấy v5.27.7. Mở lại Quiz từng bị cắt và xác nhận thấy câu hỏi, đủ đáp án và nút **Câu tiếp** cùng lúc.
