# MindCanvas V2.3 — Version History & Recovery

V2.3 giải quyết việc quay lại trạng thái cũ mà không phải bấm Undo qua nhiều lần autosave hoặc thao tác di chuyển canvas.

## Đã triển khai

- Nút `Lịch sử phiên bản` trong top bar của editor.
- `Lưu mốc phiên bản` để tạo một checkpoint ổn định theo chủ ý của người dùng.
- Khôi phục checkpoint với một thao tác undo được.
- Trước khi khôi phục, trạng thái hiện tại được lưu thành checkpoint `Before restore` để giảm rủi ro mất nội dung.
- Di chuyển canvas, zoom và autosave không tạo thêm mốc phiên bản.
- Guest/offline dùng localStorage theo từng tài khoản/project.
- Tài khoản đăng nhập dùng bảng Supabase `note_versions` nếu migration đã được chạy; lỗi mạng hoặc thiếu migration tự rơi về bản local.

## File thay đổi

- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/hooks/useWorkspace.ts`
- `apps/web/src/components/VersionHistory.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/lib/projectStore.test.ts`
- `apps/web/src/hooks/useWorkspace.test.tsx`
- `supabase/migrations/0003_note_versions.sql`
- `PROJECT_HANDOFF.md`

## Cấu hình Supabase

Trong Supabase Dashboard → SQL Editor, chạy toàn bộ file:

```text
supabase/migrations/0003_note_versions.sql
```

Migration này tạo bảng version thuộc user, bật RLS và chỉ cho phép đọc/ghi version của note thuộc cùng user. Không có credential nào nằm trong source.

## Chạy và deploy

```bash
npm run typecheck
npm run build
npm test

git add apps/web/src supabase/migrations/0003_note_versions.sql PROJECT_HANDOFF.md V2_3_VERSION_HISTORY_VI.md
git commit -m "feat: add project version history and recovery"
git pull --rebase origin main
git push origin main
```

Sau khi push, Render chỉ cần deploy lại `mindcanvas-web`. Backend, Gemini, OAuth và các biến môi trường không đổi.

## Giới hạn

- Mỗi project giữ tối đa 30 checkpoint trong UI/local cache.
- Bản cloud cần chạy migration mới. Nếu chưa chạy, checkpoint vẫn có thể được lưu local nhưng không đồng bộ lên Supabase.
- Đây là checkpoint thủ công, chưa phải lịch sử tự động theo từng phút và chưa có giao diện so sánh từng element trước/sau.
