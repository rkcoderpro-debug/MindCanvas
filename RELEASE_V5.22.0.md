# MindCanvas v5.22.0 — Tạo đề thi

Bản vá áp dụng trên **v5.21.0**. Mở Learning Hub → **Tạo đề thi**.

## Hai hình thức

| Hình thức | Nguồn và kết quả |
| --- | --- |
| Quiz thông thường | Tạo theo tài liệu hoặc tương tự đề mẫu. Mọi câu có 4 lựa chọn, 1 đáp án đúng; lưu vào Quiz hiện có. |
| Đề nhiều dạng | Cần đúng một đề mẫu; có thể thêm tài liệu kiến thức. Theo cấu trúc mẫu, gồm trắc nghiệm, trả lời ngắn, tự luận, đúng/sai và dạng khác. Xem trên web; chỉ xuất PDF. |

Đề nhiều dạng giữ số lựa chọn của phần trắc nghiệm theo cấu trúc đã xác nhận (2–8 lựa chọn). Dạng nhiều đáp án đúng/ghép cặp được biểu diễn bằng “Dạng khác theo mẫu”, có yêu cầu rõ và hướng dẫn chấm; không chấm tương tác trên web.

## Luồng sử dụng

1. Chọn hình thức, cách tạo, mức Dễ/Vừa/Khó, môn, lớp/trình độ và ngôn ngữ Việt/Anh.
2. Tải PDF, DOCX, PPTX, TXT/Markdown/CSV hoặc ảnh PNG/JPG/WebP; chọn tài liệu đã lưu hoặc dán văn bản. Tối đa 6 nguồn, 10 MB/file và 120.000 ký tự tổng nội dung.
3. Xem/sửa nội dung đọc được và xác nhận cảnh báo. Ảnh/PDF có trang thiếu chữ dùng AI để đọc. Phần không đọc được được đánh dấu `[UNREADABLE]`; cần bổ sung trước khi tạo đề. DOCX được đọc theo văn bản, không giữ số trang vật lý hoặc hình vẽ.
4. Phân tích cấu trúc bằng AI hoặc tự nhập cấu trúc theo nguồn đã xem. Xác nhận thứ tự phần, loại câu, số câu, lựa chọn, điểm và thời gian. Tối đa 100 câu, đồng thời tuân theo giới hạn số câu của gói hiện tại.
5. Tạo bản nháp. Máy chủ kiểm tra cấu trúc và chạy thêm một lượt AI rà soát đáp án/lời giải. Nếu không đạt, báo lỗi thay vì trả đề lỗi; bản nháp trước đó vẫn được giữ.
6. Sửa nội dung, lựa chọn, đáp án, lời giải và ý chấm; đổi thứ tự câu trong phần hoặc tạo lại riêng một câu. Lưu đề hoặc lưu Quiz.

Mức Dễ ưu tiên nhận biết/áp dụng trực tiếp; Vừa ưu tiên hiểu/vận dụng; Khó kết hợp nhiều bước suy luận, vẫn trong phạm vi nguồn. Các phép kiểm tra không thay cho người ra đề duyệt kiến thức và lời giải trước khi sử dụng.

## Xem đáp án và PDF

Nút **Đáp án & lời giải** chuyển sang một mục riêng khi xem đề. Mục này có đáp án, giải thích, hướng dẫn chấm và nút xem trích đoạn tài liệu/trang nguồn. Phần xem câu hỏi không xen đáp án/lời giải.

Nút **Xuất PDF** mở cửa sổ in của trình duyệt. Chọn **Lưu thành PDF** trong hộp thoại của máy tính; trên thiết bị di động dùng chức năng lưu/chia sẻ PDF của bản xem trước in. Đây không phải tải file PDF tự động từ máy chủ. Toàn bộ đề nằm trước; đáp án và lời giải ngắt trang sang phần riêng phía sau, chung một PDF. Không có nút xuất DOCX/HTML/JSON cho đề nhiều dạng.

## Lưu trữ và hạn mức

- Đề và bản nháp lưu trên trình duyệt/thiết bị hiện tại, tách theo tài khoản; **không đồng bộ thư viện đề nhiều dạng giữa thiết bị** ở bản này. Quiz vẫn dùng cơ chế lưu Quiz hiện có.
- Nguồn gốc không bị ghi đè. Mạng/AI lỗi không xóa nguồn, thiết lập hoặc bản nháp đang xem. Lỗi dung lượng/quyền lưu trữ được báo rõ.
- Đọc nguồn có chữ không gọi AI; đọc ảnh/PDF scan dùng lượt AI. Phân tích cấu trúc, tạo đề và tạo lại một câu là các thao tác AI riêng, dùng hạn mức hiện có. Tạo đề và lượt rà soát đi chung một lần đặt trước hạn mức; lỗi trước khi thành công giải phóng lượt đặt trước theo cơ chế hiện có.
- Có thể tự nhập cấu trúc để bỏ lượt phân tích AI. Với gói có ít lượt, cân nhắc dán văn bản đã đọc và tự nhập cấu trúc.

## Áp dụng ZIP

1. Giải nén ghi đè tại gốc project v5.21.0 có `package.json`, `apps` và `packages`. Không có thư mục bọc ngoài trong ZIP.
2. Chạy `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` ở gốc project. Không thêm dependency npm mới.
3. Triển khai **cả web và backend**. Backend cần cấu hình Gemini/Supabase hiện có. Giữ thư mục `packages/shared/src` khi triển khai: backend build dùng module kiểm tra đề JavaScript dùng chung ở đó.
4. Cập nhật PWA theo luồng hiện có, xác nhận giao diện/API health cùng 5.22.0, rồi kiểm tra Learning Hub → Tạo đề thi.

Không có SQL mới hoặc file cần xóa. ZIP chỉ gồm mã nguồn/test/hướng dẫn thêm hoặc sửa cùng danh sách file; không có `.env`, dependencies, output build, log, bản nháp hay dữ liệu riêng của người dùng.

Đọc `QA_V5.22.0.md` về kết quả test và phần chưa kiểm chứng, đặc biệt in/lưu PDF thực tế và Safari/iPad.
