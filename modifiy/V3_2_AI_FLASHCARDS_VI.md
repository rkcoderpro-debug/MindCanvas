# MindCanvas V3.2 — AI Flashcards

## Đã làm

- Thêm nút **Tạo bằng AI** trong bộ flashcard.
- Chọn một trong ba nguồn:
  - Dán văn bản.
  - Nội dung chữ/nhãn mind-map của project.
  - PDF: server trích xuất text, lưu bản PDF private vào Supabase Storage rồi gửi text sang Gemini.
- AI trả về preview có cấu trúc, tối đa 50 thẻ. Người dùng có thể sửa tên, câu hỏi, câu trả lời, trang nguồn; xóa thẻ không phù hợp hoặc thêm thẻ thủ công.
- Chỉ khi bấm **Thêm vào bộ thẻ** thì card mới được ghi vào deck. Nếu chỉ tạo preview, deck hiện tại không bị thay đổi.
- Server validate JSON, giới hạn độ dài, bỏ card trùng và không trả API key ra browser. Không dùng demo card làm fallback.
- Dùng lại cơ chế `GEMINI_MODELS` theo thứ tự ưu tiên, timeout, cooldown và lỗi có kiểm soát đang có cho mind-map.

## Cấu hình Render

V3.2 có sửa backend, vì vậy cần deploy lại cả hai service.

### `mindcanvas-api` — Environment Variables

Giữ các biến Supabase hiện có và thêm/kiểm tra:

```env
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=<key Gemini của bạn>
GEMINI_MODEL=gemini-3.8-flash
GEMINI_MODELS=gemini-3.8-flash,gemini-3.7-flash,gemini-2.5-flash
```

`GEMINI_API_KEY` và `GEMINI_MODELS` chỉ được đặt ở **mindcanvas-api**. Không đặt trong `VITE_*`, không commit vào GitHub. Nếu một model không tồn tại trong project của bạn, bỏ nó khỏi danh sách; fallback chỉ có tác dụng với lỗi tạm thời như 404/429/5xx/timeout, không bypass lỗi quyền 403.

Sau đó chọn **Manual Deploy → Deploy latest commit** hoặc chờ Render tự deploy. Kiểm tra:

```text
https://<api-domain>.onrender.com/api/health
```

### `mindcanvas-web` — Environment Variables

Giữ:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
VITE_API_BASE_URL=https://<api-domain>.onrender.com
```

Chọn **Save, rebuild, and deploy** sau khi API đã có URL đúng. Frontend không cần biết Gemini key.

## Chạy local

```bash
npm install
npm run typecheck --offline
npm run build --offline
npm test --offline
```

Lệnh test gốc chạy cả Vitest frontend và Node test backend. Live request vẫn cần credentials thật.

## Supabase

V3.2 không thêm migration mới. Bạn vẫn cần chạy:

```text
supabase/migrations/0005_flashcards.sql
```

Migration này tạo `flashcard_decks` và `flashcards`, bật RLS và giới hạn dữ liệu theo `auth.uid()`.

## Cách dùng

1. Đăng nhập Google và mở **Flashcard**.
2. Tạo hoặc chọn một bộ thẻ.
3. Bấm **Tạo bằng AI**.
4. Chọn nguồn text/project/PDF, đặt số thẻ tối đa rồi bấm **Tạo bản xem trước**.
5. Kiểm tra và sửa preview.
6. Bấm **Thêm vào bộ thẻ**.

AI generation yêu cầu user đã đăng nhập vì endpoint được bảo vệ bởi session server-side. Nếu chưa đăng nhập, vẫn dùng được CRUD local V3.1 nhưng nút AI bị khóa.

## Xử lý lỗi Gemini

- `HTTP 403`: kiểm tra đúng API key/project/API restrictions; code cố ý không chuyển model để tránh che giấu lỗi quyền.
- `HTTP 404`, `429`, `5xx` hoặc timeout: runner thử model tiếp theo trong `GEMINI_MODELS` nếu model đó chưa bị cooldown.
- JSON không hợp lệ: runner thử model kế tiếp; nếu tất cả thất bại, deck không bị thay đổi.
- API chưa redeploy: frontend có thể hiển thị lỗi 404 cho `/api/ai/flashcards`; deploy lại `mindcanvas-api` trước rồi rebuild frontend.

## Chưa làm trong V3.2

Import/export deck, sinh thẻ theo từng trang có lựa chọn nâng cao, batch transaction cho Apply, quiz, thống kê, tutor, RAG và cộng tác realtime vẫn để ở các slice sau.

