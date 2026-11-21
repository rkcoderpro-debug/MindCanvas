# MindCanvas V3.0 — Production Core

## Đã triển khai

- Xuất canvas thành SVG giữ layer order, hidden element, rotation, connector và nhãn connector.
- Xuất canvas thành PNG trong trình duyệt; JSON `.mindcanvas.json` vẫn dùng để mở/chỉnh sửa lại.
- Connector hiển thị nhãn trên canvas và có thể chỉnh sửa trong inspector.
- Autosave cloud có kiểm tra `revision`: nếu tab/thiết bị khác đã lưu trước, bản lưu cũ bị từ chối thay vì âm thầm ghi đè.
- Dự án chưa có revision hoặc Supabase chưa chạy migration vẫn dùng đường lưu legacy tương thích.
- Badge giao diện đổi thành `V3.0`.

## File thay đổi

- `apps/web/src/App.tsx`
- `apps/web/src/components/CanvasBoard.tsx`
- `apps/web/src/lib/board.ts`
- `apps/web/src/lib/board.test.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/hooks/useWorkspace.ts`
- `apps/web/src/hooks/useWorkspace.test.tsx`
- `supabase/migrations/0004_note_revision_lock.sql`
- `PROJECT_HANDOFF.md`

## Supabase

Trong SQL Editor, chạy:

```text
supabase/migrations/0004_note_revision_lock.sql
```

Migration chỉ thêm cột `notes.revision` và index, không xóa dữ liệu. Sau khi chạy, các project cloud mới được kiểm tra revision khi autosave.

## Deploy

```bash
npm run typecheck
npm run build
npm test

git add apps/web/src supabase/migrations/0004_note_revision_lock.sql PROJECT_HANDOFF.md V3_0_PRODUCTION_CORE_VI.md
git commit -m "feat: harden canvas export and cloud revisions"
git pull --rebase origin main
git push origin main
```

V3.0 có thay đổi frontend và logic lưu cloud trong frontend, không đổi server API. Render cần build lại `mindcanvas-web`; `mindcanvas-api` không cần redeploy vì V3.0 không sửa backend.

## Giới hạn

- Conflict hiện được báo để người dùng giữ bản local/export hoặc tải lại bản cloud; giao diện merge từng element sẽ làm ở đợt sau.
- PNG phụ thuộc khả năng render SVG của trình duyệt; SVG là định dạng khuyến nghị khi cần chất lượng vector.
