# MindCanvas v6.2.0 — Phòng Online, đợt 3

Gói cập nhật từ v6.1.0. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- Trong **Phòng học / họp → Canvas**, chủ phòng có thể tạo Canvas trống (thường hoặc A4), hoặc gắn một bản sao từ Canvas của mình trên Workspace. Bản gốc giữ nguyên. Bản sao giữ chữ, nét vẽ, hình, sơ đồ và trang A4; không mang theo tài liệu nguồn, tệp đa phương tiện, liên kết nhúng hoặc hình nền đa phương tiện.
- Thành viên mặc định chỉ xem. Chủ phòng bật **Cho thành viên sửa** hoặc **Khóa quyền sửa**. Bản vẽ tự đồng bộ. Các chỉnh sửa trên phần tử khác nhau được gộp nếu có thể; khi đụng nhau, người sửa vẫn có thể tải phần nháp dưới dạng Canvas. **Gỡ khỏi bàn** giữ bản đã lưu và khóa quyền sửa của khách cho tới khi chủ phòng mở lại.
- Trong **Chat**, bấm biểu tượng kẹp giấy, chọn tệp rồi bấm **Gửi tệp**. Hỗ trợ xem và tải **PDF, DOCX, PNG, JPG, WebP, TXT UTF-8**. Tối đa 8 MB mỗi tệp, 20 tệp và 40 MB mỗi phòng. Tệp chỉ có thể được lấy qua phiên phòng đang hoạt động; xóa tin nhắn sẽ chặn các lượt tải mới. Bản đã tải về thiết bị không thể thu hồi. Tệp của phòng hết hạn và các tệp không còn tin nhắn sẽ được dọn theo đợt, khi dịch vụ xử lý lần gửi tệp tiếp theo.
- Canvas và chat tệp hoạt động mà không cần tham gia cuộc gọi. Mic, camera và chia sẻ màn hình tiếp tục dùng cấu hình LiveKit của v6.1.0.

## Cập nhật

1. Trên Supabase, chạy toàn bộ `supabase/migrations/0041_online_meeting_collaboration.sql` sau migration `0040`. Migration tạo bucket riêng `meeting-room-files`; giữ bucket ở chế độ private. Không cần tự tạo policy tải tệp.
2. Deploy lại cả **Render API** và **Static Site** từ v6.2.0. Giữ `SUPABASE_SERVICE_ROLE_KEY` ở Render API và `VITE_API_BASE_URL` ở Static Site. Không cần tạo thêm khóa LiveKit.
3. Dùng hai tài khoản thử: mở phòng → gắn Canvas → cho khách sửa → khóa lại; lưu và tải bản sao rồi kiểm tra bản gốc. Thử gửi PDF và DOCX, xem và tải từ tài khoản còn lại, sau đó xóa tin nhắn và xác nhận không thể tải lại qua phòng.

Đã kiểm tra bộ test web, API và migration ở môi trường cục bộ. Render/Supabase đang chạy chưa được cập nhật trong đợt đóng gói này.
