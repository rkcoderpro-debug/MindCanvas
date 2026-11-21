# MindCanvas — Bố cục mind map và Undo

Áp dụng lên bản workspace editor đã cập nhật. Chép tất cả file trong ZIP theo đường dẫn, giữ các file khác. Không sửa backend Gemini, key, Supabase hoặc SQL.

## Đã sửa

- Node AI được bố trí theo cây cha–con, mỗi nhánh có khoảng trống riêng, cha ở bên trái con. Ưu tiên parentId khi Apply, bổ sung connector cha–con nếu thiếu. Không thay thế nội dung người dùng bằng bản tóm tắt khác.
- Node rộng 260px, chiều cao ước lượng theo nhãn và dòng tham chiếu trang thay vì cố định 76px. Ước lượng bảo thủ để giảm cắt chữ, không phải đo font từng pixel.
- Nút trên toolbar, cạnh nút +, có tooltip Sắp xếp mind map / Arrange mind map. Áp dụng cho toàn bộ mind map trong project đã mở; đổi vị trí/kích thước node, giữ ID/nhãn/cạnh. Một lần Undo khôi phục bố cục trước. Nếu có hình/chữ/nét vẽ, sơ đồ được đặt bên phải chúng để tránh chồng lên nội dung đó.
- Pan/zoom vẫn lưu viewport, nhưng không vào Undo và không xóa Redo. Undo/Redo nội dung giữ góc nhìn hiện tại. Chỉ thay góc nhìn không thay thời gian chỉnh nội dung trong danh sách project.
- Chuyển góc nhìn lưu cloud sau 2 giây yên; chỉnh nội dung giữ debounce 750ms. Bản nháp local vẫn lưu ngay, khi về Workspace/chuyển project vẫn flush. Autosave và Undo là hai cơ chế độc lập.
- Kéo một element bằng chuột tiếp tục tính một bước khi thả chuột. Không gộp các lần chỉnh thuộc tính hoặc nhấn phím mũi tên liên tiếp trong bản này.

## File thay đổi

1. apps/web/src/hooks/useWorkspace.ts
2. apps/web/src/hooks/useWorkspace.test.tsx
3. apps/web/src/lib/board.ts
4. apps/web/src/lib/mindMapLayout.ts (mới)
5. apps/web/src/lib/mindMapLayout.test.ts (mới)
6. apps/web/src/lib/i18n.tsx
7. apps/web/src/components/CanvasBoard.tsx
8. apps/web/src/components/CanvasBoard.test.tsx
9. LAYOUT_UNDO_FIX_VI.md

## Chạy và deploy

```bash
npm run typecheck
npm run build
npm test
git add apps/web/src/hooks/useWorkspace.ts apps/web/src/hooks/useWorkspace.test.tsx apps/web/src/lib/board.ts apps/web/src/lib/mindMapLayout.ts apps/web/src/lib/mindMapLayout.test.ts apps/web/src/lib/i18n.tsx apps/web/src/components/CanvasBoard.tsx apps/web/src/components/CanvasBoard.test.tsx LAYOUT_UNDO_FIX_VI.md
git commit -m "fix: hierarchical mind map layout and navigation-free undo"
git pull --rebase origin main
git push origin main
```

Dừng nếu có conflict. Chờ frontend Render deploy bản mới. Lưu công việc hiện tại trước khi tải lại trang. Mở project cũ → bấm Sắp xếp mind map (không cần gọi Gemini lại). Thử tạo chữ, pan/zoom nhiều lần rồi Ctrl+Z: chữ bị hoàn tác ngay, góc nhìn giữ nguyên. Ctrl+Shift+Z/Ctrl+Y để làm lại. Mở lại project để kiểm tra viewport được lưu.

## Giới hạn

Liên kết chéo và chu trình trong file cũ được giữ, nên vẫn có thể có đường nối giao nhau; thuật toán dùng cây khung để bố trí. Không phải bộ tối ưu đồ thị tổng quát. Nội dung AI trùng/không chính xác không được tự xóa. Node người dùng chỉnh nhãn dài sau khi bố trí có thể cần bấm sắp xếp lại hoặc tự resize. Các sơ đồ rất lớn có thể cần pan/zoom để xem. Lịch sử Undo chỉ ở trong phiên mở project, không phải version history trên cloud. Thay đổi không giải quyết xung đột nhiều thiết bị.

Typecheck/build và test chạy local; test UI qua jsdom, chưa kiểm tra trực tiếp trên website Render. Kiểm thử mới bao gồm pan/zoom không thêm Undo, giữ Redo, lưu viewport, quan hệ cha–con, không chồng node trong cây, nhãn dài, chu trình và nút sắp xếp.
