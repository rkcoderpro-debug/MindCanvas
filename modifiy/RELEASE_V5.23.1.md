# MindCanvas v5.23.1 — Giao diện tạo đề tập trung

Áp dụng trên v5.23.0. Giải nén ZIP vào thư mục gốc dự án chứa package.json, apps/ và packages/, ghi đè đúng các đường dẫn. Chạy npm ci nếu môi trường triển khai chưa có dependency của v5.23.0, sau đó chạy quy trình build/deploy hiện có. Không có dependency, biến môi trường hoặc migration SQL mới. Phiên bản root/web/server/lock và cache PWA chuyển sang 5.23.1.

## Giao diện

- Trang Tạo đề thi dùng toàn bộ chiều rộng nội dung, gồm cả vùng Learning Hub khi mở mục đề thi. Bỏ khung chờ bên phải. Nút AI Auto / AI Manual ở đầu trang, có trạng thái chọn và hỗ trợ bàn phím.
- Màn hình tạo và xem kết quả tách nhau. Có Quay lại thiết lập và mở lại đề đang có; thiết lập, nguồn, JSON và kết quả không bị xóa khi quay lại. Thư viện đề nằm dưới phần tạo.
- Thuộc tính chính ở phía trên; thông tin môn/trình độ/ngôn ngữ và các thuộc tính phụ nằm trong Tùy chọn nâng cao. Bố cục thu về một cột trên điện thoại.

## AI Auto

Tải file mẫu/tài liệu hoặc nhập kiến thức, thông tin và nội dung cần tạo đề trực tiếp vào ô đang hiển thị, rồi bấm Tạo đề bằng AI. Không cần bấm Thêm văn bản hoặc xác nhận cấu trúc để dùng thao tác này. Ứng dụng phân tích cấu trúc nếu chưa có cấu trúc phù hợp, tạo đề, kiểm tra dữ liệu, rồi chuyển sang xem kết quả. Các công cụ đối chiếu nguồn/chỉnh cấu trúc cũ vẫn còn trong mục tùy chọn.

Giữ engine và đầu ra Auto hiện có: Quiz 4 lựa chọn hoặc đề nhiều dạng theo mẫu xuất PDF. Các giới hạn nguồn, số câu, hạn mức, kiểm tra [UNREADABLE], đáp án và lời giải tiếp tục áp dụng. Nội dung nhập trực tiếp vẫn phải cung cấp đủ thông tin để tạo đề; không bổ sung chế độ tìm kiếm kiến thức ngoài nguồn trong bản này.

Khi tạo lỗi, giữ nguồn, cấu trúc đã phân tích và kết quả trước đó để sửa/thử lại. Một thao tác đang chạy khóa nút và chuyển chế độ nhằm tránh request trùng.

## AI Manual

Prompt xuất hiện ngay, tự cập nhật theo thuộc tính; không yêu cầu file tải lên hoặc bước Lấy prompt. Bấm Sao chép prompt rồi gửi cùng file gốc cho AI ngoài. Prompt Word vẫn yêu cầu hai DOCX thật (đề và đáp án riêng); prompt tương tác vẫn yêu cầu JSON đủ năm dạng câu.

Nếu người dùng đính kèm tài liệu trực tiếp cho AI ngoài, danh sách file trong MindCanvas được để trống. Prompt hướng dẫn AI không tự bịa mã file và trả references: [] khi chưa có mã được cấp. Khi chọn file trong công cụ gói tùy chọn, tiếp tục dùng metadata/mã file thật và giữ nguyên bytes gốc, không nhúng text extract.

Tải gói và Nhập kết quả từ AI nằm dưới prompt. Gói không chọn file chỉ có prompt.txt; nếu chọn file, thêm originals/ như trước. Xem Word, nhập JSON, làm bài, chấm điểm và mở lời giải sau khi nộp giữ luồng hiện có. Thay thuộc tính hoặc sao chép prompt không xóa JSON đang dở.

Preview prompt được tạo trên thiết bị, chưa tính lượt. Giữ yêu cầu đăng nhập và hạn mức hiện có: Word tính khi sao chép prompt/tải gói, đề tương tác tính khi nhập JSON hợp lệ. Thử lại Word dùng cùng request ID và sao chép lặp cùng phiên không tính lượt mới. Manual không gọi API đọc/tạo đề Auto.

Đọc QA_V5.23.1.md để biết phạm vi kiểm chứng.
