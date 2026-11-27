# MindCanvas v6.8.13

- iPhone chừa vùng an toàn quanh mép màn hình, kể cả khi xoay ngang. Chat giữ ô nhập và nút thu nhỏ trong phần màn hình còn nhìn thấy khi bàn phím mở.
- Khi mở tài liệu từ chat rồi quay lại, MindCanvas giữ cuộc hội thoại, vị trí cuộn và đưa tiêu điểm về đúng thẻ tệp.
- PDF có chế độ toàn màn hình trong ứng dụng khi trình duyệt thiếu API toàn màn hình. Có thể dùng Space trên nút chuyển trang đang giữ tiêu điểm. Tệp PDF có ghi chú dùng cùng luồng tải tệp như Thư viện tài liệu.

## Kiểm thử

Chế độ tự động cho ba cấu hình Apple dùng dữ liệu mẫu, gồm bàn phím iPhone, Canvas và bảng Thuộc tính iPad ở 507 px, Quiz, Flashcard, kéo Canvas và Command-Z trên khung Mac, mở và tải tệp chia sẻ.

Muốn chạy cùng bộ kiểm thử bằng WebKit trên máy có thể cài Playwright, chạy ở thư mục gốc MindCanvas.

    npm install --no-save --package-lock=false playwright
    npx playwright install webkit
    npm run test:responsive --workspace apps/web -- --webkit

WebKit của Playwright và Chrome giả lập là hai mức kiểm thử tự động. Trên thiết bị Apple thật, kiểm tra thêm thanh địa chỉ và bàn phím Safari đóng/mở, xoay khi đọc PDF, tải vào Tệp, cử chỉ quay lại trong Safari, Split View trên iPad và bàn phím trên Mac.

## Cập nhật

Dùng từ v6.8.12. Chép các tệp trong thư mục giải nén vào thư mục gốc MindCanvas, nơi có package.json và apps/. Bản này không cần migration.
