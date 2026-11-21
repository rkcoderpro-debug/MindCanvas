# MindCanvas V3.3.1 — Expanded Themes & Motion

V3.3.1 mở rộng V3.3 thành 10 theme và bổ sung animation cho thao tác giao diện. Đây là cập nhật frontend-only, không thay đổi dữ liệu project, Supabase, OAuth, Gemini hoặc backend.

## Danh sách theme

### Theme sáng

| Theme | Màu chính |
|---|---|
| Sáng Aurora | Tím + hồng |
| Gió biển Ocean | Xanh biển + cyan |
| Sương bạc hà | Teal + xanh lá |
| Hoàng hôn Coral | Cam san hô + hồng |
| Berry Pop | Mâm xôi + tím |

### Theme tối

| Theme | Màu chính |
|---|---|
| Tối Midnight | Mận đậm + lilac |
| Đêm Cobalt | Navy + xanh điện |
| Cyber Teal | Cyan tối + aqua |
| Rừng Emerald | Xanh rừng + bạc hà |
| Đá Nordic | Graphite + xanh tím |

Các theme cũ giữ nguyên ID nên lựa chọn đang lưu của người dùng vẫn hoạt động. Năm theme mới cũng có màu riêng cho workspace, canvas, toolbar, inspector, flashcard, trạng thái cloud, lỗi/conflict và element mới.

## Animation mới

- Nút có phản hồi hover/nhấn và icon chuyển động nhẹ.
- Project card xuất hiện theo nhịp ngắn; hover nâng card lên nhẹ.
- Workspace, editor, folder manager và flashcard có chuyển cảnh khi mở.
- Dialog, nền dialog và menu project có hiệu ứng mở.
- Dấu chọn theme có hiệu ứng pop.
- Trạng thái Saving có nhịp nhẹ; lỗi xuất hiện dạng slide ngắn.
- Mặt trả lời flashcard có hiệu ứng reveal.
- Menu mobile và bảng Properties dạng bottom sheet trượt vào.

Không có nền động liên tục và Liquid Glass không được đưa trở lại. Khi hệ điều hành bật **Reduce motion**, website gần như tắt toàn bộ animation và transition.

## File thay đổi so với V3.3

```text
apps/web/index.html
apps/web/src/App.tsx
apps/web/src/App.test.tsx
apps/web/src/components/ThemePicker.tsx
apps/web/src/lib/i18n.tsx
apps/web/src/lib/theme.ts
apps/web/src/lib/theme.test.ts
apps/web/src/styles.css
DEPLOY_V1_VI.md
PROJECT_HANDOFF.md
V3_3_1_EXPANDED_THEMES_MOTION_VI.md
```

## Push GitHub

Chép các file vào đúng đường dẫn trong repository MindCanvas, sau đó chạy tại thư mục có `package.json` gốc:

```bash
git status
git add apps/web/index.html apps/web/src/App.tsx apps/web/src/App.test.tsx \
  apps/web/src/components/ThemePicker.tsx \
  apps/web/src/lib/i18n.tsx apps/web/src/lib/theme.ts apps/web/src/lib/theme.test.ts \
  apps/web/src/styles.css DEPLOY_V1_VI.md PROJECT_HANDOFF.md \
  V3_3_1_EXPANDED_THEMES_MOTION_VI.md
git commit -m "feat: expand themes and add interface motion"
git push origin main
```

## Deploy Render

Chỉ deploy service `mindcanvas-web`:

1. Nếu Auto Deploy đang bật, chờ Render build commit mới.
2. Nếu Auto Deploy đang tắt: Render → `mindcanvas-web` → **Manual Deploy** → **Deploy latest commit**.
3. Không đổi environment variables và không deploy `mindcanvas-api` chỉ vì cập nhật này.
4. Sau khi Live, hard refresh website và vào **Cài đặt → Giao diện** để thử đủ 10 theme.

## Kiểm tra local

```bash
npm run typecheck
npm test
npm run build
```

Kiểm tra thêm trên điện thoại: mở menu, đổi theme tối, mở project, mở bảng Properties và kiểm tra thiết lập Reduce motion của hệ điều hành.
