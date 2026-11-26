# MindCanvas v5.27.4 — Bút và lưu canvas nhiều ảnh

Cập nhật trực tiếp từ **v5.27.3**. Giải nén vào thư mục repository chứa `package.json` và `apps/`, đồng bộ mã với repository nối Render rồi build/deploy lại frontend. Không cần migration, chạy lại SQL hoặc thay đổi các biến `VITE_CANVAS_MEDIA_*`.

- Nét bút/tẩy xem trước theo khung hình và vẫn thu các điểm từ chuột/bút. Nét ngắn chỉ ghi bản nháp hoàn chỉnh một lần khi nhấc bút. Nét đang vẽ lâu được lưu phục hồi định kỳ ngoài xử lý sự kiện pointer. Hoàn tác vẫn tính mỗi nét là một thao tác.
- Bản nháp nhiều ảnh không còn bị chuyển thành JSON và ghi đồng bộ vào localStorage mỗi lần vẽ. IndexedDB tiếp tục giữ bản đầy đủ, bao gồm ảnh. Trình duyệt được yêu cầu cảnh báo nếu rời đi khi bản nháp thiết bị chưa ghi xong.
- Nếu thiết bị đã có ảnh của canvas v2, lần lưu đầu sau khi tải lại trang chỉ đọc danh sách tham chiếu từ cloud để dùng lại ảnh cũ. Ảnh mới vẫn tải lên và revision vẫn được kiểm tra. Thiết bị chưa có ảnh vẫn tải ảnh để hiển thị; các lượt tải ban đầu có giới hạn song song và gộp tham chiếu trùng.
- Link `/?canvas=<id>`, quyền chia sẻ, định dạng v2 và xuất canvas vẫn hoạt động.

## Kiểm tra trên máy đang bị lag

1. Nếu còn nét chưa lưu, xuất **Tải file về máy** hoặc đợi **Đã lưu đám mây** trước khi tải lại.
2. Deploy v5.27.4. Tải lại trang rồi mở `tổng hợp tài liệu ôn`, đợi ảnh hiện. Xóa **danh sách request** trong Network để tách riêng phép thử; không xóa dữ liệu trình duyệt.
3. Vẽ một nét ngắn, rồi một nét dài: kiểm tra độ bám bút, điểm cuối, Undo và trạng thái lưu. Với ảnh cũ đã có trên thiết bị, sửa nét không nên tạo một loạt request tải ảnh cũ. Bản v2 có thể phát sinh một GET nhỏ đọc danh sách tham chiếu ở lần lưu đầu, sau đó PATCH nội dung.

Đã kiểm thử luồng phục hồi, thao tác nét ngắn, và canvas mô phỏng gần 12 MB; chưa đo tốc độ trên máy người dùng hoặc trên Render production.
