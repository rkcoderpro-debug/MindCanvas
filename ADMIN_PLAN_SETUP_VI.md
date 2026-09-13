# Thiết lập gói và service admin

Bản này chưa bật cổng thanh toán tự động. Người dùng bấm badge gói trên topbar, xem 4 gói Free/Plus/Pro/Max và liên hệ Zalo `0385287824`. Admin xác nhận thanh toán bên ngoài rồi cấp gói trong dashboard.

## 1. Chạy migration Supabase

Trong Supabase SQL Editor, chạy lần lượt các migration hiện có, đặc biệt:

```text
supabase/migrations/0006_manual_plans_admin_usage.sql
```

Migration tạo bảng giá, entitlement của từng account, usage theo tháng, usage hiện tại của project/tài liệu và audit log. Account mới mặc định là `Free`.

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

AI Auto được đếm theo tháng. Dung lượng được tính từ JSON project và file tài liệu đã lưu. AI Manual không gọi API MindCanvas và không bị tính vào quota AI Auto.
