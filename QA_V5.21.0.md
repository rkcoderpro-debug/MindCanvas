# QA MindCanvas v5.21.0

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Test web toàn bộ | 77 file, 504 test đạt, 0 lỗi |
| Test server | 54 test đạt, 0 lỗi |
| Typecheck web/server | Đạt |
| Build web/server | Đạt |
| Test mới cho bản 5.21 | 19 test đạt |
| Safari/iPhone/iPad thật | Chưa kiểm thử |
| Supabase thật, deploy thật | Chưa kiểm thử/chưa triển khai |

## Lỗi đã tái hiện trước sửa

Ba test hồi quy ban đầu thất bại trên mã cũ:

1. Trình ôn flashcard có cả hai mặt trong DOM; test yêu cầu chỉ mặt đang xem thất bại. Đây là kiểm tra cấu trúc gây phụ thuộc vào CSS 3D, không phải tái hiện lỗi dựng hình trên Safari thật.
2. Danh sách gồm học liệu đã xóa với `title`/`updated_at` NULL làm render ném lỗi `localeCompare`. SQL `list_learning_shares` trong migration 0018/0023 cho phép trường nguồn đã xóa trả về NULL.
3. Danh sách NULL làm render ném lỗi khi gọi `.filter`.

Cả ba test đã qua sau sửa. Chưa có console/request từ iPad để kết luận lỗi NULL là nguyên nhân duy nhất của màn hình trắng trên thiết bị đó.

## Phạm vi 19 test mới

- 6 test flashcard: chỉ một mặt qua 20 lần lật và sự kiện đổi hướng mô phỏng; vuốt ngang chấm một lần; cuộn dọc không chấm; không lật/chấm khi đang lưu; bàn phím trên nút vẫn dùng hành vi mặc định; chạm nhanh chấm chưa nhớ/đã nhớ chỉ gọi review và recordStudy một lần rồi chuyển sang mặt trước thẻ tiếp theo.
- 11 test trang chia sẻ: học liệu xóa có NULL vẫn lọc/sắp xếp được, danh sách NULL, request bản sao lỗi trong khi danh sách học liệu thành công, giữ danh sách cũ khi refresh lỗi và phục hồi khi thử lại, dữ liệu sai cấu trúc, response muộn của tài khoản cũ, deadline request treo, thông báo hết phiên, quyền bị thu hồi lúc mở, Quiz hỏng trước khi render, chấm thẻ chia sẻ một lần khi chạm nhanh.
- 2 test vùng bắt lỗi: lỗi render không làm mất vùng điều hướng và thử lại khôi phục được; lỗi lazy module bị bắt và một loader mới có thể phục hồi.

Các thao tác được mô phỏng trong React/jsdom. Sự kiện `orientationchange` không thay cho kiểm thử xoay màn hình và dàn trang trên iPad thật. Test lazy module dùng Promise lỗi, không giả lập đầy đủ cache module của Safari hoặc PWA production.

## Kiểm tra phần DOCX được giữ lại

11 test renderer/component DOCX hiện có nằm trong 504 test web và đều đạt. File mã DOCX chuyên biệt được đối chiếu hash với nền v5.20.2 để bảo đảm không mất phần đã bàn giao. Test mẫu Hóa học trước đó xác nhận 11 bảng, nội dung song ngữ, Arial, nền ô và footer; jsdom chỉ đo được 11 trang logic theo ngắt trang tường minh. Bản tham chiếu được dàn trang thành 16 trang, nhưng chưa so sánh số trang vật lý của viewer hoặc ảnh từng trang với Word. Không kèm tài liệu mẫu của người dùng.

## Điều kiện kiểm thử

Vite/Vitest sử dụng cấu hình tạm `resolve.preserveSymlinks: true` do môi trường chặn native realpath. Cấu hình này ở ngoài project, không nằm trong ZIP. Build có cảnh báo chunk lớn; build hoàn thành. Dependency DOCX đã kiểm tra integrity từ tarball npm người dùng cung cấp; chưa kiểm tra `npm ci` sạch qua mạng ở môi trường này.

Luồng khôi phục phiên đăng nhập và cache PWA được rà soát; không thay cơ chế tự động khôi phục phiên hoặc ép cập nhật shell. Test hồi quy của các phần này đều đạt. Chưa kiểm chứng request HTTP thực, lỗi auth/token thật hoặc nâng cấp PWA trên Safari.

## Checklist trên Safari sau cài đặt

1. Ghi phiên bản iOS/iPadOS, phiên bản MindCanvas và chế độ Safari thường/PWA. Mở cả màn hình dọc/ngang.
2. Ôn một bộ thẻ: lật liên tục, cuộn nội dung dài, vuốt trái/phải, chạm chấm nhanh, đổi thẻ, xoay màn hình. Xác nhận chỉ thấy một mặt và tiến độ tăng đúng một lần cho mỗi lần chấm hoàn tất.
3. Mở tab Được chia sẻ với tôi khi có học liệu active/paused/removed; tìm kiếm và sắp xếp theo tên/ngày. Mở Quiz, Flashcard, Lab và Tài liệu, kiểm tra lưu bản sao/tải tài liệu.
4. Mất mạng, request lỗi, hết phiên và quyền bị thu hồi phải có thông báo. Thử lại sau khi có mạng; danh sách cũ vẫn hiển thị khi refresh lỗi. Đăng xuất/đăng nhập tài khoản khác trong lúc tải để kiểm tra dữ liệu không lẫn.
5. Thử từ PWA cũ sang 5.21.0. Nếu còn trắng hoặc không mở được, ghi lỗi JavaScript đầu tiên, request thất bại và response để xác định phần còn lại; không chỉ kiểm tra ảnh màn hình cuối.

Các bước Safari/production ở trên chưa được thực hiện trong phiên này.
