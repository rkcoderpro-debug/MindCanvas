# MindCanvas v5.27.3 — Lưu canvas v2 và link mở trực tiếp

Gói này cập nhật trực tiếp từ **v5.27.1 hoặc v5.27.2**. Giải nén vào thư mục có `package.json`, `apps/`, `packages/` và `supabase/`. Đồng bộ các tệp với repository đang nối Render.

## Lưu canvas v2

- Sau khi bật chung, canvas cũ chuyển dần ở lần lưu nội dung tiếp theo. Không có lệnh tải hoặc chuyển tất cả ảnh cùng lúc. Canvas đã chuyển không tải lại ảnh cũ khi chỉ sửa chữ hoặc vẽ nét.
- Canvas mới, kể cả canvas nhập từ tệp có ảnh, ghi bản cloud đầu tiên ở v2. Ứng dụng đợi các tệp cần thiết trước khi ghi canvas. Nếu tải tệp lỗi, bản nháp thiết bị được giữ và không tạo canvas rỗng trên cloud.
- Dung lượng những tệp đang được canvas v2 tham chiếu được tính vào quota khi lưu. Một tệp lặp trong cùng canvas chỉ tính một lần. Quota này không phản ánh toàn bộ dung lượng bucket: ảnh còn giữ vì lịch sử hoặc lần tải bị bỏ dở có thể vẫn chiếm chỗ. Các canvas pilot cũ cập nhật lại số byte khi lưu nội dung lần tới.
- Canvas chỉ lưu trên thiết bị vẫn dùng được khi không có cloud. Không thay đổi định dạng tệp xuất/nhập `.mindcanvas.json`.

## Bật một lần cho tất cả tài khoản

1. Trong Supabase của dự án, chạy `0034_canvas_media_rollout.sql` trong SQL Editor. Chạy `0033_canvas_media_pilot.sql` trước **chỉ nếu chưa chạy**. `0034` tạo công tắc ở trạng thái tắt và không chuyển dữ liệu ngay.
2. Tại **Render → MindCanvas (Static Site) → Environment**, đặt:

   ```env
   VITE_CANVAS_MEDIA_STORAGE=true
   VITE_CANVAS_MEDIA_MODE=all
   ```

   Không cần thêm canvas mới vào `VITE_CANVAS_MEDIA_PILOT_IDS`. Có thể giữ danh sách cũ để các canvas pilot tiếp tục hoạt động trong lúc chưa bật chung. Nếu muốn cả danh sách thử dừng cùng công tắc chung thì xóa danh sách trước khi build. Build/deploy frontend và đợi bản v5.27.3 hiện Live.
3. Sau khi kiểm tra frontend đọc được canvas v2 đang có, bật lưu v2 chung trong SQL Editor:

   ```sql
   UPDATE public.canvas_media_rollout
   SET enabled = true
   WHERE singleton;
   ```

4. Tải lại tab, mở canvas cũ chưa có trong pilot, sửa một chi tiết rồi lưu. Lần đầu có thể cần thời gian tải ảnh; lần sau kiểm tra `PATCH /notes` có `content.version: 2` và không tải lại ảnh cũ. Tạo hoặc nhập một canvas có ảnh để kiểm tra lần `POST /notes` đầu tiên cũng là v2. Kiểm tra mở lại trên thiết bị hoặc cửa sổ khác.

Nếu cần tạm dừng chuyển đổi chung, dùng `UPDATE public.canvas_media_rollout SET enabled = false WHERE singleton;`. Bản v5.27.3 vẫn đọc và lưu canvas đã chuyển ở v2. Các canvas pilot đang được cho phép riêng vẫn theo cấu hình pilot. Giữ migration, bucket và phiên bản frontend có khả năng đọc v2.

## Link riêng

- Mở canvas sẽ cập nhật thanh địa chỉ thành `/?canvas=<id>`. Dùng **Sao chép link canvas** để lưu bookmark, mở tab mới hoặc gửi cho người đã có quyền. Có hỗ trợ tải lại và Quay lại/Tiến tới trong trình duyệt. Link dùng ID, nên đổi tên hoặc chuyển thư mục không làm đổi link.
- Dùng **Chia sẻ project** để mời người chưa có quyền. Link canvas không tự cấp quyền. Canvas chưa lưu cloud chỉ mở được trên thiết bị đang giữ bản nháp.
- Không cần thiết lập Redirects/Rewrites mới trên Render vì URL vẫn sử dụng trang chính hiện có.
