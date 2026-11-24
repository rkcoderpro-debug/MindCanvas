# MindCanvas v6.1.0 — Phòng Online, đợt 2

Gói cập nhật từ **v6.0.0**. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

## Nội dung

- **Không gian học tập → Phòng Online → Tạo phòng → Phòng học / họp.** Bố cục chính là bàn họp nhìn từ trên xuống, với tối đa 20 avatar quanh bàn. Màn hình chia sẻ hoặc camera hiện trên mặt bàn; người dùng có thể đổi sang giao diện gọn. Phòng riêng tiếp tục hỗ trợ link mời, danh sách chờ và duyệt người vào.
- Bấm **Kết nối cuộc gọi** để nghe và tham gia bằng LiveKit. Mic và camera lúc đầu tắt; người dùng tự bật từng thiết bị. Trong **Mọi người**, chủ phòng có thể cấp hoặc lấy lại quyền trình chiếu, tắt mic, chuyển quyền chủ phòng, mời thành viên rời phòng và kết thúc phòng. Giơ tay, thả cảm xúc và chat hoạt động cả khi chưa vào cuộc gọi.
- **Góc nhạc tập trung** chuyển sang [bản piano bạn chọn](https://www.youtube.com/watch?v=3Lfr3BhvkQY). Sau khi phòng trống, người vào đầu tiên bắt đầu từ đầu, người vào sau bắt theo vị trí chung. Trình phát lặp trong khi đang nghe trong phòng. Nếu trình duyệt chặn tự phát có tiếng, bấm **Phát** trên trình phát. Nếu YouTube hạn chế nhúng, có thể mở video nguồn. **Góc học yên lặng** vẫn không phát nhạc.
- Đợt sau: gắn Canvas với quyền chỉnh sửa theo phòng; gửi, xem và tải tài liệu trong chat.

## Cập nhật trên máy chủ

1. Chạy toàn bộ `supabase/migrations/0040_online_meeting_rooms.sql` trên Supabase, sau migration `0039`. Thử trên staging trước khi áp dụng vào cơ sở dữ liệu đang phục vụ người dùng.
2. Trong môi trường của **Render API**, đặt `LIVEKIT_URL` (địa chỉ `wss://…` của dự án LiveKit Cloud), `LIVEKIT_API_KEY` và `LIVEKIT_API_SECRET`. Giữ cấu hình Supabase của backend, gồm `SUPABASE_URL`, khóa công khai để kiểm tra phiên và `SUPABASE_SERVICE_ROLE_KEY` để gọi các hàm cấp quyền. Không đặt khóa bí mật vào biến `VITE_`. Khi chưa có cấu hình LiveKit, ghế và chat vẫn dùng được; nút kết nối hiển thị lý do.
3. Deploy lại **Render API và Render Static Site** cùng bản này. Kiểm tra `VITE_API_BASE_URL` của Static Site trỏ tới API đang chạy HTTPS.
4. Thử hai tài khoản trong phòng riêng: chủ phòng duyệt khách, cả hai kết nối và xác nhận mic/camera mặc định tắt. Bật mic và camera từng bên, thử chia sẻ màn hình từ máy tính, chuyển và thu hồi quyền trình chiếu, giơ/hạ tay, thả cảm xúc, mời khách rời và đóng phòng. Thử kết nối lại sau khi rớt mạng. Vào phòng piano trên hai thiết bị để xác nhận video cho phép nhúng, phát ngay hoặc sau khi bấm **Phát**, rồi lặp hết một vòng. Thử lại sau khi phòng trống.

Tại thời điểm đóng gói, kiểm tra giao diện và quyền được chạy cục bộ; cuộc gọi giữa thiết bị thật và khả năng nhúng video cần kiểm tra sau khi có môi trường thử nghiệm đã cấu hình.
