# MindCanvas v5.23.0 — Word theo mẫu và đề tương tác

Bản cập nhật áp dụng trên nguồn v5.22.1. Giải nén ZIP vào thư mục gốc dự án chứa `package.json`, `apps/`, `packages/` và ghi đè các đường dẫn tương ứng. ZIP chỉ gồm các file thay đổi/mới và bản kê thay đổi; không có `node_modules`, `dist`, file tài liệu người dùng hoặc cấu hình bí mật.

## AI Manual mới

Trong Exam Studio, chọn AI Manual. Giao diện có hai chế độ:

### Word theo mẫu — dùng ngay

Chọn file đề mẫu, mức Dễ/Vừa/Khó; thuộc tính bổ sung như số câu, thời gian, môn, trình độ, ngôn ngữ, điểm và yêu cầu riêng nằm trong mục mở rộng. Các thuộc tính số để trống sẽ giữ theo mẫu. Bấm **Lấy prompt**, sau đó sao chép hoặc tải gói gửi AI.

Prompt hướng dẫn AI đọc file gốc và tạo hai file Word tải được: `de-thi.docx` và `dap-an-loi-giai.docx`. Đề không chứa lời giải hoặc đáp án được đánh dấu, kể cả khi mẫu là tài liệu có lời giải. Yêu cầu giữ sát khổ giấy, lề, font/cỡ chữ, bảng, vùng trả lời, phần thông tin học sinh, header/footer, đánh số trang, thứ tự phần, dạng câu và điểm của mẫu; không trả JSON hoặc văn bản để tự chuyển sang Word.

Người dùng gửi prompt/file cho AI ngoài có khả năng đọc tài liệu và tạo DOCX. Hai file nhận được dùng trực tiếp trong Word. Nếu muốn xem/lưu trên MindCanvas, chọn file Word đề và file Word đáp án riêng rồi bấm **Lưu & xem Word**. Các file được lưu nguyên bytes; nút **Đáp án & lời giải Word** mở tài liệu đáp án riêng. Có nút tải lại từng file. Không cần nhập JSON hoặc dựng lại bố cục từ text.

MindCanvas không trực tiếp tạo hai file Word bằng AI và không bảo đảm mọi AI ngoài giữ mẫu giống tuyệt đối. Cần đối chiếu Word thực tế với mẫu, đặc biệt mẫu PDF có nhiều bảng/công thức/code. Khi AI ngoài không tạo được DOCX thật, prompt yêu cầu nói rõ thay vì đưa liên kết giả.

### Làm trực tiếp trên MindCanvas

Chọn tài liệu, mức độ, số câu và một hay nhiều dạng bài: trắc nghiệm 4 lựa chọn, điền khuyết, tính toán/nhập kết quả, trả lời ngắn, tự luận. Không cần giữ bố cục trang giống mẫu. Prompt yêu cầu JSON `schemaVersion: 1`, danh sách `questions` và đáp án/lời giải. Dán JSON hoặc chọn file JSON, rồi bấm **Nhập đề tương tác**. Cấu trúc và thuộc tính được kiểm tra trước khi tính hạn mức; lỗi chỉ rõ câu và giữ nguyên JSON cùng bản xem trước đang có.

Bấm **Làm bài trên MindCanvas** để vào màn hình làm bài riêng. Đáp án/lời giải không hiển thị ở bản xem trước hoặc màn hình làm bài chưa nộp. Sau khi nộp, câu trả lời khóa lại; mới xuất hiện đáp án, lời giải, hướng dẫn chấm và tham chiếu file gốc.

- MCQ: đúng một trong bốn lựa chọn, chấm tự động.
- Điền khuyết: nhiều ô, đáp án được chấp nhận, tùy chọn phân biệt hoa/thường; tính điểm theo số ô đúng.
- Tính toán: nhập số thập phân (dấu chấm/phẩy) hoặc ký hiệu khoa học, chấm theo giá trị và sai số tuyệt đối/tương đối được đề quy định. Kiểm tra đơn vị và chữ hoa/thường của đơn vị; không tự đổi thang đo hay tính biểu thức như `5/2`. Đáp án hexadecimal nên dùng trả lời ngắn với các cách viết được chấp nhận.
- Trả lời ngắn: chấm theo danh sách đáp án; câu mở không có danh sách dùng đáp án mẫu/rubric để tự chấm.
- Tự luận: không giả lập AI chấm. Sau khi nộp, người học xem đáp án/rubric và tự ghi điểm trong khoảng điểm câu. Điểm tự động và câu còn cần tự chấm được báo riêng.

Bài làm tự lưu theo tài khoản, mã đề và phiên bản đề. Mở lại có thể tiếp tục bài đang dở hoặc xem bài đã nộp. Đề có thời gian sẽ giữ hạn chót qua lần mở lại; hết giờ tự nộp. Nút quay lại đợi lưu xong, giữ màn hình nếu lưu thất bại. **Làm lượt mới** thay bài làm gần nhất của phiên bản đó; không có lịch sử nhiều lượt trong bản này.

Nút **Chỉnh sửa đề JSON** đưa đề vào ô nhập để sửa và áp dụng lại. Nội dung không đổi giữ mã/phiên bản và bài làm; thay đổi nội dung tạo phiên bản bài làm mới. Các đề v5.22.x đã lưu vẫn có trong thư viện; có thể làm qua giao diện mới, giữ câu trắc nghiệm chấm tự động và dùng tự chấm cho câu mở. Bản nháp/JSON cũ ở kho cũ không bị xóa; kết quả mới dùng schema/giao diện mới. Quiz hiện có và AI Auto giữ luồng riêng như trước.

## Prompt và gói file gốc

Prompt chỉ chứa hướng dẫn, thuộc tính và tên/mã/vai trò file; không nhúng bản trích xuất tài liệu, `BEGIN SOURCE DATA` hoặc nội dung OCR. Gói chỉ có `prompt.txt` và `originals/<số thứ tự>/<tên file>`. File trùng tên nằm trong thư mục riêng, không bị ghi đè. Không tạo `sources/`, `sources.json`, README hoặc bản text thay thế file gốc.

PDF/DOCX/TXT/MD/CSV/PNG/JPG/WEBP được lưu nguyên file trên thiết bị, tối đa 6 nguồn, 10 MB/file. Ảnh/PDF scan được gửi trực tiếp cho AI ngoài, không cần nhập OCR riêng vào MindCanvas. File gốc có thể dùng lại sau khi tải lại trang; nếu dữ liệu trình duyệt bị xóa hoặc thiếu file, tải gói báo rõ và cần chọn lại file/lấy prompt mới, không thay bằng bản extract.

Với văn bản dán, có mục **Văn bản gửi AI riêng**; gửi phần này trong tin nhắn riêng. Prompt chỉ ghi nhận mã nguồn, không chứa nội dung; gói không tạo thêm file source. Các nguồn tham chiếu trong JSON phải nằm trong danh sách file đã chọn, nhưng không ép trích dẫn khớp tuyệt đối một bản text trích xuất. Nội dung/trang tham chiếu cần đối chiếu với file gốc.

Manual cần đăng nhập và dùng endpoint hạn mức hiện có. Word tính một lượt lúc lấy prompt. Đề tương tác tính lúc nhập kết quả hợp lệ; thử lại dùng mã ổn định, sửa/nhập lại cùng phiên làm việc không gửi lượt lặp. API hạn mức chỉ nhận mã yêu cầu, không nhận tài liệu. Không gọi Gemini hoặc các endpoint AI Auto cho luồng Manual này.

## Lưu trữ và triển khai

File gốc/Word, thư viện và bài làm dùng IndexedDB mới `mindcanvas-exam-studio-v1`; bản nháp dùng localStorage theo tài khoản. Lưu nhóm file trong một transaction, lỗi dung lượng không giả báo thành công. Đây là dữ liệu trên thiết bị, chưa có đồng bộ cloud/chia sẻ bài làm. JSON tối đa 2 MB, bản nháp tối đa 3 MB, văn bản riêng tối đa 120.000 ký tự; đề tương tác tối đa 100 câu hoặc giới hạn gói thấp hơn, tổng 1.000 điểm.

Không có dependency npm, migration SQL hay biến môi trường mới. Overlay ZIP trên v5.22.1, chạy quy trình build/deploy hiện có. Backend cần tiếp tục cung cấp `/api/ai/manual/usage/consume`; các endpoint Auto không thay đổi. Root/web/server và PWA chuyển sang 5.23.0.

Đọc `QA_V5.23.0.md` để biết kết quả và giới hạn kiểm chứng.
