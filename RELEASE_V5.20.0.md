# MindCanvas v5.20.0 — Lab library

## Cài bản cập nhật

1. Sao lưu repository đang dùng và xuất bản sao lưu Lab trong web.
2. Giải nén `MindCanvas_V5.20.0_changed_files_FIXED.zip` vào thư mục gốc repository. Giữ nguyên cấu trúc `apps/`, `supabase/`; ghi đè các file tương ứng. Gói này được tạo từ nguồn v5.19.0 trong phiên hiện tại.
3. Nếu đã giải nén gói v5.20.0 trước đó, xóa **chỉ** file đánh số nhầm `supabase/migrations/0031_v5_20_0_lab_library.sql`. Giữ nguyên `0031_v5_19_0_activity_notifications.sql` của v5.19; giải nén ZIP không tự xóa file tên cũ.
4. Trong Supabase SQL Editor, chạy **chỉ file mới** `supabase/migrations/0032_v5_20_0_lab_library.sql`, sau khi database đã có các migration đến `0031_v5_19_0_activity_notifications.sql`. Migration có transaction và có thể chạy lại. Không cần chạy lại SQL cũ. Nếu đã chạy SQL Lab từ file đánh số nhầm bằng SQL Editor, đổi tên file không yêu cầu xóa bảng hay dữ liệu; nội dung migration Lab không đổi ngoài chú thích thứ tự.
5. Chạy `npm ci` nếu chưa có dependencies; sau đó chạy:

```bash
npm run test
npm run build
npm run dev:web
```

6. Làm checklist trình duyệt trong `QA_V5.20.0.md`, gồm cloud bằng tài khoản thử và người nhận khác.
7. Commit/push repository của bạn lên GitHub để Render build lại. Lệnh build web vẫn là `npm install && npm run build --workspace apps/web`.
8. Kiểm tra badge **V5.20.0** và mở một Lab cũ sau khi deploy.

## Thay đổi

- Trang Lab bắt đầu bằng thư viện thẻ có ảnh bìa, tìm kiếm, lọc môn/chế độ và sắp xếp.
- Menu ba chấm: chỉnh sửa, chia sẻ, tải HTML, xóa. Lab mẫu được chỉnh sửa thành bản sao riêng.
- Thêm/chỉnh sửa trong hộp thoại. Nhập HTML có sẵn là mặc định. Mã HTML chỉ hiện khi chọn Dán / sửa HTML.
- Luồng AI Manual gồm 8 chế độ: hoạt họa, mô phỏng định lượng, trực quan kiến thức, thí nghiệm ảo, thuật toán, dữ liệu, tình huống, tự do. Prompt riêng và tùy chọn 2D/3D.
- Khung xem riêng có auto/scene/document, tỷ lệ cảnh và fullscreen. Giữ iframe khi vào/thoát fullscreen, dừng iframe khi trở về thư viện.
- Canvas/SVG có thể tạo ảnh bìa lúc xem thử hoặc mở Lab; HTML không hỗ trợ dùng ảnh bìa tải lên hoặc thẻ dự phòng. Không chạy iframe trong thư viện.
- Ảnh bìa nén tối đa 640×360 và 200.000 ký tự; lưu trong IndexedDB. Không ghi HTML/ảnh vào localStorage.
- Lưu trước trên thiết bị; tài khoản có quyền Lab cloud sẽ thử đồng bộ sau đó. Thông báo lỗi cloud hiển thị trong trang, không mở popup tự động.
- Hàng đợi theo từng Lab cho lưu và xóa cloud; bản lưu cũ không thể hoàn tất sau thao tác xóa cùng hàng đợi.
- Metadata mới đi qua cloud và lưu bản sao. Ghi chú nguồn/prompt riêng của tác giả được khôi phục cho chủ sở hữu; RPC chia sẻ và bản sao không phát tán ghi chú nguồn riêng.
- Lab được chia sẻ dùng cùng thành phần xem và giữ yêu cầu đồng ý tải CDN.
- Guide Lab được cập nhật theo thư viện/hộp thoại mới.
- Badge/version root, web, server và lockfile cùng 5.20.0. Không thêm dependencies.

## Database

Migration 0032 thêm `lab_mode`, `thumbnail`, `viewer_config`, `creation_config`; cập nhật RPC đọc học liệu, lưu bản sao, trigger phiên bản và giới hạn dung lượng. Số 0031 thuộc migration thông báo v5.19 và được giữ nguyên.

Dữ liệu cũ mặc định `freeform`; HTML và ID cũ được giữ. Giới hạn cloud vẫn 50 Lab/50 MB, nay tính cả metadata và ảnh bìa. Bản trên thiết bị được giữ nếu cloud báo đầy hoặc thiếu migration.

## Phạm vi đã kiểm tra

Đã chạy unit/integration React + IndexedDB và build web/server. Chi tiết cùng các mục cần kiểm thử trên Chrome/Supabase thật có trong `QA_V5.20.0.md`.

Gói chưa được push GitHub hoặc deploy Render trong phiên này: thư mục nguồn hiện tại không có Git metadata/remote. Các thay đổi được bàn giao bằng zip.
