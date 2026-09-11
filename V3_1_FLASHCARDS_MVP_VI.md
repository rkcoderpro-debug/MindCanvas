# MindCanvas V3.1 — Flashcards MVP

## Đã làm

- Có mục **Flashcard** riêng trong sidebar, mở một workspace trống nếu user chưa tạo dữ liệu.
- Tạo, đổi tên và xóa bộ thẻ; có thể liên kết bộ thẻ với project hiện có.
- Tạo/sửa/xóa từng thẻ bằng form trong app, gồm câu hỏi, câu trả lời và trang nguồn tùy chọn.
- Có chế độ ôn tập cơ bản với bốn mức: **Quên**, **Khó**, **Tốt**, **Dễ**.
- Mỗi lần đánh giá cập nhật hạn ôn, số ngày giãn cách, độ dễ, số lần nhớ và số lần quên.
- Dữ liệu tách theo `owner` trong local cache. Khi Supabase sẵn sàng, repository lưu vào cloud; khi migration chưa chạy hoặc mạng lỗi, giao diện hiện nhãn `Trên thiết bị này`.
- UI có tiếng Việt/English và hỗ trợ dark theme. Không có deck/card mẫu tự động.

## Chạy migration Supabase

Mở Supabase Dashboard → **SQL Editor** → **New query**, dán nội dung:

```text
supabase/migrations/0005_flashcards.sql
```

Sau khi chạy thành công, kiểm tra trong **Table Editor** có hai bảng:

- `flashcard_decks`
- `flashcards`

Migration bật RLS và mọi query frontend đều lọc thêm `user_id`. Policy còn kiểm tra deck/project/folder thuộc cùng user. Không đưa service-role key vào frontend.

## Kiểm tra local

```bash
npm install
npm run typecheck --offline
npm run build --offline
npm test --offline
```

Các script `--offline` chỉ có ý nghĩa với npm; không truyền cờ này trực tiếp vào Vitest. Kết quả hiện tại: 60 tests pass.

## Deploy lên GitHub/Render

```bash
git add apps/web/src/App.tsx \
  apps/web/src/App.test.tsx \
  apps/web/src/components/FlashcardsPage.tsx \
  apps/web/src/hooks/useFlashcards.ts \
  apps/web/src/lib/flashcards.ts \
  apps/web/src/lib/flashcards.test.ts \
  apps/web/src/lib/i18n.tsx \
  apps/web/src/lib/projectStore.ts \
  apps/web/src/styles.css \
  supabase/migrations/0005_flashcards.sql \
  PROJECT_HANDOFF.md V3_1_FLASHCARDS_MVP_VI.md
git commit -m "feat: add flashcards MVP"
git pull --rebase origin main
git push origin main
```

Render sẽ tự build lại `mindcanvas-web` nếu service đang kết nối repo GitHub. V3.1 không sửa `apps/server`, nên `mindcanvas-api` không bắt buộc redeploy; có thể redeploy cả hai nếu Render Blueprint của bạn làm vậy.

## Cách dùng

1. Mở web → chọn **Flashcard**.
2. Bấm **Bộ thẻ mới**, đặt tên, chọn project nếu muốn liên kết.
3. Chọn bộ thẻ → **Thẻ mới** → nhập câu hỏi/câu trả lời → lưu.
4. Bấm **Bắt đầu ôn**. Sau khi hiện đáp án, chọn mức nhớ; kết quả được lưu ngay.

## Chưa nằm trong V3.1

Sinh flashcard tự động từ PDF/mind-map bằng Gemini, import/export deck, quiz, thống kê học tập, chia sẻ và đồng bộ offline có hàng đợi là các slice kế tiếp. Việc tách scheduler/repository từ đầu giữ cho các tính năng đó có thể thêm mà không trộn logic vào `App.tsx`.

