# MindCanvas v5.27.0 — Tách ảnh khỏi yêu cầu lưu canvas

Bản cập nhật áp dụng trên v5.26.3. Vẽ một nét trên canvas mẫu gần 12 MB đã chuyển định dạng chỉ gửi dưới 2,5 KB và không gửi lại hai ảnh. Kết quả đo là kích thước dữ liệu gửi trong kiểm thử, chưa phải thời gian lưu trên Supabase production.

- Ảnh nền, ảnh/video/audio nhúng và tệp tài liệu có data URL được đưa vào bucket riêng tư theo từng canvas. Khóa lưu theo SHA-256; một tệp không đổi được dùng lại qua các lần lưu. Nội dung tệp giữ nguyên để xuất file tự chứa và để các phần mềm cũ vẫn nhập được file `.mindcanvas.json`.
- Đọc được cả dữ liệu cũ và mới. Với định dạng mới, ảnh được khôi phục trước khi trình chỉnh sửa sử dụng canvas. Bản nháp thiết bị và file xuất vẫn mang nội dung ảnh. Các tài liệu chỉ được liên kết bằng ID từ Thư viện tài liệu vẫn giữ cơ chế liên kết hiện có.
- Thứ tự ghi: tải các tệp lên → PostgreSQL kiểm tra các tham chiếu tồn tại và bản cloud còn đúng revision → xác nhận lần lưu. Nếu mất mạng hoặc revision đã đổi thì giữ bản nháp; không gửi lại gói JSON cũ khi upload lỗi.
- Owner/editor có thể ghi khi canvas được bật thử; viewer chỉ đọc. Supabase kiểm tra danh tính khi tải file. Không dùng bucket công khai hay lưu signed URL trong canvas. Tệp bất biến để giữ hiệu lực cho các mốc lịch sử.

## Bật thử một canvas

1. Ở máy đang có bản nháp quan trọng, dùng **Tải file về máy** và giữ file. Dừng các tab còn chạy bản cũ dùng cùng canvas. Giải nén gói vào thư mục gốc của mã nguồn v5.26.3.
2. Trên Supabase **môi trường thử**, chạy migration `supabase/migrations/0033_canvas_media_pilot.sql`. Migration chỉ thêm bucket, chính sách, bảng bật thử và trigger; không tự chọn hay chuyển dữ liệu của bất kỳ canvas nào. Kiểm tra bucket `canvas-media-private` ở chế độ private.
3. Build/deploy frontend v5.27.0 với `VITE_CANVAS_MEDIA_STORAGE=false` trước để kiểm tra đọc canvas cũ. Khi mở thử trên hai máy, cả hai phải được cập nhật v5.27.0 hoặc cao hơn trước khi chuyển canvas.
4. Chọn ID của **canvas đã có trên cloud** trong môi trường thử. Tốt nhất dùng canvas trong bản sao cơ sở dữ liệu; nếu chưa có, tạo canvas trống trên cloud rồi thêm ảnh nền/ảnh nhúng tương đương khi đã bật thử. Tránh nhập một file lớn thành canvas mới vì lượt tạo mới vẫn dùng định dạng v1. Trong Supabase SQL Editor của môi trường thử, thay giá trị mẫu tại cả hai câu:

   ```sql
   SELECT id, title, revision
   FROM public.notes
   WHERE id = 'UUID_CANVAS_THU_NGHIEM'::uuid;

   INSERT INTO public.canvas_media_pilot (project_id)
   VALUES ('UUID_CANVAS_THU_NGHIEM'::uuid)
   ON CONFLICT (project_id) DO UPDATE SET allow_conversion = true;
   ```

5. Thiết lập **biến build của frontend Render**, không đặt chỉ ở API server, rồi build/deploy lại frontend:

   ```env
   VITE_CANVAS_MEDIA_STORAGE=true
   VITE_CANVAS_MEDIA_PILOT_IDS=UUID_CANVAS_THU_NGHIEM
   ```

   Mở đúng canvas, vẽ một nét thử và chờ đồng bộ. Lần đầu có request upload ảnh; lần thứ hai chỉ nên gửi JSON nhỏ đến `PATCH /notes`. Mở lại trên tab/máy khác để kiểm tra ảnh và nét đồng thời xuất hiện. Thử offline, xung đột hai tab, tài khoản viewer/editor, khôi phục mốc và export/import trước khi bật trên bản thật.

## Dừng thử và giới hạn

- Bỏ UUID khỏi biến build hoặc chuyển `VITE_CANVAS_MEDIA_STORAGE=false`; có thể đặt `allow_conversion=false` cho canvas chưa chuyển để chặn ở Supabase. Canvas đã chuyển vẫn lưu theo v2, bản cũ bị từ chối khi cố ghi đè. Giữ frontend đọc được v2, migration và bucket; không hạ về frontend cũ cho canvas đã chuyển.
- Mỗi lần cập nhật yêu cầu đúng revision và các tệp đã có trong Storage. Lần chuyển đầu tiên vẫn có thể timeout nếu database đang quá tải; bản nháp sẽ ở lại trên máy, tệp đã tải thành công được dùng lại. Upload chuẩn có thể phải tải lại từ đầu với tệp đang dang dở; bản này chưa tích hợp TUS.
- Bản thử chỉ áp dụng cho canvas đã có trên cloud và có revision. Chưa chạy chuyển hàng loạt, chưa chuyển luồng tạo mới, chưa tự xóa tệp dùng trong lịch sử. Theo dõi dung lượng bucket thử riêng: đồng hồ dung lượng cũ đo `notes.content` và tài liệu, chưa tính dung lượng bucket mới. Kiểm tra giới hạn file của Supabase project trước khi thử tệp lớn.
- Nếu phiên bản compact vẫn trả 57014, theo dõi thời gian xử lý của `PATCH /notes` và kiểm tra khóa/trigger tính dung lượng; không tăng timeout toàn cục để che lỗi.
