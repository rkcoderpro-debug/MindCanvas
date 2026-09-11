# MindCanvas V3.3 — Vibrant Themes

V3.3 nâng cấp toàn bộ lớp giao diện theo hệ token thống nhất. Đây là thay đổi frontend-only: không đổi Supabase, Google OAuth, Gemini API, backend hoặc cấu trúc dữ liệu project.

## Năm theme mới

| Theme | Phong cách | Loại nền |
|---|---|---|
| Sáng Aurora | Trắng ngà, tím sống động và điểm nhấn hồng | Sáng |
| Tối Midnight | Mận đậm, tím lilac và hồng sáng | Tối |
| Hoàng hôn Coral | Kem ấm, cam san hô và hồng | Sáng |
| Rừng Emerald | Xanh rừng sâu, bạc hà và vàng | Tối |
| Berry Pop | Hồng dịu, mâm xôi và tím | Sáng |

Liquid Glass đã được loại khỏi lựa chọn và không được đưa trở lại. Theme được lưu trong `localStorage` với khóa `mindcanvas:theme`; nội dung project/canvas không bị đổi khi chuyển theme.

## Những phần đã được đồng bộ màu

- Workspace, sidebar, header, project card và folder manager.
- Editor canvas, dot grid, thanh công cụ, inspector, minimap và các nút zoom.
- Selection, resize/rotation handle, connector và màu mặc định của phần tử mới.
- Dialog, form, PDF/AI preview, flashcards, trạng thái cloud/local, lỗi và conflict.
- Giao diện desktop, tablet và mobile.
- Theme chọn trong Settings bằng thẻ xem trước trực quan; dropdown gọn vẫn có trong sidebar/mobile menu.

Màu của element do người dùng tự chọn vẫn được giữ nguyên trong dữ liệu. Với dữ liệu cũ, màu chữ canvas mặc định sẽ thích nghi theo nền; chữ trong mind-map node tự chọn màu sáng/tối dựa trên màu fill để tránh khó đọc.

## File cần thay thế/thêm mới

```text
apps/web/index.html
apps/web/src/App.tsx
apps/web/src/App.test.tsx
apps/web/src/components/CanvasBoard.tsx
apps/web/src/components/CanvasNavigator.tsx
apps/web/src/components/ThemePicker.tsx
apps/web/src/components/WorkspaceHome.tsx
apps/web/src/lib/color.ts
apps/web/src/lib/color.test.ts
apps/web/src/lib/i18n.tsx
apps/web/src/lib/theme.ts
apps/web/src/lib/theme.test.ts
apps/web/src/styles.css
DEPLOY_V1_VI.md
PROJECT_HANDOFF.md
V3_3_VIBRANT_THEMES_VI.md
```

## Push GitHub và deploy Render

Tại thư mục gốc MindCanvas:

```bash
git status
git add apps/web/index.html apps/web/src/App.tsx apps/web/src/App.test.tsx \
  apps/web/src/components/CanvasBoard.tsx \
  apps/web/src/components/CanvasNavigator.tsx \
  apps/web/src/components/ThemePicker.tsx \
  apps/web/src/components/WorkspaceHome.tsx \
  apps/web/src/lib/color.ts apps/web/src/lib/color.test.ts \
  apps/web/src/lib/i18n.tsx apps/web/src/lib/theme.ts apps/web/src/lib/theme.test.ts \
  apps/web/src/styles.css DEPLOY_V1_VI.md PROJECT_HANDOFF.md V3_3_VIBRANT_THEMES_VI.md
git commit -m "feat: add MindCanvas V3.3 vibrant themes"
git push origin main
```

Nếu `mindcanvas-web` đang bật Auto Deploy, Render sẽ tự build sau khi GitHub nhận commit. Nếu không, mở Render → `mindcanvas-web` → **Manual Deploy** → **Deploy latest commit**. Không cần redeploy `mindcanvas-api` cho V3.3.

Sau khi Render báo Live, mở website bằng tab ẩn danh hoặc hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`), vào **Cài đặt → Giao diện**, thử đủ năm theme và tải lại trang để kiểm tra theme được nhớ.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

Kết quả local của gói bàn giao: 69 test frontend và 13 test backend đều pass; production build của frontend/backend pass. Chưa kiểm thử trực tiếp website Render hoặc thiết bị vật lý bằng credential thật trong workspace này.
