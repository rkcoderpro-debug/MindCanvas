# MindCanvas V6.8.20

- Tạo phòng nghe nhạc có thể kèm bài hát hoặc playlist mở đầu. Link để trống vẫn tạo phòng bình thường.
- Tên bài tự điền cho liên kết có video. Trong playlist, bảng chung và Dynamic Island cập nhật theo bài đang phát.
- Thành viên tự chỉnh âm lượng hoặc tắt tiếng. Phòng giữ bài và vị trí khi phiên cuối rời hoặc hết hạn. Khi phòng còn người và hàng đợi hết bài, phòng phát lại nguồn hiện tại.
- Khung YouTube dùng tùy chọn ẩn nút điều khiển chính thức. Trình duyệt có thể cần người nghe bấm **Bật âm thanh**. Nội dung hoặc lớp phủ do YouTube cung cấp vẫn có thể xuất hiện.
- Bảng chung sát thanh trên hơn và nút thao tác tự xuống hàng trên màn hình hẹp.

Chép các tệp bên trong thư mục phiên bản vào thư mục gốc dự án. Chạy migration Supabase `0049_online_room_shared_music.sql` sau migration 0048 và trước khi triển khai bản web này. Migration giữ các phòng, video và thành viên cũ.
