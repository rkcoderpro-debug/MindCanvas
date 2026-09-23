# MindCanvas v5.11.3

## Sửa lỗi lưu học liệu cloud

- Sửa lỗi PostgreSQL `42703: record "old" has no field "questions"` khi cập nhật flashcard.
- Tách trigger tăng `content_version` thành ba hàm riêng cho Quiz, Flashcard và Lab.
- Giữ nguyên quy tắc tăng phiên bản khi nội dung thực sự thay đổi.
- Thêm migration sửa chữa cho các môi trường đã chạy migration `0018`.
- Giữ các thay đổi v5.11.2: lỗi cloud được hiển thị đúng và không bị che bởi lỗi localStorage.

## Kiểm chứng

- Kiểm tra tĩnh migration: không còn trigger dùng chung đọc `OLD.questions` trên bảng khác.
- Web test: 51 file, 340 test đạt.
- Typecheck web/server và build đã chạy đạt.
- Cần chạy migration trên Supabase thật rồi thử lưu lại Flashcard, Quiz và Lab.
