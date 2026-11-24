# MindCanvas v6.0.0 — Phòng Online, đợt 1

Gói cập nhật từ **v5.30.3**. Giải nén vào thư mục gốc có `package.json` và `apps/`.

## Có gì mới?

- **Không gian học tập → Phòng Online** (hoặc tìm **Phòng Online** bằng Ctrl/⌘+K).
- Có hai phòng mở sẵn: **Góc nhạc tập trung** và **Góc học yên lặng**. Người dùng đăng nhập để chọn phòng, được xếp một trong **20 ghế** và có thể đổi sang ghế trống. Có sơ đồ **Lớp học Việt Nam** và **Giao diện gọn**; đổi bố cục chỉ ảnh hưởng máy của mình.
- Trong phòng nghe nhạc, chủ phòng thêm link video YouTube và điều khiển bài chung. Khi bật đề xuất, thành viên gửi bài để chủ phòng duyệt, bỏ hoặc xếp lại. Mỗi người bấm **Nghe cùng phòng** và dùng âm lượng riêng. Nếu YouTube chặn tự phát, bấm Phát trên trình nhúng. Với video bị hạn chế nhúng, người dùng có thể mở nguồn YouTube; quảng cáo hoặc mạng yếu có thể làm lệch vị trí nghe.
- Chat theo phòng, link mời phòng riêng có hạn 24 giờ, tùy chọn duyệt người vào, chuyển quyền chủ phòng và kết thúc phòng. Quyền tạo phòng công khai được cấp theo tài khoản; phòng riêng được chọn mặc định.
- Bàn họp, mic/camera, chia sẻ màn hình, gửi tệp và Canvas trong phòng thuộc các đợt tiếp theo.

Nhạc mẫu: *Meditation Impromptu 01* — Kevin MacLeod ([incompetech.com](https://com.incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100163)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Bản mẫu phát qua [YouTube](https://www.youtube.com/watch?v=QhYS_p4m09A).

## Cập nhật

1. Trên Supabase, chạy `supabase/migrations/0039_online_music_rooms.sql` **sau** `0038_study_library_summaries.sql`. Nếu còn thiếu migration trước, áp dụng theo thứ tự.
2. Cập nhật mã và deploy **Render Static Site**. Đợt này không cần redeploy Render API, đổi thiết lập Google OAuth, hoặc thêm khóa LiveKit/YouTube.
3. Thử bằng hai tài khoản trên môi trường thử nghiệm: A mở phòng riêng, tạo link và duyệt B; hai tài khoản đổi ghế, chat, A thêm bài YouTube và B vào sau bấm **Nghe cùng phòng**. Kiểm tra cả lần quay lại từ tab tải lại. Việc phát YouTube thật và cấu hình Supabase của dịch vụ đang chạy cần xác minh sau deployment.

Các kiểm tra tự động của web/API và script SQL trên cơ sở dữ liệu cục bộ kiểm tra quyền tham gia, ghế, chat, đề xuất và trạng thái bài đang phát.
