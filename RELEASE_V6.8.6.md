# MindCanvas v6.8.6

## Được chia sẻ với tôi

- URL `/?view=shared` dùng chung cho Workspace và Không gian học tập, hỗ trợ đánh dấu trang, tải lại và Back hoặc Forward. Link `?learn=shared` cũ tự chuyển về địa chỉ mới.
- Link chia sẻ cũ vẫn mở đúng nội dung trong Workspace. Các link có token giữ token trong phần sau dấu `#`.
- Mở học liệu từ danh sách hoặc chat ngay trong tab hiện tại. Khi quay lại, bộ lọc và vị trí danh sách được giữ. Với chat, cuộc trò chuyện, bản nháp và vị trí cuộn được giữ trong phiên đang mở.
- Có đường dẫn thư mục và nút quay lại theo ngữ cảnh. Tài liệu PDF, DOCX, PPTX, XLSX, JSON và văn bản có bản xem trước khi định dạng được hỗ trợ. HTML và định dạng còn lại có nút tải xuống. Quiz, Flashcard, Lab và Canvas dùng giao diện MindCanvas hiện có.

## Cập nhật

Chép các tệp trong gói vào thư mục gốc dự án theo đúng đường dẫn. Các tệp phiên bản đặt cạnh `apps/`. Bản này dùng schema chia sẻ hiện có và không yêu cầu migration mới.

```powershell
git add -A
git commit -m "Cập nhật v6.8.6 luồng mở nội dung chia sẻ"
git push origin head:main
```
