# v5.10.1 — hotfix trợ giúp và chạy guide thủ công

## Thay đổi

- Nút trợ giúp theo trang không còn yêu cầu hoàn thành guide.
- Bấm Chạy hướng dẫn là yêu cầu chạy lại rõ ràng: không chặn bởi trạng thái active/completed/skipped đã lưu.
- Giữ chặn tự phát lại guide đã xem. Tự phát không được tranh phiên với yêu cầu thủ công.
- Không xóa tiến độ đã lưu hoặc dữ liệu tài liệu.

## Nguyên nhân

FeatureGuideManager áp dụng cùng điều kiện once-only cho cả tự phát và chạy thủ công. Trạng thái cũ khác unseen khiến yêu cầu thủ công bị tiêu thụ mà không mở overlay. Chưa có bằng chứng rằng thao tác mở guide tự ghi trạng thái skipped; đường ghi skipped hiện tại đến từ nút đóng/bỏ qua.

## Kiểm chứng

- Regression: 4 guide Workspace, Canvas, Learning Hub, Folder Manager × 3 trạng thái cũ; chạy thủ công, đóng và chạy lại.
- Regression: 4 guide completed không tự phát lại.
- App integration: trợ giúp Workspace, Canvas và Learning Hub hiện khi không có tiến độ guide.
- Toàn bộ npm test đạt (web và server).
- Browser E2E và screenshot chưa kiểm chứng trong lần vá này. Test UI ở đây chạy jsdom, không thay thế browser thật.

## Áp dụng và rollback

Áp dụng trên mã v5.10.1: sao lưu 5 file mã/test có trong ZIP rồi chép đè theo đúng đường dẫn mindcanvas-v1. Chạy npm test, npm run typecheck, npm run build, sau đó khởi động lại dev server nếu đang chạy. Không cần đổi dependency hoặc migration dữ liệu.

Rollback: khôi phục đúng 5 file đã sao lưu rồi build lại. Không cần xóa localStorage hay IndexedDB.

## File trong bản vá

- apps/web/src/components/FeatureGuideManager.tsx
- apps/web/src/components/FeatureGuideManager.test.tsx
- apps/web/src/lib/featureGuides.ts
- apps/web/src/lib/featureGuides.test.ts
- apps/web/src/App.test.tsx
- GUIDE_HELP_HOTFIX_V5.10.1.md
