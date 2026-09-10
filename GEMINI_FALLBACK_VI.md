# MindCanvas — Gemini Flash fallback

Thay 4 file có sẵn và thêm 2 file code/test trong ZIP theo đúng đường dẫn; không xóa các file khác.

File sửa: apps/server/src/config.ts, apps/server/src/providers.ts, apps/server/src/index.ts, apps/web/src/lib/api.ts.
File mới: apps/server/src/gemini.ts, apps/server/tests/gemini.test.ts.

## Render: backend mindcanvas-api

Giữ GEMINI_API_KEY hiện có (một key hợp lệ). Thêm biến GEMINI_MODELS với VALUE duy nhất:

```text
gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash
```

Các ID này lấy từ kết quả models.list trong ảnh người dùng cung cấp, không đảm bảo quota hoặc miễn phí. GEMINI_MODELS ưu tiên hơn GEMINI_MODEL cũ. Khi không đặt biến mới, chỉ model trong GEMINI_MODEL được gọi để giữ cấu hình cũ. Không tự chọn model ngoài danh sách và không đổi key hay bật billing.

GEMINI_TIMEOUT_MS tùy chọn, mặc định 25000 (25 giây/model); giới hạn toàn chuỗi 150 giây. GEMINI_BASE_URL vẫn mặc định Google chính thức. Chọn Save and deploy sau khi cập nhật biến; cần deploy code mới để fallback hoạt động.

## Hành vi

- Gọi tuần tự; dừng ngay khi một graph hợp lệ được tạo. Trả provider=gemini và model thực tế.
- Fallback khi 404, 408, 429, 5xx, lỗi mạng, timeout, JSON/graph không hợp lệ.
- Dừng khi lỗi 400/401/403 hoặc các lỗi client khác, và khi nội dung bị chặn; không dùng model khác để vượt chặn nội dung.
- Mỗi model tối đa một lần/request, tối đa 8 model cấu hình. Không chạy song song.
- Tạm bỏ qua model đang 429/5xx/408 ít nhất 30 giây, tuân theo Retry-After nếu dài hơn; 404 nghỉ 5 phút. Cooldown trong RAM một tiến trình, mất khi restart và chưa đồng bộ nhiều instance.
- Backend AI production chỉ dùng Gemini, không tự quay sang Experiential Labs hoặc DemoProvider. Các lớp cũ còn giữ cho tương thích nhưng không nằm trong đường gọi production.
- Tất cả thất bại: HTTP 503 với từng model/mã lỗi; lỗi key/request: HTTP 502 với mã HTTP upstream. Frontend hiển thị thông báo. Không log key, tài liệu hay response body upstream.
- Graph được kiểm tra số node/edge, ID, tham chiếu và parent cycle; null chuyển thành undefined cho editor.
- Fallback không khắc phục quota dùng chung cấp project; không đảm bảo miễn phí hay luôn thành công. Không có quyền đọc/bật billing trong thay đổi này.

## Git và kiểm tra

Chép file vào project hiện có, rồi chạy:

```bash
npm run typecheck
npm run build
node --import tsx --test apps/server/tests/gemini.test.ts
npm test
git add apps/server/src/config.ts apps/server/src/providers.ts apps/server/src/index.ts apps/server/src/gemini.ts apps/server/tests/gemini.test.ts apps/web/src/lib/api.ts GEMINI_FALLBACK_VI.md
git commit -m "fix: ordered Gemini Flash fallback without demo data"
git pull --rebase origin main
git push origin main
```

Dừng nếu pull báo conflict. Chờ cả API và frontend deploy bản mới. Thử PDF nhỏ; xem Network → mind-map → Response: provider phải là gemini, model là model thực tế đã thành công. Render Logs có [AI] fallback và [AI] success (chỉ model/mã lỗi).

## Kiểm chứng và giới hạn

Test dùng fetch giả lập, không gọi Gemini thật hoặc dùng key từ ảnh. Chưa xác minh end-to-end trên Render/Supabase. Thay đổi không sửa auth/PDF extraction/storage. Thông báo ngoài cùng của AiPanel vẫn là thông báo PDF/AI chung; chi tiết mới được nối sau nó.
