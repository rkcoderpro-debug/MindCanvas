# MindCanvas — nâng cấp Workspace và editor

## Cách thay file

1. Trong thư mục project trên máy, chạy git status.
2. Nếu còn rebase/conflict từ lần trước: xử lý xong trước. Không ghi đè file đang conflict và không force push.
3. Nếu có thay đổi riêng chưa commit: commit hoặc lưu bản sao trước khi pull.
4. Khi working tree sạch: git pull --rebase origin main.
5. Giải nén mindcanvas-workspace-update.zip vào một thư mục riêng. Copy các file bên trong sang project theo đúng đường dẫn. File có sẵn thì thay; file mới thì thêm.
6. Không thay .env, render.yaml, package.json, lockfile hay biến Google OAuth.

Gói không có credentials, node_modules, dist hay dữ liệu người dùng.

## File nguồn đã thay

- apps/web/src/App.tsx
- apps/web/src/components/CanvasBoard.tsx
- apps/web/src/lib/api.ts
- apps/web/src/lib/supabase.ts
- apps/web/src/styles.css
- packages/shared/src/index.ts

## File nguồn mới — bắt buộc thêm cùng lúc

- apps/web/src/components/WorkspaceHome.tsx
- apps/web/src/components/Dialog.tsx
- apps/web/src/components/AiPanel.tsx
- apps/web/src/hooks/useWorkspace.ts
- apps/web/src/lib/board.ts
- apps/web/src/lib/projectStore.ts
- apps/web/src/lib/i18n.tsx

## Kiểm thử và tài liệu

- apps/web/src/App.test.tsx (thay)
- apps/web/src/components/CanvasBoard.test.tsx (mới)
- apps/web/src/hooks/useWorkspace.test.tsx (mới)
- apps/web/src/lib/board.test.ts (mới)
- apps/web/src/lib/projectStore.test.ts (mới)
- PROJECT_HANDOFF.md (thay)
- UPGRADE_WORKSPACE_VI.md (mới)

## Lệnh Git (CMD / PowerShell)

Chạy từ thư mục có package.json gốc, sau khi copy file:

```bash
npm run typecheck
npm run build
npm test
git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/components/CanvasBoard.tsx apps/web/src/components/WorkspaceHome.tsx apps/web/src/components/Dialog.tsx apps/web/src/components/AiPanel.tsx apps/web/src/hooks/useWorkspace.ts apps/web/src/lib/api.ts apps/web/src/lib/supabase.ts apps/web/src/lib/board.ts apps/web/src/lib/projectStore.ts apps/web/src/lib/i18n.tsx packages/shared/src/index.ts apps/web/src/App.test.tsx apps/web/src/components/CanvasBoard.test.tsx apps/web/src/hooks/useWorkspace.test.tsx apps/web/src/lib/board.test.ts apps/web/src/lib/projectStore.test.ts PROJECT_HANDOFF.md UPGRADE_WORKSPACE_VI.md
git diff --cached --stat
git commit -m "feat: workspace dashboard and bilingual inline canvas editor"
git pull --rebase origin main
git push origin main
```

Nếu pull báo conflict, dừng lại; không git add . hoặc chọn toàn bộ ours/theirs mù quáng. Sửa đúng nội dung từng file rồi git add đường-dẫn-file và git rebase --continue. Không dùng git push --force.

Render frontend Static Site sẽ build commit mới nếu đã bật Auto Deploy. Nếu chưa: chọn Manual Deploy → Deploy latest commit trong service có URL https://mindcanvas-wp23.onrender.com.

Giữ nguyên:

- Frontend: https://mindcanvas-wp23.onrender.com
- VITE_API_BASE_URL: https://mindcanvas-api-ok4w.onrender.com
- Backend WEB_ORIGIN: https://mindcanvas-wp23.onrender.com
- Supabase URL/key và Google OAuth đang chạy được.

Không cần SQL mới. Các bảng/policy của 0001_mindcanvas.sql phải đã tồn tại như bản cũ.

## Checklist sau deploy

1. Vào website: trang Workspace hiển thị danh sách project, không tự tạo file trắng.
2. Đăng nhập Google: tên/avatar đúng; refresh vẫn đúng tài khoản.
3. Bấm Project mới: form xuất hiện trong web. Nhập tên → Tạo.
4. Chọn T, bấm canvas, nhập chữ; click ra ngoài để hoàn tất. Nhấp đúp để sửa; Ctrl/⌘+Enter hoàn tất; Escape hủy.
5. Chọn V để kéo chữ. Kéo góc phải dưới để resize. Sửa X/Y/màu/cỡ chữ tại bảng thuộc tính.
6. Vẽ P qua vùng có chữ: chỉ tạo nét vẽ, không chọn chữ. Chọn V rồi kéo riêng nét đó.
7. Thêm node bằng +, nối bằng C; kéo node kiểm tra đường nối bám theo. Duplicate/Delete/Undo/Redo.
8. Bấm Workspace ngay sau khi chỉnh: file vẫn có nội dung mới; mở lại và refresh.
9. Chọn Tiếng Việt/English: toàn bộ nhãn đổi, nội dung ghi chú giữ nguyên; refresh giữ ngôn ngữ.
10. Tải file về máy; Workspace → Nhập file để mở bản sao độc lập.
11. Tắt mạng, chỉnh project đang mở; bật lại mạng để retry. Lỗi lưu phải hiển thị, không báo đã lưu cloud sai.
12. Thử PDF nhỏ có text: đăng nhập → preview → sửa nhãn → Apply → Undo.

## Giới hạn

Đã kiểm tra bằng build/typecheck và 27 test jsdom/unit. Chưa kiểm thử OAuth/cloud/AI trực tiếp trên tài khoản của bạn. Đây là bản nâng cấp V1, không phải bản sao toàn bộ Figma: chưa có chọn nhiều phần tử, xoay, layer ordering, cộng tác realtime hay xử lý xung đột nhiều thiết bị.

Thay file là cập nhật toàn bộ file, không phải merge tự động. Nếu bạn đã tự sửa thêm những file này trên GitHub, dùng diff để giữ thay đổi riêng trước khi thay.
