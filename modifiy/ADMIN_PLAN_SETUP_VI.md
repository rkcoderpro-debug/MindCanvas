# Thiết lập gói và service admin

## V4.0 — quota mới và add-on AI Manual

Chạy `supabase/migrations/0007_v4_quota_subscriptions.sql` sau `0006_manual_plans_admin_usage.sql`. Bảng quota mới dùng chu kỳ 12:00–12:00 theo giờ Việt Nam: Free có 1 AI Auto/ngày, 3 AI Manual/ngày, 20 MB và tối đa 50 flashcard/lần; Plus/Pro/Max lần lượt có 20/60/150 AI Auto/ngày, AI Manual không giới hạn và tối đa 100/200/500 flashcard/lần. Add-on `ai_manual` là gói riêng 29.000₫/tháng, không tự thanh toán trong ứng dụng.

Admin bật/tắt add-on cùng lúc cấp gói. Mỗi thay đổi plan, thời hạn hoặc add-on được ghi vào `subscription_history`; tài khoản có thể xem lịch sử trong hộp thoại gói. Cơ chế `account_storage` cũng được tính lại từ dữ liệu thật và chặn ghi vượt quota ở database.

Bản này chưa bật cổng thanh toán tự động. Người dùng bấm badge gói trên topbar, xem 4 gói Free/Plus/Pro/Max và liên hệ Zalo `0385287824`. Admin xác nhận thanh toán bên ngoài rồi cấp gói trong dashboard.

## 1. Chạy migration Supabase

Trong Supabase SQL Editor, chạy lần lượt các migration hiện có, đặc biệt:

```text
        supabase/migrations/0006_manual_plans_admin_usage.sql
        supabase/migrations/0007_v4_quota_subscriptions.sql
```

Migration tạo bảng giá, entitlement của từng account, usage theo tháng/ngày, usage hiện tại của project/tài liệu, add-on, lịch sử thay đổi và audit log. Account mới mặc định là `Free`.

## 2. Cấu hình API trên Render

Thêm hai biến môi trường vào service `mindcanvas-api`:

```text
ADMIN_EMAIL=<Gmail admin chính xác>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service_role key>
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ đặt ở server Render, không đặt trong `apps/web`, không thêm vào GitHub và không đưa vào file ZIP.

`ADMIN_EMAIL` phải là Gmail đã dùng để đăng nhập admin. Không cần sửa code để thay Gmail.

## 3. Cấp quyền cho người dùng

1. Đăng nhập MindCanvas bằng Gmail trong `ADMIN_EMAIL`.
2. Bấm avatar trên topbar → `Bảng điều khiển admin`.
3. Chọn account, chọn `Free`, `Plus`, `Pro` hoặc `Max`.
4. Có thể đặt ngày hết hạn và ghi chú nội bộ, sau đó bấm `Lưu gói`.

AI Auto được giữ telemetry theo tháng nhưng quyền sử dụng được khóa theo quota ngày bằng reservation/commit ở server. Dung lượng được tính từ JSON project và file tài liệu đã lưu. AI Manual không gọi Gemini qua API MindCanvas, nhưng lượt xác nhận kết quả manual được ghi nhận qua endpoint quota để giới hạn Free hoặc mở không giới hạn khi có add-on/gói phù hợp.
