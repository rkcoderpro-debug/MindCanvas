# Kiểm thử v5.20.0

## Kết quả tự động

Nguồn đã kiểm tra: bản v5.19.0 trong workspace, cập nhật thành v5.20.0.

- Web: 69 file test, **440 test đạt** sau khi sửa số migration Lab thành 0032.
- Server: 41 test đạt, 1 test sẵn có bị bỏ qua.
- Build: TypeScript + Vite web đạt; TypeScript server đạt.
- Phiên bản package root/web/server/lockfile khớp 5.20.0; badge lấy phiên bản trực tiếp từ web package.
- Vite vẫn cảnh báo bundle lớn hơn 500 kB; không phải lỗi build.

Các tình huống có test trực tiếp:

- Thư viện hiển thị thẻ tĩnh, không mở iframe/biểu mẫu khi vào trang.
- Chỉ hiện textarea HTML khi chọn dán/sửa; lưu HTML-only, mở lại sau khi remount/F5 tương đương vòng đời ứng dụng.
- Hủy chỉnh sửa giữ Lab đã lưu; HTML lỗi bị chặn và nội dung được giữ.
- QuotaExceededError không đóng hộp thoại, có thông báo lưu trữ đầy.
- Khôi phục bản nháp theo tài khoản; giữ yêu cầu khi đổi chế độ.
- CDN cần người xem đồng ý; cùng iframe được giữ qua fullscreen; trở về thư viện dừng iframe.
- 50 Lab là thẻ tĩnh, lọc đúng chế độ.
- Tám chế độ có prompt riêng; hoạt họa phân biệt tốc độ hiển thị/tốc độ thực, tình huống không bịa xác suất tâm lý.
- Thumbnail sai định dạng/qua lớn bị loại; bridge chỉ nhận đúng iframe + token, giới hạn chiều cao.
- Script bridge được thực thi trong test DOM; đo chiều cao nội dung thay vì dùng chiều cao viewport.
- Lưu thumbnail là transaction, giữ timestamp, không thay HTML mới bằng kết quả preview cũ.
- Payload và khôi phục cloud giữ mode/thumbnail/viewer/ghi chú riêng, tương thích metadata cũ.
- Hàng đợi lưu/xóa đúng thứ tự; lỗi migration báo tên file 0032 và hàng đợi tiếp tục dùng được.
- Mỗi migration SQL có số riêng; thông báo v5.19 giữ 0031 và Lab v5.20 dùng 0032. Đối chiếu SHA-256 xác nhận SQL 0031 cũ không đổi; SQL Lab chỉ đổi chú thích thứ tự so với gói trước.
- Hồi quy Workspace/Canvas/Quiz/Flashcard/lớp học/tin nhắn/notification và các module hiện có.

## Giới hạn kiểm thử

Các test cloud dùng mock, chưa chạy migration hay RLS trên Supabase thật. Không có Chromium cài sẵn trong môi trường; tải bộ cài không nhận được zip hợp lệ. Cloud Browser không kết nối được localhost của workspace (ERR_CONNECTION_REFUSED). Vì vậy chưa có bằng chứng ảnh chụp/DevTools cho responsive thực tế, CSP trong trình duyệt, thumbnail Canvas/SVG/3D hoặc chất lượng HTML từ AI ngoài.

Không đánh dấu các mục dưới đây là đạt trước khi thực hiện. Mỗi lỗi: ghi bước tái hiện → sửa → kiểm tra lại tình huống lỗi và hồi quy liên quan → mới chuyển bước.

## Checklist Chrome sau cài đặt

| Mục | Cách kiểm tra | Kết quả cần đạt | Trạng thái |
|---|---|---|---|
| Responsive | DevTools 320, 390, 768, 1366, 1920 px | Không cuộn ngang/tràn chữ; menu và nút vẫn dùng được | Chưa chạy |
| Tên dài | Tên 200 ký tự, có chuỗi không khoảng trắng | Thẻ giới hạn hai dòng; tiêu đề chi tiết xuống dòng | Chưa chạy |
| Hộp thoại | Thêm tệp, dán HTML, bàn phím điện thoại | Nút lưu tiếp cận được; focus không chạy ra nền | Chưa chạy |
| Tạo và lưu | HTML-only → lưu → F5 → mở Lab | HTML và tên giữ đúng; trang đầu là thư viện | Chưa chạy |
| Chỉnh sửa | Đổi tên/HTML → hủy; sau đó sửa → lưu | Hủy giữ bản cũ; lưu cập nhật đúng thẻ | Chưa chạy |
| Thumbnail | Lab Canvas/SVG và HTML không có cảnh | Cảnh hỗ trợ có ảnh; HTML khác dùng ảnh tải lên/dự phòng | Chưa chạy |
| Fullscreen | Chạy vài bước → vào/thoát → Escape | Phiên không khởi động lại; nút thoát tiếp cận được | Chưa chạy |
| CDN | Mở Lab CDN, từ chối rồi đồng ý | Chỉ tải sau đồng ý; API và dữ liệu MindCanvas bị cách ly | Chưa chạy |
| Cloud thật | Chạy 0032 sau 0031 của v5.19, lưu bằng Pro/Max, mở profile khác | Tên, HTML, mode, viewer, ảnh bìa giữ đúng | Chưa chạy |
| Chia sẻ thật | Mời tài khoản thử → xem → lưu về | Metadata đúng; nguồn riêng không xuất hiện ở người nhận | Chưa chạy |
| Xóa thật | Lưu → xóa ngay → F5/profile khác | Lab không xuất hiện trở lại | Chưa chạy |
| Mất mạng | Tắt mạng → lưu → bật lại → đồng bộ | Bản trên thiết bị còn; trạng thái cloud đúng | Chưa chạy |
| Dung lượng | Dùng profile test gần đầy, lưu HTML lớn | Lỗi rõ, nội dung giữ được, xuất sao lưu được | Chưa chạy |
| 50 Lab | Mở thư viện 50 Lab; kiểm tra Performance | Không có 50 iframe chạy nền | Chưa chạy |
| Theme/bàn phím | Sáng/tối, Tab, Enter, Escape, reduced motion | Chữ/nút nhìn rõ; thứ tự focus hợp lý | Chưa chạy |

## Kiểm tra nội dung từng chế độ bằng AI ngoài

Tạo ít nhất một HTML từ prompt của từng chế độ. Các chế độ là mẫu yêu cầu cho AI, không phải bộ máy mô phỏng dựng sẵn.

1. Hoạt họa: điện phân có chất điện phân/điện cực xác định, chuyển động và phản ứng đồng nhất; play/pause/step/reset; phân biệt tốc độ hoạt họa và quá trình thật.
2. Mô phỏng: ném xiên, đối chiếu giá trị biên và đơn vị với mô hình.
3. Trực quan: liên kết ion, chọn thành phần và đọc từng bước giải thích.
4. Thí nghiệm: thay đúng một biến, giữ biến kiểm soát, ghi bảng, nhãn dữ liệu mô phỏng rõ.
5. Thuật toán: HeapSort, mảng trùng phần tử, rỗng, một phần tử, đã sắp xếp, đảo ngược; trace và kết quả khớp.
6. Dữ liệu: bảng/biểu đồ cùng dữ liệu; giá trị thiếu/sai không làm Lab hỏng.
7. Tình huống: quyết định người tiêu dùng, nhánh và phản hồi có căn cứ, không số liệu tâm lý tự bịa.
8. Tự do: HTML học tập đã có chạy được; các tính năng không phù hợp không bị ép thêm.

Các kiểm tra nội dung trên chưa thực hiện với AI ngoài; cần đối chiếu tài liệu nguồn trước khi dùng để dạy học.
