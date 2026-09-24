# V5.13.0

- Lab HTML có tùy chọn tải thư viện từ danh sách CDN được cho phép; mặc định vẫn tắt.
- Giữ Lab chạy trong iframe sandbox không cùng nguồn. Kết nối API/Gemini, form, worker, đối tượng nhúng và truy cập dữ liệu MindCanvas bị chặn.
- Lưu tùy chọn CDN trong IndexedDB, bản nháp, cloud, bản sao học liệu được chia sẻ và tệp sao lưu.
- Không tự chạy mã CDN khi mở hoặc khôi phục Lab; người dùng bấm Chạy. Lab được chia sẻ yêu cầu người nhận đồng ý trước khi tải CDN.
- Thêm file sao lưu Lab từ HTML VietGeoAI 3D Khối cầu/Khối trụ V2.
- Nâng phiên bản badge/PWA lên V5.13.0 và tạo migration Supabase 0024.
