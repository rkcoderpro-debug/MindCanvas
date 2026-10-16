# MindCanvas v5.24.0 — Không gian học tập

Áp dụng trên nguồn v5.23.1. Giải nén ZIP vào thư mục gốc có package.json, apps/ và packages/, ghi đè đúng đường dẫn. Chạy quy trình build/deploy hiện có. Không có dependency npm, biến môi trường hoặc migration SQL mới. Phiên bản root/web/server/lock và cache PWA chuyển sang 5.24.0.

## Trang chủ mới

Tên Trung tâm học tập / Learning Hub chuyển thành Không gian học tập / Learning Space. Trang chủ có bốn công cụ chính: Flashcard, Quiz, Tạo đề thi và Lab. Các mục Tài liệu, Được chia sẻ với tôi, Kế hoạch, Tiến độ, Nhạc, Lớp học và Bạn bè nằm trong những nhóm nhỏ bên dưới.

Chỉ trang chủ hiển thị tiêu đề Không gian học tập và chuỗi ngày học. Mục vừa mở xuất hiện ở phần Tiếp tục trong phiên hiện tại. Nhiệm vụ hôm nay chỉ xuất hiện khi có kế hoạch và nhiệm vụ thật; không thêm bộ thẻ hoặc dữ liệu học giả để lấp giao diện.

## Trang công cụ

Bỏ banner Learning Hub, mô tả tổng quan, thanh tab ngang, nút cuộn tab và hướng dẫn vuốt khỏi trang công cụ. Mỗi công cụ giữ nội dung, tiêu đề và thao tác riêng. Chỉ thêm thanh điều hướng nhỏ với nút Về không gian học tập và menu Công cụ. Lab đang mở cũng ẩn phần tiêu đề/thao tác của thư viện Lab; trình mô phỏng và nút quay lại thư viện là vùng chính.

Menu hỗ trợ đóng bằng Escape và bấm ngoài; nút đang chọn có aria-current. Điều hướng đặt focus vào tiêu đề nội dung và đưa vùng công cụ về đầu trang. Giao diện sử dụng các biến theme hiện có; trên điện thoại các công cụ xếp một cột.

## Điều hướng và giữ trạng thái

URL dùng tham số learn với các mục được cho phép, ví dụ ?learn=quiz hoặc ?learn=lab. Liên kết hợp lệ mở thẳng công cụ; các tham số khác và hash được giữ lại. Chuyển công cụ và mở màn hình con cập nhật browser history. Nút Back/Forward hỗ trợ trở về danh sách, trang chủ và màn hình con đã mở trong phiên. Các đích từ thông báo/lời mời vẫn được ưu tiên.

Những công cụ đã ghé được giữ trong bộ nhớ khi chuyển sang công cụ khác hoặc trang chủ trong cùng Không gian học tập. Bản nháp, lựa chọn, câu trả lời Quiz và phiên Flashcard không bị xóa do chuyển mục. Lab đang mở giữ nguyên iframe khi chuyển công cụ rồi quay lại. Công cụ bị ẩn có hidden/inert; hộp thoại được đóng khỏi top layer và phím tắt ôn thẻ được ngắt, rồi khôi phục khi quay lại.

Quiz tính giờ vẫn chạy theo hạn chót khi người dùng chuyển công cụ; chuyển mục không kéo dài thời gian thi. Tác vụ AI hoàn tất ở công cụ đang ẩn không tự kéo người dùng khỏi màn hình đang xem. Quay lại từ bài thi tương tác tiếp tục dùng bước lưu bài làm hiện có.

Trạng thái giữ trong bộ nhớ được giải phóng khi rời Không gian học tập, tải lại trang hoặc đổi tài khoản. Bản này không bổ sung đồng bộ hay lưu bền vững phiên Quiz/Flashcard vào cloud. Những bản nháp, file gốc và bài làm đã có cơ chế lưu của Exam Studio/Lab tiếp tục dùng cơ chế đó. Tải lại URL mở công cụ và dữ liệu đã lưu được hỗ trợ, không tái dựng toàn bộ lịch sử phiên cũ.

Hướng dẫn tính năng được cập nhật tên và đích điều hướng mới; vẫn giữ mã hướng dẫn và dữ liệu hoàn thành hiện có. AI Auto/Manual, tạo đề Word/JSON, chấm bài, chia sẻ và quản lý dữ liệu tiếp tục dùng luồng hiện có.

Đọc QA_V5.24.0.md để biết phạm vi kiểm chứng.
