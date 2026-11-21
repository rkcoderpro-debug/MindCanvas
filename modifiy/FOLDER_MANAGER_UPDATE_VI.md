# MindCanvas — cập nhật quản lý folder

## Đã sửa lỗi

Project mới được tạo khi đang mở một folder sẽ tự nhận folder đó. Trước đây `create()` luôn đặt `folderId` là `null`, nên project chỉ xuất hiện ở Workspace và Recent.

## Giao diện mới

- Mỗi folder trong sidebar có dropdown hiển thị tối đa 5 canvas gần nhất.
- Bấm tên folder để xem toàn bộ canvas trong folder.
- Nút **Quản lý thư mục** mở trang quản lý file riêng.
- Trang này hỗ trợ chọn file, mở bằng double-click, copy, paste, duplicate, move, rename và đưa file vào thùng rác.
- Kéo project ở Workspace rồi thả vào folder vẫn hoạt động.

## File thay đổi

- `apps/web/src/App.tsx`
- `apps/web/src/components/FolderManager.tsx` (mới)
- `apps/web/src/components/WorkspaceHome.tsx`
- `apps/web/src/hooks/useWorkspace.ts`
- `apps/web/src/lib/projectStore.ts`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/styles.css`
- `PROJECT_HANDOFF.md`

Không cần migration Supabase mới và không thay đổi Gemini/API/OAuth.

## Cài đặt

Giải nén ZIP vào thư mục gốc project, chọn thay thế file, sau đó chạy:

```bash
npm run typecheck
npm run build
npm test
git add apps/web/src PROJECT_HANDOFF.md FOLDER_MANAGER_UPDATE_VI.md
git commit -m "feat: add folder manager and folder project creation"
git pull --rebase origin main
git push origin main
```
