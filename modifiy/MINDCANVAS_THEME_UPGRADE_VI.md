# MindCanvas — nâng cấp giao diện

Đợt này hoàn thiện quản lý folder và giữ lại hai chế độ giao diện:

- **Sáng**: giao diện mặc định hiện tại.
- **Tối**: nền tối, surface và canvas tương phản thấp hơn để làm việc buổi tối.
- Giao diện dùng accent tím ấm để dễ nhìn hơn màu xanh lạnh trước đó.

## Quản lý folder

- Bấm dấu `…` cạnh folder để đổi tên hoặc xóa folder.
- Kéo project trên Workspace rồi thả vào folder.
- Kéo project vào nút Workspace để đưa project ra khỏi folder.
- Xóa folder chỉ bỏ folder; project được chuyển về Workspace, không bị xóa.

## File thay đổi

- `apps/web/src/App.tsx`
- `apps/web/src/lib/i18n.tsx`
- `apps/web/src/styles.css`

Không cần migration Supabase và không cần đổi biến môi trường Gemini.

## Cách cài vào project gốc

1. Tải `mindcanvas-theme-upgrade.zip`.
2. Giải nén vào thư mục gốc MindCanvas và chọn thay thế file trùng tên.
3. Chạy:

```bash
npm run typecheck
npm run build
npm test
```

4. Commit và push:

```bash
git add apps/web/src/App.tsx apps/web/src/lib/i18n.tsx apps/web/src/styles.css
git commit -m "feat: complete folder management and dark theme"
git pull --rebase origin main
git push origin main
```

Render sẽ tự build lại frontend sau khi GitHub nhận commit.

Lựa chọn theme và ngôn ngữ được lưu trong `localStorage` của trình duyệt. Dark theme đã phủ toàn bộ sidebar, workspace, project card, dialog, inspector, toolbar và các trạng thái trống; nội dung canvas vẫn giữ màu element để không làm sai dữ liệu.
