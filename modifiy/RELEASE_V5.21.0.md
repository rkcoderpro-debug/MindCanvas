# MindCanvas v5.21.0

Bản sửa flashcard và mục **Được chia sẻ với tôi** trong Learning Hub. Ngày bàn giao: 14/10/2026 (Việt Nam).

## Thay đổi

- Flashcard ôn tập chỉ dựng nội dung của mặt đang xem. Bỏ cơ chế hai mặt chồng nhau/xoay 3D; giữ chuyển động kéo 2D khi vuốt. Chạm, Enter/Space để lật và vuốt trái/phải để chấm chưa nhớ/đã nhớ vẫn hoạt động.
- Trong lúc lưu đánh giá, chặn lật/chấm tiếp; phím tắt không can thiệp vào Enter/Space của nút đang được chọn. Đổi thẻ xóa trạng thái kéo cũ. Kiểm tra được việc ghi đúng một sự kiện học khi chạm chấm liên tục, chuyển thẻ mới về mặt trước.
- Sửa lỗi render danh sách chia sẻ: RPC có thể trả về `title`/`updated_at` NULL khi học liệu gốc đã xóa, trong khi mã cũ gọi `localeCompare` trực tiếp. Chuẩn hóa các danh sách, nhãn thay thế và ngày thiếu trước khi lọc/sắp xếp; dữ liệu hỏng được báo lỗi có nút thử lại.
- Ba request danh sách học liệu/lời mời/bản sao được xử lý kết quả độc lập. Một request lỗi không loại bỏ danh sách đã tải thành công. Khi tải lại thất bại, giữ dữ liệu đang xem và thông báo lỗi; chỉ hiển thị trạng thái chưa có học liệu sau lần tải danh sách thành công.
- Có trạng thái đang tải/đang mở và deadline 15 giây cho request danh sách hoặc mở học liệu. Kết quả trả muộn từ lần tải/tài khoản trước bị bỏ qua. Deadline này không hủy request đã gửi lên server.
- Tách tab chia sẻ thành module tải khi mở tab, với vùng bắt lỗi cho lỗi module/render, nút thử lại và tải lại trang. Nếu một lượt thử vẫn gặp lỗi import được trình duyệt lưu lại, dùng nút tải lại trang. Kiểm tra dữ liệu Quiz trước khi đặt vào state; chặn chấm lặp cho flashcard chia sẻ khi chạm nhanh.
- Root/web/server/lockfile dùng phiên bản 5.21.0; shell PWA lấy version từ build hiện có.
- Giữ phần trình xem DOCX của v5.20.2: trang giấy có định dạng, iframe tách CSS, chuyển trang, zoom và vừa chiều rộng; dependency `docx-preview` khóa ở 0.4.1. Không thay DOCX gốc.

## Cài bản vá

ZIP là phần chênh lệch so với **v5.20.1**, dùng được cho project v5.20.1 hoặc v5.20.2. Các file DOCX cần thiết của v5.20.2 đã nằm trong ZIP, không cần ghép thêm ZIP cũ.

1. Giải nén ghi đè vào thư mục gốc có `package.json` và `apps`. ZIP giữ đường dẫn tương đối, không có thư mục bọc ngoài.
2. Chạy `npm ci` ở gốc project. Cần truy cập npm registry để cài dependency DOCX nếu project chưa có.
3. Chạy `npm run typecheck`, `npm run test`, `npm run build`; triển khai theo quy trình hiện có.
4. Mở lại ứng dụng sau cập nhật PWA. Đối chiếu phiên bản giao diện và API health là 5.21.0. Nếu tab chia sẻ báo lỗi tải module sau deploy, thử lại hoặc tải lại trang bằng nút hiển thị.

Không có SQL mới hoặc file cần xóa trong bản này. Không kèm `.env`, dependencies, build output, dữ liệu người dùng hay cấu hình kiểm thử tạm. Chưa deploy hoặc chạy SQL trên hệ thống thật.

## Giới hạn kiểm chứng

Người dùng xác nhận mở bằng Safari; chưa có phiên bản iOS/iPadOS. Đã tái hiện lỗi NULL bằng test và sửa nguyên nhân đó; chưa xác định đây là lỗi đầu tiên trên iPad của người dùng, chưa thu request/console từ thiết bị thật và chưa kiểm thử Safari thật.

DOCX dùng bộ render web nên font, ngắt trang, văn bản nhiều cột, hình nổi, bảng gộp, đoạn quá dài và field code phức tạp có thể khác Word. Chưa xác nhận bố cục từng trang hoặc số trang vật lý giống Word. Xem `QA_V5.21.0.md` để biết kiểm tra đã chạy và các bước đối chiếu còn lại.
