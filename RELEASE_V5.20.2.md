# MindCanvas v5.20.2 — trình xem DOCX

Bản vá áp dụng trên v5.20.1. Ngày kiểm thử: 13/10/2026 (UTC).

## Thay đổi

- DOCX dùng `docx-preview` 0.4.1 thay cho chuyển đổi Mammoth sang HTML đơn giản trong trình xem tài liệu. Trang giấy giữ kích thước, lề, font, màu chữ, bảng, nền ô, hình ảnh, header/footer và ngắt trang được bộ render hỗ trợ.
- Nội dung nằm trong iframe riêng, không bị CSS bảng hoặc giao diện sáng/tối của ứng dụng thay đổi. Iframe không cho chạy script; tài nguyên hiển thị được giới hạn vào dữ liệu nhúng.
- Có chuyển trang, thu/phóng, vừa chiều rộng và mức 100%. Khi thu/phóng, trang giấy được phóng theo tỷ lệ thay vì ép bảng vào chiều rộng màn hình. Trình xem tiếp tục dùng nút toàn màn hình hiện có.
- Sau khi font/hình ảnh tải xong, nội dung dài được chia ở ranh giới đoạn hoặc hàng bảng. Bảng có ô gộp theo hàng và vật thể quá cao được giữ nguyên, tăng chiều cao trang và có thông báo để tránh cắt mất nội dung. Footer nằm sau nội dung của trang tăng chiều cao.
- Cập nhật các trường PAGE/NUMPAGES đơn giản trong header/footer của bản sao dùng để hiển thị. DOCX gốc không bị sửa hoặc ghi đè.
- Có trạng thái tải, lỗi và thử lại; kết quả tải cũ không ghi đè tài liệu mới. Bổ sung nhãn tiếng Việt/Anh và đồng bộ phiên bản root/web/server/lockfile lên 5.20.2.

## Áp dụng ZIP

1. Dùng project đã áp dụng đầy đủ v5.20.1. ZIP này là phần chênh lệch từ v5.20.1, không chứa toàn bộ project.
2. Giải nén ghi đè vào thư mục gốc có `package.json` và `apps`. ZIP giữ đường dẫn tương đối với gốc, không có thư mục bọc ngoài.
3. Chạy `npm ci` ở gốc project để cài dependency mới đã khóa phiên bản. Cần truy cập npm registry; chỉ ghi đè mã nguồn mà chưa cài dependency sẽ không đủ.
4. Chạy `npm run typecheck`, `npm run test`, `npm run build`, rồi dùng quy trình triển khai hiện có của bạn. Sau cập nhật PWA, mở lại ứng dụng để dùng shell 5.20.2.

Không có SQL mới và không có file cần xóa trong bản vá này. ZIP không chứa `.env`, dependencies, build output, tài liệu mẫu của bạn hoặc cấu hình kiểm thử tạm.

## Mức độ tương thích Word

Đây là trình render DOCX trên web, không phải bộ dàn trang Microsoft Word. Font có sẵn trên thiết bị, đoạn văn quá dài, bảng gộp, văn bản nhiều cột, hình nổi, quy tắc giữ đoạn cùng nhau, header/footer trang đầu/trang chẵn và field code phức tạp có thể khác Word. Thuật toán bổ sung không chia một đoạn văn đơn lẻ hoặc ô bảng ở giữa dòng. Trường PAGE/NUMPAGES phức tạp và đánh số bắt đầu lại theo section chưa được xử lý đầy đủ.

Đã kiểm tra dữ liệu/định dạng bằng DOCX mẫu và test tự động; chưa xác nhận số trang vật lý hoặc độ giống từng trang bằng ảnh Word/trình duyệt, và chưa kiểm thử trên iPad thật. Chi tiết và danh sách đối chiếu sau cài đặt nằm trong `QA_V5.20.2.md`.
