# MindCanvas V2.1 — Editor Pro

Đây là đợt đầu của V2. V2.1 tập trung vào thao tác canvas giống Figma hơn nhưng vẫn giữ dữ liệu project V1 tương thích.

## Tính năng

- Resize nhiều element cùng lúc bằng handle góc.
- Xoay element hoặc nhóm bằng handle phía trên vùng chọn.
- Căn trái, giữa, phải, trên, giữa dọc, dưới.
- Chia đều theo chiều ngang/dọc.
- Snap theo lưới bằng nút nam châm trên toolbar; mặc định tắt để giữ hành vi cũ.
- Khóa/mở khóa element.
- Ẩn/hiện element từ vùng selection và layer list.
- Element có `rotation`, `locked`, `hidden` tùy chọn; file cũ không có các trường này vẫn mở bình thường.
- Layer list hiển thị trạng thái khóa/ẩn.

## File thay đổi

- `packages/shared/src/index.ts`
- `apps/web/src/lib/board.ts`
- `apps/web/src/lib/editorCommands.ts`
- `apps/web/src/lib/editorCommands.test.ts`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/lib/i18n.tsx`
- `PROJECT_HANDOFF.md`

Không thay đổi backend, Gemini, OAuth, Supabase migration hoặc biến môi trường.

## Cài đặt và deploy

Giải nén `mindcanvas-v2-1-editor-pro.zip` vào thư mục gốc MindCanvas, chọn thay thế file, rồi chạy:

```bash
npm run typecheck
npm run build
npm test
git add packages/shared/src/index.ts apps/web/src PROJECT_HANDOFF.md V2_1_EDITOR_PRO_VI.md
git commit -m "feat: add editor pro transforms and layer controls"
git pull --rebase origin main
git push origin main
```

Sau khi push, chờ Render deploy frontend. Không cần chạy SQL trên Supabase cho bản V2.1.

## Giới hạn hiện tại

- Resize giữ tỉ lệ tự do; chưa có phím khóa tỉ lệ.
- Selection bounds là hình chữ nhật bao quanh; xoay chưa có snapping theo góc.
- Chưa có nhóm lồng nhau và chưa có connector bezier chỉnh tay.
- Khóa/ẩn được lưu trong board nhưng chưa có bulk action trong Folder Manager.
