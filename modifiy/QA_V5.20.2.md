# Kiểm thử MindCanvas v5.20.2

## Kết quả đã chạy

| Hạng mục | Kết quả |
| --- | --- |
| Toàn bộ test web | 74 file, 485 test đạt, 0 lỗi |
| Test server | 54 test đạt, 0 lỗi |
| Typecheck web/server | Đạt |
| Build web/server | Đạt |
| Test DOCX sau chỉnh vị trí footer của trang quá cao | 11 test đạt |
| DOCX mẫu Hóa học song ngữ | Kiểm tra render OOXML đạt |

Test DOCX kiểm tra ngắt đoạn, chia bảng theo hàng mà không mất/lặp nội dung, giữ độ rộng cột và màu ô, giữ nguyên bảng có rowspan, hiển thị vật thể quá cao và đặt footer sau nội dung, endnotes không lặp, trang/lề/font/ngắt trang thực từ gói OOXML, số PAGE/NUMPAGES, loại nội dung chủ động, lỗi file hỏng. Test component kiểm tra nút zoom, cách ly iframe, thử lại và bỏ kết quả tải cũ.

Toàn bộ 485 test web đã đạt trước chỉnh nhỏ cuối cùng về thứ tự DOM của footer khi trang quá cao. Sau chỉnh này, 11 test DOCX được chạy lại và đạt; typecheck web và build web cũng chạy lại.

## DOCX mẫu

File tham chiếu đã kiểm tra có SHA-256 `4f8f830141fe25d07a079e4443fe80d543ec3c79fcbf33154acf8d21c79b38e6`.

- Giữ 11 bảng, nội dung tiếng Anh/Việt, style Arial, nền ô và footer; số trang trong footer được thay theo trang hiển thị.
- Kiểm tra dùng jsdom nên chỉ xác nhận 11 trang logic theo 10 ngắt trang tường minh. jsdom không có bộ đo dàn trang thật.
- Bản tham chiếu có 16 trang khi được dàn trang bằng bộ render tài liệu. Chưa xác nhận viewer tạo ra 16 trang vật lý hoặc khớp vị trí từng dòng với Word. Không dùng kết quả 11 trang logic để kết luận tương đương Word.
- File mẫu và bài kiểm tra tạm phụ thuộc file này không nằm trong ZIP.

## Điều kiện môi trường

Vite/Vitest cần cấu hình kiểm thử tạm `resolve.preserveSymlinks: true` do môi trường này chặn native realpath. Cấu hình nằm ngoài project và không nằm trong ZIP. Dependency `docx-preview` 0.4.1 được lấy từ tarball npm bạn gửi; lockfile dùng URL registry chuẩn và integrity SHA-512 của tarball, không chứa đường dẫn máy cá nhân. Chưa chạy `npm ci` sạch qua mạng trong môi trường này.

Build web có cảnh báo chunk lớn hơn 500 kB; build vẫn hoàn thành. Các bài test không kết nối tài khoản Supabase thật. Chưa deploy production. Trình duyệt kiểm thử không khởi động được nên chưa có kiểm tra tương tác/bố cục bằng trình duyệt, Safari/iOS hay iPad thật.

## Đối chiếu sau cài đặt

1. Mở DOCX gốc bằng Word và cùng file trong ứng dụng: đối chiếu đầu/cuối tài liệu, tiếng Việt, font, màu, lề, độ rộng cột, bảng, hình, footer, số trang và các điểm ngắt trang.
2. Kiểm tra vừa chiều rộng, 100%, thu/phóng, chuyển trang, cuộn và toàn màn hình ở desktop rồi Safari iPad (dọc/ngang). Kiểm tra có thể cuộn hết trang cuối.
3. Mở file có đoạn/bảng dài và ô gộp: xác nhận nội dung đủ, footer không đè lên nội dung; thông báo xuất hiện khi vật thể cần trang cao hơn.
4. Thử đổi tài liệu liên tiếp, file hỏng, nút thử lại và mở lại tài liệu cũ đã lưu. Nếu số trang hoặc vị trí dòng lệch Word, ghi rõ trang và đoạn/bảng liên quan để xử lý tiếp.

Không kết luận bản này đã đạt độ giống Word từng trang hoặc đã qua kiểm thử iPad thật.
