# MindCanvas v6.3.0 — Phòng Online, đợt cuối

Gói cập nhật từ v6.2.0. Giải nén vào thư mục gốc chứa `package.json` và `apps/`.

- **Lớp học → Phòng Online của lớp:** Giáo viên mở phòng, học sinh đang tham gia lớp có thể vào. Link chia sẻ vẫn kiểm tra tư cách thành viên. Giáo viên giữ vai trò chủ phòng. Một phòng chứa tối đa 20 người. Việc mất quyền lớp chặn cập nhật, nội dung riêng và kết nối mới; khi webhook LiveKit hoạt động, máy chủ cũng kiểm tra để ngắt các kết nối lớp đã mất quyền.
- **Kiểm duyệt:** Chủ phòng hoặc người điều phối phòng mở sẵn có thể khóa gửi chat và tệp, gỡ tin nhắn hoặc mời người rời phòng. Người dùng có thể báo cáo phòng hoặc tin nhắn ngay cả khi chat bị khóa. Quản trị viên chỉ nhận lý do, mô tả và nội dung tin nhắn được báo cáo (hoặc tên tệp); phần còn lại của chat không nằm trong báo cáo.
- **Mở rộng có kiểm soát:** Hai phòng mới **Góc ôn bài** và **Góc tự học** được tạo ở trạng thái đóng, bắt đầu với chat khóa. Quản trị viên có thể cấp riêng quyền tạo phòng công khai và quyền điều phối. Giới hạn mặc định là 20 phòng đang mở, trong đó tối đa 6 phòng công khai, ngoài hai phòng gốc. Giảm giới hạn hoặc tạm ngưng thử nghiệm chặn mở mới; không đóng phòng đang dùng. Quản trị viên có thể đóng riêng từng phòng mẫu mới.
- **Theo dõi dùng và chi phí:** Quản trị → Phòng Online hiển thị số phút kết nối đo từ cặp sự kiện vào và rời cuộc gọi của LiveKit, theo tháng giờ Việt Nam. Nhật ký không ghi âm thanh, hình ảnh hay màn hình. Số phút trong ứng dụng dùng để theo dõi, không phải hóa đơn; dữ liệu truyền xuống và chi phí thực lấy từ Usage/Billing của dự án LiveKit và lưu lại trong màn hình quản trị.

## Cập nhật

1. Chạy toàn bộ `supabase/migrations/0042_online_rooms_rollout.sql` sau `0041` trên dự án Supabase. Các dự án chưa có những phần trước cần chạy `0039` → `0040` → `0041` → `0042`.
2. Deploy **Render API và Static Site** v6.3.0. Giữ các biến đang có: `ADMIN_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; Static Site giữ `VITE_API_BASE_URL`. Không phải tạo thêm khóa.
3. Trên dự án **LiveKit Cloud**, thêm một webhook gọi địa chỉ Render API dạng `https://<api-cua-ban>/api/online-rooms/livekit-webhook`. Chọn khóa ký trùng `LIVEKIT_API_KEY` trên Render; nếu màn hình cấu hình cho chọn sự kiện, bật `participant_joined`, `participant_left` và `room_finished`.
4. Dùng hai tài khoản có quan hệ giáo viên và học sinh, thử vào lớp và thực hiện một cuộc gọi thử rồi rời cuộc gọi để có số liệu. Kiểm tra một tài khoản ngoài lớp không thể dùng link vào lớp, và học sinh đã bị xóa khỏi lớp không tải được tệp phương tiện hoặc Canvas riêng của phòng. Thử khóa chat và báo cáo.
5. Trong **Quản trị → Phòng Online**, kiểm tra đã nhận phiên hoàn tất trong 7 ngày qua, lưu dữ liệu truyền xuống và chi phí tháng từ Usage/Billing (nhập 0 nếu dashboard hiển thị 0), rồi xác nhận đối chiếu để bật thử nghiệm. Sau đó mở từng phòng mẫu hoặc cấp quyền tạo phòng cho người dùng đã chọn.

Đã kiểm tra cục bộ mã web, API và migration. Gói này chưa được triển khai lên Render/Supabase đang chạy, nên cần xác nhận webhook và số liệu chi phí thật sau khi triển khai.
