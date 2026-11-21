# QA MindCanvas v5.24.0

| Kiểm tra | Kết quả |
| --- | --- |
| Web đầy đủ | 648/648 test đạt, 89 file test |
| Server, cấu hình dịch vụ thật được tách khỏi test | 62/62 đạt, không bỏ qua test |
| Typecheck web/server | Đạt |
| Build web/server | Đạt; cảnh báo chunk lớn hơn 500 kB hiện có |
| Worker build | Cache mindcanvas-shell-v5.24.0 |
| Chromium 153 | Đạt tại 1440×1000, 768×1024 và 390×844 |
| Dependency/SQL mới | Không có |

## Kiểm thử tự động

Bổ sung 14 test: 11 test điều hướng, 2 test tích hợp App và 1 test hồi quy quay lại thiết lập từ đề đã khôi phục. Cập nhật test App và hướng dẫn theo giao diện mới.

Đã kiểm tra URL hợp lệ/không hợp lệ, giữ query/hash, ưu tiên đích thông báo, Back/Forward qua phiên/danh sách/trang chủ, chuyển qua lại giữ input và phiên đang làm, mở phiên lặp không tạo lịch sử trùng, đổi tài khoản xóa trạng thái trong bộ nhớ, lịch sử chi tiết cũ không làm trang trắng, và tác vụ nền không chiếm lại màn hình.

Kiểm tra hidden/inert cho công cụ không hoạt động, hộp thoại đóng/mở đúng khi chuyển mục, phím tắt Flashcard không chấm thẻ ở trang bị ẩn. Test tích hợp App bao gồm mở trực tiếp URL công cụ và Back/Forward giữa workspace với Không gian học tập. Test hồi quy Auto, Manual, DOCX, JSON, flashcard, chia sẻ và Lab tiếp tục đạt.

Bộ web đầy đủ, typecheck và build đã chạy trên mã cuối. Server không thay logic; 62 test vẫn được chạy với cấu hình dịch vụ thật được tách tạm và khôi phục sau test.

## Kiểm tra trên trình duyệt

Dùng React component LearningHubPage, các công cụ và CSS thật trong harness cục bộ với LanguageProvider/MusicProvider. Seed bộ thẻ, Quiz và Lab thử nghiệm qua repository trên thiết bị; dùng IndexedDB, history, iframe và tương tác DOM thật của Chromium. Không gọi AI hoặc dịch vụ production, chặn tài nguyên HTTPS ngoài để bài thử không phụ thuộc mạng.

Ở cả ba kích thước đã kiểm tra:

- Trang chủ có các nhóm công cụ; khi mở công cụ không còn tiêu đề Learning Hub và thanh tab cũ.
- Mở Flashcard, vào phiên ôn và lật thẻ; chuyển Quiz rồi quay lại vẫn giữ mặt thẻ.
- Trả lời Quiz chế độ luyện tập; Back về danh sách rồi Forward vào lại vẫn giữ đáp án đã chọn.
- Mở Lab có bộ đếm, tăng giá trị trong iframe; chuyển về trang chủ rồi mở lại Lab vẫn giữ giá trị.
- Chuyển Manual trong Exam Studio, đổi độ khó; về trang chủ và quay lại vẫn giữ lựa chọn.
- Mở Tiến độ, nhập bản nháp Kế hoạch, chuyển mục rồi quay lại; dữ liệu nhập vẫn còn.
- Menu Công cụ đóng bằng Escape; không tràn ngang và không có pageerror.

Đã xem ảnh nội bộ của trang chủ desktop và Lab trên điện thoại. Harness, dữ liệu seed, ảnh nội bộ, node_modules, dist và môi trường không nằm trong ZIP. Sau lần thử trình duyệt, bổ sung sửa nút quay lại từ đề khôi phục chưa có entry lịch sử con; ca này được kiểm tra bằng test mới và bộ web đầy đủ.

## Giới hạn kiểm chứng

Chưa thử Safari/iPad/iPhone thật; viewport tablet trong báo cáo là Chromium. Chưa đối chiếu trực quan từng theme hoặc thử áp lực bộ nhớ sau khi mở đồng thời nhiều Lab nặng. Các trang đã ghé giữ trạng thái trong bộ nhớ của phiên hiện tại; báo cáo này không khẳng định phiên Quiz/Flashcard được khôi phục sau reload.

Trình duyệt kiểm tra trực tiếp vùng học tập trong harness, không mô phỏng đầy đủ đăng nhập và toàn bộ thanh ứng dụng; phần ghép với App được kiểm tra bằng React/jsdom. Chưa gọi AI thật, Supabase production hoặc deploy production. Nội dung Word/PDF do AI ngoài tạo và độ đúng kiến thức không thuộc phạm vi thay đổi giao diện này.
