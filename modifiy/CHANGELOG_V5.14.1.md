# V5.14.1

- Sửa lưu canvas trên schema cloud chưa có cột `revision`: dùng mốc `updated_at` đã đọc từ cloud làm điều kiện cập nhật, đồng thời vẫn từ chối ghi nếu cloud đổi trong lúc lưu.
- Giữ mốc cloud gốc trong cache để nét vẽ tiếp theo không bị hiểu nhầm thành project mới.
- Hỗ trợ đọc project chia sẻ trong nhánh tương thích schema cũ; quyền truy cập vẫn do Supabase RLS kiểm soát.
- Hộp thoại xung đột hiển thị lỗi ngay tại chỗ, cho thử lại và không phụ thuộc trạng thái bận của thao tác khác.
- Bản nháp tạo thành bản sao vẫn xuất hiện trong Workspace nếu cloud từ chối lưu.
- Tăng phiên bản ứng dụng và cache PWA lên V5.14.1.
- Không thêm migration SQL.
