# MindCanvas v5.29.0 — Canvas A4 và sửa nhấp đúp node

Cập nhật từ **v5.28.0**. Giải nén vào thư mục gốc repo, rồi build/deploy lại **Static Site / frontend** trên Render. Bản này không thêm migration SQL, dịch vụ API hoặc biến môi trường. Nếu đang cập nhật thẳng từ bản trước v5.28.0, áp dụng các thay đổi và SQL của v5.28.0 trước theo hướng dẫn bản đó.

- **Project mới** cho chọn Canvas vô hạn hoặc Canvas A4. Project cũ tiếp tục hiển thị như trước. Workspace đánh dấu project A4.
- A4 có **Trang tách rời** (thêm, xóa, đổi thứ tự) và **Trang nối liền** (tự hiện một trang trống kế tiếp; chỉ lưu khi có nội dung). Đổi chế độ không chuyển vị trí nội dung. Khi sắp xếp lại, nét bút đi qua nhiều trang được giữ theo từng phần trên các trang tương ứng.
- **Gõ theo dòng** tự xuống dòng, tràn trang, và lưu cùng project. Công cụ chữ tự do, vẽ, hình, ảnh, đính kèm, chọn và hoàn tác dùng chung với canvas. Không có công cụ node hoặc AI tạo sơ đồ trong A4.
- **Tải PDF** có xem trước và chọn khoảng trang. File dùng đúng khổ 210 × 297 mm; mỗi trang được render thành ảnh 150 dpi để giữ nguyên chữ, ảnh và nét vẽ. Nội dung PDF không phải lớp văn bản để tìm kiếm/sao chép. Có thể tải SVG/PNG trang đang xem từ hộp xem trước.
- **Nhấp đúp node** bằng công cụ Chọn mở và đặt con trỏ vào ô nội dung ngay cả khi trình duyệt chuyển sự kiện từ node về vùng canvas. Kéo node hoặc nhấp một lần vẫn không mở ô sửa.

Sau deploy, thử Project mới → Canvas A4, viết đủ dài qua trang, cuộn trang nối liền, xuất PDF; mở lại Canvas vô hạn đã có và nhấp đúp vào node. Nên cập nhật các thiết bị cùng chỉnh sửa project A4 lên bản mới.
