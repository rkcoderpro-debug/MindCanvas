# MindCanvas v5.11.4

## Sửa lỗi phiên đăng nhập và Lab giữa các profile

- Chờ cả `INITIAL_SESSION` và `getSession()` trước khi dựng workspace, tránh hiển thị “Khách” trong lúc phiên hợp lệ đang được khôi phục sau F5.
- Hiển thị lỗi khôi phục phiên có hướng dẫn nhưng không xoá dữ liệu Lab cục bộ.
- Thêm đồng bộ Lab đã công bố từ cloud về profile khác của cùng tài khoản.
- Chỉ nhập Lab cloud còn thiếu; nếu trùng ID nhưng nội dung cục bộ khác, giữ bản cục bộ và báo xung đột.
- Thêm nút `Đồng bộ Lab` để đưa tất cả Lab đã lưu trên thiết bị lên cloud sau khi người dùng chủ động chọn.
- Thêm `Xuất Lab` và `Nhập Lab` bằng file JSON phiên bản 1 để sao lưu và chuyển dữ liệu giữa profile.

## Kiểm chứng

- Web test mục tiêu: 30 test đạt.
- Server test: 42 test đạt.
- Typecheck web: đạt.
- Vite production build: đạt khi xuất sang thư mục tạm có quyền ghi.
- Migration `0021_v5_11_3_learning_version_trigger_fix.sql` vẫn phải được chạy trên Supabase production.
