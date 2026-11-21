# MindCanvas V3.5.1 — Shared AI reliability hotfix

## Lỗi được sửa

Ảnh lỗi cho thấy request của tài khoản khác đã đi qua Google Login, qua Supabase session validation và tới Gemini. Đây không phải lỗi OAuth/CORS theo tài khoản. Gemini trả lần lượt `503`, timeout và `404` trong chuỗi fallback.

Mọi người truy cập MindCanvas đều gọi cùng backend Render và dùng cùng `GEMINI_API_KEY` phía server. Vì vậy quota, rate limit và năng lực xử lý của Google project là tài nguyên chung; người dùng không có key riêng trong trình duyệt.

V3.5.1 thay đổi hành vi như sau:

- Lỗi tạm thời `408`, `429`, `5xx`, timeout hoặc network được retry có exponential backoff và jitter trước khi chuyển model.
- `Retry-After` từ Google được tôn trọng. Nếu thời gian chờ quá dài, request chuyển sang model dự phòng thay vì giữ kết nối vô ích.
- `404` chuyển model ngay và model đó được cooldown 5 phút; `403` vẫn dừng ngay vì đổi model không sửa được key/quyền.
- Một `503` đơn lẻ không còn đưa model vào cooldown toàn server, nên người dùng kế tiếp vẫn được thử model chính.
- Tối đa hai tác vụ AI chạy đồng thời; mỗi tài khoản tối đa một tác vụ đang chạy và hai tác vụ chờ. Người dùng/tabs khác được dùng phần capacity còn lại.
- Hàng đợi toàn server có giới hạn và timeout. Khi bận, API trả `429 AI_BUSY` cùng `Retry-After` thay vì treo vô thời hạn.
- Lỗi cuối cùng trên giao diện được rút gọn, dịch Việt/Anh và không còn đổ danh sách dài từng model lên màn hình điện thoại.
- `/api/health` công khai trạng thái an toàn gồm release, AI đã cấu hình hay chưa, số model và giới hạn đồng thời; endpoint không trả API key.

## Cấu hình Render cho `mindcanvas-api`

Giữ nguyên key thật trong `GEMINI_API_KEY`. Đặt các giá trị:

```env
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_MODELS=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite
GEMINI_TIMEOUT_MS=25000
GEMINI_RETRIES_PER_MODEL=1
GEMINI_TOTAL_TIMEOUT_MS=120000
GEMINI_RETRY_BASE_MS=1000
AI_MAX_CONCURRENT=2
AI_MAX_QUEUE=20
AI_MAX_QUEUE_PER_USER=2
AI_QUEUE_TIMEOUT_MS=30000
```

Không tạo `VITE_GEMINI_API_KEY`, không đặt key ở Static Site và không commit `.env`.

## Thứ tự deploy

1. Chép gói source/changed-files vào repository MindCanvas.
2. Chạy `npm install`, `npm run typecheck`, `npm test`, `npm run build`.
3. Commit và push lên nhánh Render đang theo dõi.
4. Deploy `mindcanvas-api` trước.
5. Kiểm tra `/api/health` trả `release=3.5.1`, `aiConfigured=true`, `aiModelCount=6`, `aiCapacity=2`.
6. Deploy `mindcanvas-web`, mở web online và nhận bản service-worker mới.
7. Kiểm tra bằng hai tài khoản Google khác nhau. Mỗi tài khoản dùng PDF nhỏ trước, sau đó mới tăng kích thước tài liệu.

## Đọc Render Logs

- `[AI] retry`: cùng model đang được thử lại sau lỗi tạm thời.
- `[AI] fallback`: model hiện tại hết lượt thử; backend chuyển model kế tiếp.
- `[AI] success`: request thành công; log có model và số attempt.
- `[AI] unavailable`: toàn chuỗi thất bại; log chỉ có mã lỗi kiểm soát, không có key hoặc nội dung PDF.

## Giới hạn còn lại

Hotfix tăng khả năng chịu lỗi nhưng không bảo đảm Gemini miễn phí luôn sẵn sàng. Nếu nhiều người dùng vượt quota chung, cần tăng quota/chuyển gói theo lựa chọn của chủ dự án hoặc giảm lưu lượng; MindCanvas không tự bật billing và không âm thầm dùng provider trả phí. Live Gemini/Render vẫn cần kiểm thử bằng credential production sau deploy.

Tài liệu model và retry chính thức đã đối chiếu ngày 2026-09-12:

- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/troubleshooting
