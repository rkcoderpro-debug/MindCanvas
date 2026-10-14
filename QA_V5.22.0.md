# QA MindCanvas v5.22.0

## Kết quả đã chạy

| Hạng mục | Kết quả |
| --- | --- |
| Toàn bộ web | 81 file, 537 test đạt, 0 lỗi |
| Toàn bộ server | 62 test đạt, 0 lỗi |
| Test mới | 33 web + 8 server = 41 test đạt |
| Typecheck web/server | Đạt |
| Build web/server | Đạt |
| Import module từ server build | Đạt; runtime dùng chung tải được, health release 5.22.0 |

Các test hồi quy flashcard, chia sẻ, DOCX, Quiz, phiên đăng nhập và PWA có sẵn đều nằm trong bộ test đã đạt. Build web có cảnh báo chunk lớn hơn 500 kB, build hoàn thành.

## Phạm vi kiểm tra mới

- 17 test dữ liệu/đề: tổng câu/điểm, đúng 4 lựa chọn cho Quiz, số lựa chọn theo mẫu cho đề nhiều dạng, giới hạn nguồn, yêu cầu đề mẫu, loại câu, số câu từng phần, câu/mã trùng, lựa chọn trùng, đáp án không khớp, điểm/rubric, sourceId, số trang, trích dẫn đúng trang, sao chép nguyên văn mẫu và chuyển sang Quiz.
- 5 test lưu trữ: lưu/cập nhật không tạo bản trùng, tách tài khoản, không xóa đề của tài khoản khác, không ghi đè đề hợp lệ bằng bản sửa sai, khôi phục workspace và báo lỗi khi trình duyệt không cho lưu.
- 4 test phần PDF: phần câu hỏi không chứa đáp án/lời giải, bản in gồm đề trước/đáp án sau và ngắt trang, giữ chữ Việt/markup công thức và escape HTML, cửa sổ bị chặn được báo lỗi, gọi in với cả hai phần. Cửa sổ in được mô phỏng, không phải xuất binary PDF thật.
- 7 test React: xác nhận nguồn/cấu trúc, lưu Quiz một lần khi bấm nhanh và dùng lại id khi lưu tiếp, nhánh đề nhiều dạng chỉ có PDF, đáp án ở view riêng, giữ đề/nguồn sau lỗi mạng, mức độ gửi đúng, xem nguồn bằng nút, tạo lại một câu giữ các phần khác, chặn `[UNREADABLE]` và không lộ bản nháp tài khoản khác.
- 8 test backend: prompt ràng buộc cấu trúc/mức độ/nguồn không tin cậy, input sai/nguồn quá dài, phân tích cấu trúc, tạo đề chỉ trả sau lượt audit độc lập, audit thất bại không trả preview, nhận diện trang PDF thiếu chữ, đọc ảnh qua bộ đặt trước AI và đọc TXT không gọi AI.

## Môi trường và giới hạn

Vite/Vitest dùng cấu hình tạm `resolve.preserveSymlinks: true` do môi trường chặn native realpath; không đưa cấu hình này vào ZIP. Không cài dependency mới.

AI/Gemini trong test sử dụng response mô phỏng và key giả. **Chưa gọi Gemini thật, chưa thử tài liệu/đề mẫu thật qua toàn bộ luồng, chưa kiểm chứng độ đúng kiến thức bằng giáo viên, và chưa kết nối Supabase thật hoặc deploy production.** Hạn mức/lỗi backend tái sử dụng cơ chế hiện có; không kết luận quota thực trên tài khoản đã được thử trực tiếp.

Trình duyệt kiểm thử không khởi động được: launcher báo thiếu thư mục nền tảng Windows; Chrome headless smoke thoát với mã lỗi `-2147483645`. **Chưa kiểm thử tương tác bằng trình duyệt thật/Safari/iPad và chưa xuất, render hoặc đối chiếu một PDF binary thực tế.** Các kiểm tra PDF là HTML/CSS/KaTeX và luồng mở/in mô phỏng. Chưa xác nhận không tràn trang/cắt công thức trong mọi đề khi in thực tế.

Mẫu có hình vẽ, bảng phức tạp, chữ mờ hoặc quy tắc trình bày đặc biệt cần người dùng duyệt lại nội dung/cấu trúc. Bản đầu dựng câu hỏi bằng văn bản/công thức, không tạo lại hình/đồ thị hoặc sao chép hình từ mẫu; AI được yêu cầu tạo câu tự đủ dữ kiện và không tham chiếu hình còn thiếu.

## Kiểm tra sau triển khai

1. Tải một PDF có chữ, DOCX, TXT, ảnh rõ, ảnh mờ và PDF scan/có trang thiếu chữ. Kiểm tra nội dung đọc, công thức, bảng và cảnh báo trước khi xác nhận. Thử file quá 10 MB và tổng nguồn quá 120.000 ký tự.
2. Tạo Quiz từ nhiều tài liệu và từ đề mẫu ở Dễ/Vừa/Khó; xác nhận mỗi câu đúng 4 lựa chọn và một đáp án, lưu/mở/làm bài trong Quiz. So sánh mức độ và phạm vi kiến thức bằng người ra đề.
3. Tạo đề mẫu gồm trắc nghiệm, trả lời ngắn, tự luận, đúng/sai, dạng khác; đối chiếu số câu, thứ tự phần, số lựa chọn, điểm, thời gian và hướng dẫn chấm. Kiểm tra AI thực sự tạo câu mới và audit phát hiện lỗi nếu có.
4. Sửa một câu, đổi thứ tự, tạo lại một câu; đối chiếu đáp án/lời giải/rubric. Xác nhận các câu khác giữ nguyên và nguồn tham chiếu bấm mở đúng đoạn/trang.
5. Lưu đề, F5, đóng/mở lại tab; đăng xuất rồi vào tài khoản khác để kiểm tra tách dữ liệu. Thử mất mạng, hạn mức hết, key thiếu, AI trả lỗi và dung lượng trình duyệt đầy; bản nháp trước đó phải còn.
6. Xuất PDF bằng hộp thoại in trên desktop và Safari/iPad: lưu file, mở lại, kiểm tra đủ câu, điểm, tiếng Việt/công thức, không cắt nội dung, đáp án bắt đầu ở phần riêng sau toàn bộ đề. Thử đề dài, câu/công thức dài, cửa sổ bị chặn và hủy in.
7. Xác nhận web/API health 5.22.0, PWA cập nhật và module Tạo đề thi tải được. Đề nhiều dạng được lưu trên thiết bị, không dùng kết quả này để kết luận đồng bộ sang thiết bị khác.

Các bước thực tế ở trên chưa được chạy trong phiên này.

Tham khảo kỹ thuật đã kiểm tra: [Gemini PDF input](https://ai.google.dev/gemini-api/docs/document-processing). Bộ đọc nguồn PDF/Office và bộ hiển thị KaTeX của dự án được dùng lại.
