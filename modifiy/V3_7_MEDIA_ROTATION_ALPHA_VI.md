# MindCanvas V3.7.1 — Media, Figma resize và opacity

## Đã cập nhật

- Chèn image/video/audio từ file, kéo-thả file vào canvas, dán screenshot từ clipboard và ghi âm bằng micro.
- Nhúng trang web, YouTube và URL video HTTPS bằng iframe/video; URL được kiểm tra trước khi lưu.
- Media/embed là element thật trong board: chọn, di chuyển, resize, xoay, duplicate, copy/paste, ẩn/khóa và đổi thứ tự layer.
- Ảnh hỗ trợ crop theo phần trăm; audio/video hỗ trợ giới hạn đoạn phát bằng `trimStart`/`trimEnd` mà không sửa file gốc.
- Mọi node, text, shape, drawing, connector, media và embed đều có opacity được lưu cùng board và xuất ra SVG/PNG.
- Thay handle resize đơn thành 8 handle Figma: 4 góc giữ hai trục, 4 cạnh chỉ đổi một trục và giữ cạnh đối diện.
- Board cũ không có `media`/`embeds` vẫn mở được; parser tự bổ sung mảng rỗng. Không cần migration database.

## Giới hạn có chủ ý

- Media lưu dưới dạng data URL trong board để project/export tự chứa nội dung; mỗi file media tối đa 12 MB. File project import tối đa 40 MB.
- Video/audio/embed khi xuất SVG/PNG được biểu diễn bằng thẻ đại diện vì SVG/PNG không thể chứa trình phát tương tác; file project vẫn giữ URL/file data để mở lại trong editor.
- Một website có thể gửi `X-Frame-Options` hoặc CSP và chặn iframe. MindCanvas không vượt qua chính sách của website đó.
- Ghi âm cần HTTPS hoặc localhost, quyền microphone và `MediaRecorder` của trình duyệt.

## Kiểm tra local

```bash
npm install
npm run typecheck
npm test
npm run build
```

Bản hiện tại đã kiểm tra typecheck, production build, 94 frontend tests và 22 backend tests. Gemini thật, Supabase thật, Render và thiết bị vật lý vẫn cần kiểm tra sau deploy bằng credential của bạn.

## File chính

- `packages/shared/src/index.ts`: schema `CanvasMedia`, `CanvasEmbed`, crop/trim/rotation/opacity.
- `apps/web/src/lib/board.ts`: validation, bounds và SVG/PNG export.
- `apps/web/src/lib/editorCommands.ts`: layer, duplicate, resize 8 hướng, rotation và group.
- `apps/web/src/components/CanvasBoard.tsx`: UI canvas, chèn media/embed, crop/trim/recording.
- `apps/web/src/components/ElementsPanel.tsx`: layer list cho media/embed.
- `apps/web/src/lib/canvasClipboard.ts`: copy/paste element và đọc ảnh clipboard.
- `apps/web/src/lib/supabase.ts`: blank board cloud tương thích schema mới.
