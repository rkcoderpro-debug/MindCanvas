# MindCanvas v5.22.1 — Exam Studio AI Manual

Bản vá này áp dụng trên nguồn v5.22.0. Giải nén ZIP vào thư mục gốc dự án chứa `package.json`, `apps/` và `packages/`; ghi đè các file cùng đường dẫn. ZIP chỉ gồm file thay đổi, file mới và bản kê thay đổi. Không kèm `node_modules`, `dist`, cấu hình bí mật hoặc migration SQL.

## Luồng sử dụng

1. Mở Exam Studio, chọn **AI Manual**.
2. Chọn tài liệu hoặc đề mẫu, mức **Dễ / Vừa / Khó**, hình thức **Quiz 4 lựa chọn** hoặc **Đề nhiều dạng theo mẫu**, môn, trình độ và ngôn ngữ.
3. Chọn số câu, thời gian, điểm mỗi câu và yêu cầu bổ sung. Với mẫu đề, để trống các thuộc tính số để giữ theo mẫu. Không có bước xác nhận cấu trúc riêng.
4. Bấm **Lấy prompt tạo đề**, sau đó **Sao chép prompt** hoặc **Tải gói gửi AI**. Gửi prompt và tài liệu cho AI bên ngoài. Gói ZIP đầu vào gồm prompt, văn bản nguồn, mã nguồn và các file gốc đã chọn trong lần mở trang hiện tại.
5. Dán JSON hoặc chọn file JSON kết quả, bấm **Nhập kết quả & xem đề**. AI trả cả `blueprint` và `draft` trong một kết quả. Khi dữ liệu sai, thông báo chỉ rõ phần/câu và giữ nguyên nội dung nhập cùng bản xem trước đang có.
6. Xem, chỉnh sửa, đối chiếu nguồn và bấm **Đáp án & lời giải**. Quiz lưu vào thư viện Quiz hiện có. Đề nhiều dạng chỉ có nút xuất PDF; phần đề đứng trước, đáp án và lời giải ở phần riêng phía sau.

Manual đọc chữ PDF, DOCX và TXT/MD/CSV trong trình duyệt. Ảnh PNG/JPG/WEBP và trang PDF scan dùng **Lấy prompt đọc nguồn** để gửi file gốc cho AI bên ngoài, dán bản chép vào nguồn rồi rà soát và đánh dấu đã kiểm tra nội dung OCR. Không tạo prompt đề nếu nguồn còn `[UNREADABLE]`. Manual không gọi Gemini hoặc các endpoint đọc nguồn, phân tích, tạo đề Auto. PPTX vẫn thuộc luồng Auto.

Nhập kết quả hợp lệ sử dụng endpoint hạn mức **AI Manual** hiện có; endpoint này chỉ nhận mã yêu cầu, không nhận tài liệu hoặc đề. Cần đăng nhập. Mỗi prompt có mã yêu cầu ổn định để thử lại; nhập sai cấu trúc không gửi yêu cầu tính hạn mức. Nhập lại kết quả của cùng prompt giữ mã đề ổn định. Tạo lại một câu trong đề Manual tạo prompt riêng, nhập kết quả thay đúng câu và giữ các câu còn lại.

## Lưu và giới hạn

- Chế độ, thuộc tính, prompt, nguồn và JSON đang nhập tự lưu theo tài khoản trên trình duyệt. Bản nháp v5.22.0 vẫn mở được và mặc định Auto. Đề đã lưu giữ chế độ tạo để thao tác tạo lại câu dùng đúng chế độ.
- File gốc chỉ nằm trong bộ nhớ của lần mở trang hiện tại. Sau khi mở lại trang, văn bản nguồn và prompt vẫn có; với OCR cần tự đính kèm lại file gốc cho AI ngoài. `README.txt` trong gói đầu vào và giao diện OCR cũng giải thích việc này.
- Tối đa 6 nguồn, 10 MB/file, 120.000 ký tự nguồn, 12 phần, 100 câu hoặc giới hạn gói tài khoản thấp hơn, 1.000 tổng điểm; JSON nhập tối đa 2 MB. Bản nháp tự lưu tối đa 4 MB, prompt tối đa 600.000 ký tự.
- Trích xuất PDF/DOCX có thể mất bố cục, hình và cách trình bày công thức. DOCX không gán số trang Word giả. PDF giữ dấu trang đọc được. Người dùng cần đối chiếu nội dung với file gốc.
- Kiểm tra tự động gồm cấu trúc, số câu, thuộc tính đã chọn, loại câu, lựa chọn, đáp án, rubric, mã/trùng nội dung và nguồn/trang/trích dẫn. Kiểm tra này không chứng minh lời giải đúng chuyên môn hoặc cấu trúc AI thực sự giống mọi chi tiết của đề mẫu; cần xem lại trước sử dụng.
- PDF giữ cách xuất v5.22.0: mở hộp thoại in và chọn **Lưu thành PDF**. Gói gửi AI là đầu vào cho AI, không phải định dạng xuất đề thi.

## Triển khai

Không có dependency npm mới, biến môi trường mới hoặc migration SQL mới. Đưa các file trong ZIP vào nguồn v5.22.0 rồi chạy quy trình build/deploy hiện có. Giữ `packages/shared/src` và backend đang cung cấp `/api/ai/manual/usage/consume`; backend Auto và cấu hình tài khoản giữ nguyên. Phiên bản root/web/server và cache PWA chuyển sang 5.22.1.

Kết quả và giới hạn kiểm chứng ở `QA_V5.22.1.md`.
