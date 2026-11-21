# QA MindCanvas v5.27.2

- Mô phỏng HTTP 525 khi kiểm tra Auth: không gọi refresh token, không báo hết phiên.
- Mô phỏng 401: thử refresh một lần, kiểm tra lại token thay thế và không tiếp tục nếu tài khoản không khớp; nếu refresh lỗi 5xx thì báo tạm thời, nếu refresh token bị từ chối thì yêu cầu đăng nhập.
- Kiểm tra các yêu cầu đang chạy đồng thời chỉ dùng chung cho cùng tài khoản/token. Xác minh deadline dành riêng cho GET người dùng; lệnh ghi notes và refresh token không bị thay chính sách timeout.
- Mô phỏng lưu canvas khi Auth trả 525: bản nháp vẫn pending và thông báo được gỡ sau khi lưu lại thành công.
- Chạy bộ kiểm thử ứng dụng và build production. Chưa chạy với Supabase hoặc Render production.
