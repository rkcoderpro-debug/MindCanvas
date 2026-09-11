# MindCanvas — Nâng cấp editor và Workspace (11/09/2026)

Gói này tiếp tục trên bản workspace + Gemini + layout/Undo đang có. Giữ project hiện tại; không tạo repository mới. Không sửa Gemini API key, backend AI hay OAuth.

## 1. Những gì đã làm

| Chức năng | Cách dùng |
| --- | --- |
| Chọn nhiều | Công cụ Chọn (V): kéo khung trên vùng trống, hoặc Shift+bấm để thêm/bỏ phần tử. Ctrl/Cmd+A chọn tất cả. |
| Di chuyển nhiều | Kéo một phần tử đã chọn để kéo cả tập. Thả chuột mới tạo một bước Undo. |
| Sao chép/dán | Ctrl/Cmd+C rồi Ctrl/Cmd+V, hoặc nút trong bảng thuộc tính. Clipboard chỉ trong phiên editor của project hiện tại, không phải clipboard hệ điều hành. |
| Nhân đôi/xóa | Ctrl/Cmd+D và Delete/Backspace áp dụng cả tập đã chọn. Connector nội bộ của các node được nhân đôi cùng chúng. |
| Nhóm | Ctrl/Cmd+G hoặc Gộp nhóm; Shift+Ctrl/Cmd+G hoặc Tách nhóm. Bấm một thành viên sẽ chọn nhóm; nhóm di chuyển cùng nhau. Nhóm phẳng, không lồng nhau. |
| Thứ tự lớp | Bảng thuộc tính: Đưa lên trên cùng / Đưa xuống dưới cùng / Lên một lớp / Xuống một lớp. Áp dụng chung cho chữ, hình, nét vẽ, node, đường nối. Danh sách phần tử ở bên phải hiển thị lớp trên cùng trước. |
| Tạo nhánh | Chọn đúng một node: Tab thêm con, Enter thêm cùng cấp. Nhãn sửa ngay trên canvas; Escape hủy node mới, Ctrl/Cmd+Enter hoặc bấm ra ngoài để hoàn tất. |
| Sửa nhãn | Nhấp đúp hoặc Shift+Enter. Enter trên node nay tạo nhánh cùng cấp. |
| Đổi cha | Giữ Alt và kéo một node lên node cha mới. Đích hợp lệ có viền xanh. Không cho tạo chu trình. Không cần Alt để kéo vị trí thông thường. |
| Thu gọn | Bấm +/- ở cạnh node có nhánh hoặc dùng bảng thuộc tính. |
| Điều hướng | Vừa màn hình (Shift+1), Đến phần đã chọn (Shift+2), minimap có thể bật/tắt và bấm để đi tới vị trí. Space+kéo / công cụ H / nút chuột giữa để pan. |
| Quản lý file | Nút sao để yêu thích; nút … trên thẻ project: đổi tên, chuyển folder, nhân đôi, đưa vào thùng rác. Sidebar có Yêu thích và Thùng rác. |
| Khôi phục | Thùng rác → … → Khôi phục. Không xóa vĩnh viễn trong bản này. |

File cũ không có lịch sử thứ tự tạo từng phần tử: giữ cách xếp lớp cũ để không bất ngờ thay đổi thiết kế. Các phần tử mới xuất hiện trên cùng; dùng nút thứ tự lớp để sửa file cũ. Thứ tự lớp và nhóm được autosave/export/import trong dữ liệu canvas. Autosave góc nhìn vẫn không làm đầy Undo.

## 2. Chạy SQL trên Supabase TRƯỚC khi deploy frontend

1. Mở Supabase Dashboard, chọn đúng project đang dùng cho MindCanvas.
2. Mở SQL Editor, tạo query mới.
3. Mở file `supabase/migrations/0002_project_management.sql` trong gói và chép toàn bộ nội dung vào query.
4. Bấm Run. Migration chỉ thêm hai cột `is_favorite`, `deleted_at` và một index; không xóa bảng/dữ liệu và không thay RLS.
5. Kiểm tra bảng notes đã có hai cột này. Không chạy lại toàn bộ migration 0001.

SQL chính xác:

```sql
alter table public.notes add column if not exists is_favorite boolean not null default false;
alter table public.notes add column if not exists deleted_at timestamptz;
create index if not exists notes_owner_deleted_idx on public.notes (user_id, deleted_at);
```

Nếu chưa chạy SQL, frontend mới không đọc được danh sách cloud đầy đủ và có thể báo thiếu cột. Bản local/guest không cần Supabase. Migration chưa được chạy thay bạn vì không có truy cập tài khoản Supabase trong phiên làm việc này.

## 3. Thay file và push GitHub

Lưu/commit thay đổi riêng của bạn trước nếu có. Giải nén ZIP vào thư mục chứa package.json của project, giữ nguyên đường dẫn và thay file trùng tên. Không thay file env.

Danh sách 19 file trong gói:

| File | Trạng thái |
| --- | --- |
| packages/shared/src/index.ts | Sửa |
| apps/web/src/lib/editorCommands.ts | Mới |
| apps/web/src/lib/editorCommands.test.ts | Mới |
| apps/web/src/lib/board.ts | Sửa |
| apps/web/src/lib/i18n.tsx | Sửa |
| apps/web/src/lib/projectStore.ts | Sửa |
| apps/web/src/lib/projectManagement.test.ts | Mới |
| apps/web/src/hooks/useWorkspace.ts | Sửa |
| apps/web/src/components/LayerStack.tsx | Mới |
| apps/web/src/components/CanvasNavigator.tsx | Mới |
| apps/web/src/components/CanvasBoard.tsx | Sửa |
| apps/web/src/components/CanvasBoard.test.tsx | Sửa |
| apps/web/src/components/WorkspaceHome.tsx | Sửa |
| apps/web/src/App.tsx | Sửa |
| apps/web/src/App.test.tsx | Sửa |
| apps/web/src/styles.css | Sửa |
| supabase/migrations/0002_project_management.sql | Mới |
| PROJECT_HANDOFF.md | Sửa |
| EDITOR_WORKSPACE_UPGRADE_VI.md | Mới |

Chạy trong thư mục project:

```bash
npm run typecheck
npm run build
npm test
git add apps/web/src packages/shared/src/index.ts supabase/migrations/0002_project_management.sql PROJECT_HANDOFF.md EDITOR_WORKSPACE_UPGRADE_VI.md
git diff --cached --stat
git commit -m "feat: multi-selection layers groups and project management"
git pull --rebase origin main
git push origin main
```

Nếu pull báo conflict: dừng và gửi thông báo, không force push. Chờ frontend Render deploy commit mới, sau đó lưu công việc hiện tại và tải lại website. Không cần thêm biến Render. Nếu Auto Deploy tắt, deploy commit mới trên service frontend hiện có. Backend có thể được Render build lại từ cùng repo, nhưng không có thay đổi logic backend trong gói này.

## 4. Kiểm tra sau khi deploy

1. Mở project cũ, kiểm tra nội dung còn nguyên. Vẽ nét mới qua node: nét phải ở lớp trên. Chọn nét → Đưa xuống dưới cùng để đưa xuống dưới node.
2. Shift+bấm hai hình, kéo cùng nhau, Ctrl+Z một lần: cả hai về vị trí cũ.
3. Gộp nhóm, bỏ chọn, bấm lại thành viên rồi kéo: cả nhóm đi theo. Tải lại và kiểm tra nhóm/lớp còn lưu.
4. Ctrl+C/V và Ctrl+D để kiểm tra bản sao độc lập; xóa bản sao không mất bản gốc.
5. Chọn một node → Tab tạo con; Enter tạo cùng cấp; Escape hủy node đang nhập. Nhấp đúp sửa nhãn.
6. Alt+kéo một node sang cha khác, kiểm tra đường nối và Undo. Thử kéo cha vào con: không được tạo chu trình.
7. Thu gọn nhánh, Vừa màn hình và bấm minimap. Pan/zoom nhiều lần rồi Undo: chỉ hoàn tác nội dung.
8. Về Workspace: yêu thích, đổi tên, chuyển folder, nhân đôi project. Nhân đôi không mở/ghi đè project gốc.
9. Đưa một project vào thùng rác → biến mất khỏi Workspace/folder/yêu thích → vào Thùng rác khôi phục. Kiểm tra nội dung còn nguyên.
10. Với tài khoản cloud: tải lại website và thử mở trên trình duyệt khác cùng tài khoản để kiểm tra dữ liệu thực. Không dùng dữ liệu quan trọng duy nhất để thử.

## 5. Kiểm chứng và giới hạn

- Đã chạy typecheck, build frontend/backend và 52 test frontend, gồm kiểm tra pure commands, jsdom UI và cloud calls giả lập. Chưa kiểm tra browser thật, Gemini thật hoặc Supabase/Render thật cho gói này.
- Cloud metadata chỉ cập nhật khi đã flush thành công và có kết nối. Lỗi được hiển thị; không báo lưu thành công khi request thất bại. User filter và RLS giữ nguyên.
- Nhóm là nhóm phẳng; chưa có resize/xoay cả nhóm hoặc nhóm lồng nhau. Có thể tách nhóm rồi sửa từng thành viên.
- Clipboard không dùng clipboard OS và được xóa khi đóng editor/chuyển project. Menu thẻ project dùng nút bàn phím được; chưa có menu chuột phải canvas.
- Nhân đôi project sao chép canvas, nhóm, lớp và viewport; không nhân đôi PDF blob hoặc bản ghi documents riêng. Tham chiếu trang trong node vẫn giữ.
- Khôi phục thùng rác là metadata, không phải Undo canvas. Không có xóa vĩnh viễn hay version history cloud.
- Minimap có thể bật/tắt; sơ đồ cực lớn vẫn cần pan/zoom. Liên kết chéo trong mind map được giữ và có thể giao nhau.
- Việc chỉnh đồng thời nội dung trên nhiều thiết bị vẫn last-write-wins. Không có cộng tác thời gian thực.

## Kiến trúc để sửa tiếp

`editorCommands.ts` là nơi thêm thao tác tập phần tử/lớp/nhóm. `LayerStack.tsx` chỉ sắp xếp render. `CanvasNavigator.tsx` chỉ cập nhật viewport. `CanvasBoard.tsx` quản lý gesture và inline editor. `projectStore.ts` quản lý cloud/local, `useWorkspace.ts` giữ quy trình flush/history. `WorkspaceHome.tsx` quản lý menu/form thẻ project. Dữ liệu bổ sung đều optional trong BoardState để mở được file cũ.
