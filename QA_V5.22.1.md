# QA v5.22.1

Nguồn kiểm thử: v5.22.0 trong workspace, bổ sung Exam Studio AI Manual. Không triển khai lên production và không gọi AI bên ngoài thay người dùng.

| Kiểm tra | Kết quả |
| --- | --- |
| Test web đầy đủ | 571/571 đạt, 83 file test |
| Test server đầy đủ | 62/62 đạt |
| Typecheck web và server | Đạt |
| Build web và server | Đạt; Vite có cảnh báo kích thước chunk hiện có |
| Version và PWA | Root/web/server/lock 5.22.1; worker `mindcanvas-shell-v5.22.1` |
| Dependency và SQL | Không thêm dependency/migration |

34 test mới: 18 test mô hình nhập Manual, 7 test đọc nguồn/gói đầu vào, 9 test giao diện bổ sung. Các test Auto và các bản sửa trước đó tiếp tục chạy trong bộ đầy đủ. Một test DOCX dùng output `arraybuffer` thay vì `uint8array` để phù hợp kiểu `BlobPart` TypeScript; đã chạy lại riêng nhóm đọc nguồn sau thay đổi này.

## Đã kiểm chứng bằng test

- Luồng chọn thuộc tính → lấy prompt → nhập cả cấu trúc và đề trong một lần. Với nguồn chữ Manual không cần checkbox xác nhận nội dung hoặc xác nhận cấu trúc.
- Prompt chứa mức độ, thuộc tính và mã nguồn; snapshot giữ lựa chọn/tài liệu tại lúc lấy prompt. Thay lựa chọn sau đó không gắn sai metadata cho kết quả đã nhập.
- Quiz đúng 4 lựa chọn; đề nhiều dạng gồm mcq/short/essay/truefalse/other; đáp án/lời giải tách khỏi phần xem đề, đầu ra hỗn hợp dùng nút PDF hiện có.
- JSON sai, quá lớn, sai số câu/thời gian/điểm, thiếu phần, sai lựa chọn/đáp án/rubric, trùng câu/mã và trích dẫn sai bị chặn với vị trí phần/câu. Nội dung nhập và bản xem trước cũ được giữ.
- Không gọi các hàm API Auto khi đọc nguồn, lấy prompt, nhập đề hoặc tạo lại câu Manual. Test đọc nguồn chặn `fetch` để kiểm tra không upload tài liệu.
- File văn bản UTF-8 đọc cục bộ; DOCX tổng hợp có đoạn, bảng và chữ trong công thức; PDF dùng mock PDF.js cho nhiều trang/trang scan, giữ dấu trang và giải phóng worker; ảnh chuyển sang prompt OCR ngoài.
- OCR cần bản chép được bổ sung và rà soát. Nguồn `[UNREADABLE]` chưa được phép dùng để tạo prompt đề.
- Gói AI ZIP chứa đúng prompt, mã nguồn, văn bản và bytes file gốc; tên/đường dẫn được làm sạch. Gói này không phải xuất đề thi.
- Nhập hợp lệ gọi hạn mức Manual; lỗi cấu trúc không tính hạn mức. Lỗi hạn mức giữ JSON; thử lại dùng cùng mã yêu cầu. Chạm nhanh không gửi hai thao tác; nhập lại cùng prompt giữ mã đề khi lưu Quiz.
- Tạo lại một câu qua prompt riêng; kiểm tra cấu trúc, tránh câu cũ và kiểm tra đề ghép; giữ mã câu cùng các phần còn lại. Nếu đề/câu mục tiêu đổi thì không áp dụng kết quả cũ.
- Phục hồi prompt/JSON đang nhập theo tài khoản; tài khoản khác không thấy bản nháp này; dữ liệu workspace cũ mặc định Auto.

## Phạm vi chưa kiểm chứng

Giao diện kiểm thử bằng React/jsdom; không có kiểm chứng trực quan trên trình duyệt thật, Safari/iPhone/iPad, clipboard/download thực tế hoặc PDF được xuất và mở thực tế trong phiên này. PDF giữ cơ chế in trình duyệt của v5.22.0; các test PDF hiện có kiểm tra markup, phần đáp án riêng và lời gọi in mô phỏng, không tạo file PDF vật lý.

Không gọi Gemini, ChatGPT hoặc Supabase production. API hạn mức trong test giao diện được mock; việc retry cùng mã yêu cầu và payload của API dùng cơ chế có sẵn. Không xác nhận kết quả trả về của AI ngoài với mọi đề thực tế, độ chính xác OCR hoặc tính đúng chuyên môn của mọi lời giải. PDF.js trong nhóm đọc nguồn được mock, chưa chạy trích xuất PDF thật qua worker Safari.

Build/test Vite dùng config tạm ngoài nguồn với `preserveSymlinks` để phù hợp sandbox Windows; config này không nằm trong ZIP. ZIP không chứa file gốc tài liệu, log nội bộ, môi trường, `node_modules` hoặc bản build.
