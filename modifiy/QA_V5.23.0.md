# QA v5.23.0

## Kiểm tra lại khi bàn giao — 15/10/2026 (Asia/Saigon)

Đã khôi phục nguồn từ ZIP v5.20 và áp dụng tuần tự các bản vá đến v5.23.0, bao gồm bước xóa `0018_v4_9_learning_shares_FIXED.sql` theo bản kê v5.20.1. Bản v5.23.0 hiện có đã đáp ứng kế hoạch được yêu cầu; không sửa thêm mã nguồn trong lần bàn giao này.

- Test web: **624/624 đạt**, 88 file test.
- Test server trong môi trường tách cấu hình thật: **62/62 đạt**, không bỏ qua test.
- Typecheck web/server và build web/server: **đạt**. Build web vẫn có cảnh báo chunk lớn hơn 500 kB.
- Đối chiếu toàn bộ 23 file trong bản kê ZIP gốc: SHA-256 đều khớp. Lần đóng gói này chỉ cập nhật QA và bản kê; mã nguồn và cấu trúc thư mục giữ đúng bản v5.23.0.
- Chuẩn bị riêng dependency Linux cho môi trường kiểm thử; không thêm dependency dự án, node_modules hoặc cấu hình tạm vào ZIP.

Các kiểm thử prompt, gói file nguyên bytes, nhập Word/JSON, chấm điểm, lưu/khôi phục bài làm và ẩn lời giải trước khi nộp đều nằm trong bộ đạt ở trên. Chưa gọi AI ngoài để tạo Word/JSON thực tế; chưa đối chiếu Word với mẫu 4 trang, kiểm chứng Safari/iPad thật hoặc triển khai production. Các giới hạn chức năng và kiểm chứng trong báo cáo gốc bên dưới vẫn áp dụng.

---

| Kiểm tra | Kết quả |
| --- | --- |
| Test web đầy đủ | 624/624 đạt, 88 file test |
| Test server đầy đủ | 62/62 đạt |
| Typecheck web/server | Đạt |
| Build web/server | Đạt; có cảnh báo kích thước chunk hiện có |
| Version và PWA | Root/web/server/lock 5.23.0; worker `mindcanvas-shell-v5.23.0` |
| Dependency / SQL | Không thêm dependency hoặc migration |

Năm file test mới chứa 61 test: mô hình/chấm điểm 29, prompt 5, lưu trữ/gói 8, runner 8, giao diện Studio 11. Bổ sung một test chuyển vào Studio mới. Chín test giao diện Manual v5.22.1 được thay bởi các test luồng mới; test Auto và test tương thích mô hình cũ vẫn chạy. Tổng số test tăng ròng 53 so với v5.22.1.

Bộ đầy đủ đạt 624 test. Sau lần chỉnh cuối để đợi hết hàng đợi lưu và khóa câu trả lời khi quay lại thư viện, đã chạy lại riêng 8 test runner, typecheck và build web; đều đạt. Không thay đổi logic sau các kiểm tra đó.

## Đã kiểm chứng

- Word theo mẫu chỉ cần file gốc và thuộc tính, không có JSON/OCR/xác nhận cấu trúc trung gian. Prompt yêu cầu hai DOCX thật, giữ bố cục/font/bảng và tách lời giải.
- Prompt không có nội dung source/extract; metadata file/mã/vai trò vẫn được cung cấp. Ba mức độ, giới hạn, dạng bài và thuộc tính được đưa đúng vào prompt.
- Gói chỉ có prompt và originals. Test so sánh nguyên bytes trong ZIP và file khôi phục từ IndexedDB, gồm dữ liệu font/style và file trùng tên; không có source JSON/text/README. File thiếu báo lỗi, không thay bằng bản extract. Văn bản gửi riêng không sinh file source.
- File gốc, prompt/JSON đang dở, thư viện và bài làm tách theo tài khoản; khôi phục sau khi mở lại. Không đọc/xóa dữ liệu tài khoản khác. Bản ghi lỗi không gây hiển thị một kết quả giả.
- Nhập hai file DOCX từ package OOXML tổng hợp, giữ nguyên bytes, mở đề và đáp án riêng qua nút. Kiểm tra các thành phần package bắt buộc và XML Word; từ chối text đổi đuôi DOCX. Viewer trong test Studio được mock, không phải kiểm chứng bố cục Word trực quan.
- JSON hỗ trợ đủ năm dạng bài. Kiểm tra phiên bản schema, số câu, thuộc tính trong prompt, mã/nội dung trùng, lựa chọn, đáp án, ô trống, sai số, đơn vị, rubric và tham chiếu file. Lỗi chỉ rõ câu; giữ JSON và preview cũ.
- API Auto không được gọi trong các test Studio. Hạn mức Manual được mock: dữ liệu sai không tính lượt; thất bại giữ dữ liệu; thử lại cùng mã; nhập lại cùng kết quả giữ mã đề/phiên bản và không tính lặp. Endpoint backend hiện có đã được đối chiếu nhận mã yêu cầu và có reserve/commit/release.
- Bản xem trước và màn hình làm bài không hiện đáp án/lời giải. Vào runner không còn ô JSON của người tạo. Nộp bài xong mới mở lời giải và khóa câu trả lời; chạm nộp nhanh không lưu hai lần cùng trạng thái nộp.
- MCQ chấm đúng/sai; blank nhiều ô và điểm từng ô; short có biến thể được chấp nhận; số thập phân chấm/phẩy, scientific notation, đơn vị có phân biệt chữ hoa/thường, sai số tuyệt đối/tương đối và số rất nhỏ. Từ chối rỗng, Infinity và biểu thức chưa tính.
- Câu mở/tự luận báo cần tự chấm, không tính là đã chấm tự động. Tự ghi điểm hợp lệ, tổng điểm và khôi phục điểm tự chấm; kết quả thể hiện riêng phần tự động/còn chờ.
- Khôi phục bài đang dở không lộ đáp án; khôi phục bài đã nộp có kết quả. Hết giờ sau mở lại hoặc đang làm tự nộp. Lỗi lưu giữ câu trả lời trên màn hình, thử lại được; quay lại đợi lưu và không rời khi lưu thất bại. Lượt mới xóa câu trả lời/lời giải hiện tại.
- Hồi quy Auto, Quiz, flashcard, mục được chia sẻ và DOCX hiện có tiếp tục chạy trong bộ đầy đủ. Các file sửa Safari/flashcard/chia sẻ trước đây và viewer DOCX không được sửa trong bản này.

## Chưa kiểm chứng

Không gọi AI ngoài để sinh Word hoặc JSON thực tế, không gọi Supabase production hoặc deploy production. Tài liệu mẫu người dùng đã được đọc để xác định kế hoạch, nhưng chưa sinh Word từ mẫu PDF 4 trang, mở Word desktop hoặc đối chiếu font/bảng/phân trang với mẫu đó. Bytes được giữ nguyên chỉ chứng minh ứng dụng không chuyển đổi file, không chứng minh AI ngoài tạo Word đúng mẫu hay nội dung đúng chuyên môn.

Test giao diện dùng React/jsdom; lưu trữ dùng fake-indexeddb; DOCX tổng hợp được tạo bằng bộ dựng OOXML hiện có. Chưa kiểm chứng trực quan trên Chrome/Safari thật, iPhone/iPad, clipboard/download thực tế, giới hạn IndexedDB Safari/private mode, hoặc tải file lớn dưới áp lực bộ nhớ. Không có PDF đầu ra vật lý được tạo trong phiên này; luồng Word mới không chuyển kết quả về PDF/JSON.

Chấm điểm là đối chiếu các đáp án/sai số/rubric trong JSON, không chứng minh đáp án AI đúng. Không tự đổi đơn vị hoặc suy luận tương đương biểu thức; điểm tự chấm tự luận do người học ghi. Tham chiếu được kiểm tra mã file và hình dạng số trang, không xác thực trích dẫn/nội dung trang bằng text extract.

Build/test Vite dùng config tạm ngoài nguồn với `preserveSymlinks` do sandbox Windows; không kèm config này, log nội bộ, dữ liệu tài liệu, môi trường, node_modules hoặc dist trong ZIP. Một số test cũ có cảnh báo React act trong log; không có test thất bại.
