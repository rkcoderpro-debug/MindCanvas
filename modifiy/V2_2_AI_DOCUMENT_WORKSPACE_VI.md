# MindCanvas V2.2 — AI Document Workspace

V2.2 nâng cấp luồng PDF → mind-map mà không đưa Gemini key ra browser.

## Đã thêm

- PDF preview trong AI panel bằng trình đọc PDF của browser.
- Trích xuất văn bản theo marker `[PAGE n]` ở backend.
- Hiển thị và lưu `sourcePage` khi model nhận diện được nguồn trang.
- Chọn khoảng trang rồi tạo lại mind-map chỉ từ khoảng đó.
- Preview graph trước khi Apply; nhãn node vẫn chỉnh trực tiếp được.
- Chọn Apply vào canvas hiện tại hoặc tạo một canvas mới.
- Apply vào canvas hiện tại vẫn là một thao tác undoable.
- Prompt Gemini được cập nhật để hiểu marker trang.

## File thay đổi

- `apps/server/src/pdf.ts`
- `apps/server/src/types.d.ts`
- `apps/server/src/gemini.ts`
- `apps/web/src/components/AiPanel.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/styles.css`
- `PROJECT_HANDOFF.md`

## Cài đặt

Giải nén `mindcanvas-v2-2-ai-document-workspace.zip` vào thư mục gốc project, chọn thay thế file, rồi chạy:

```bash
npm run typecheck
npm run build
npm test
git add apps/server/src apps/web/src PROJECT_HANDOFF.md V2_2_AI_DOCUMENT_WORKSPACE_VI.md
git commit -m "feat: add AI document workspace preview and page ranges"
git pull --rebase origin main
git push origin main
```

Render phải deploy lại **cả `mindcanvas-api` và `mindcanvas-web`**, vì backend đã thay đổi cách trích xuất PDF. Không cần migration Supabase mới và không cần đổi biến môi trường.

## Lưu ý

- Nếu backend Render chưa được deploy bản mới, PDF vẫn có thể chạy nhưng không có marker trang; nút tạo theo khoảng trang khi đó sẽ gửi toàn bộ text.
- PDF scan chỉ chứa ảnh chưa có OCR; hệ thống vẫn yêu cầu PDF có lớp văn bản.
- Chưa có diff trực quan dạng before/after từng node; preview hiện cho phép chỉnh label và xem graph trước Apply.
