# MindCanvas v5.9.0

## Added

- Thư viện tài liệu cục bộ trong Quản lý thư mục: tải nhiều file, tìm kiếm, lọc PDF/DOCX/PPTX/XLSX, xem, tải xuống và xóa.
- Kho tài liệu IndexedDB có owner isolation, migration từ bản guest localStorage cũ và đường lui khi IndexedDB/quota không khả dụng.
- Canvas picker dùng chung thư viện; embed mới lưu `documentId`/`revisionId` thay vì nhân bản bytes vào từng project.
- Learning Hub → Công cụ với PDF editor dùng chung engine annotation và DOCX editor cơ bản.
- PDF editor có pen/highlight/eraser, nét realtime, undo/redo, Ctrl-wheel zoom quanh con trỏ, nút +/- zoom quanh tâm viewport và xuất bản PDF mới.
- DOCX editor có import semantic HTML, chỉnh đoạn/headings, bold/italic/underline, highlight, cỡ chữ, danh sách bullet, draft cục bộ và xuất OOXML DOCX hợp lệ thành bản sao.
- Viewer đọc DOCX, PPTX và XLSX trong thư viện/canvas với metadata loại tài liệu rõ ràng.
- Guide PDF dùng target/action theo loại file, viewer-ready event sau khi PDF.js load thành công, guide session/viewer session ID và cleanup khi chuyển/đóng guide.
- Guide Công cụ tài liệu và route mở đúng Learning Hub; spotlight sáng toàn vùng mục tiêu và con trỏ animation nằm ngoài vùng được chỉ.

## Changed

- Version web, service-worker cache và prompt hỗ trợ AI đều là `5.9.0`.
- Embed tài liệu cũ dùng data URL vẫn đọc được; embed mới tham chiếu thư viện và hiển thị cảnh báo khi tài liệu đã bị xóa khỏi thiết bị.

## Compatibility limits

- DOCX là editor cơ bản, không cam kết parity với Microsoft Word. Bảng, ảnh, hyperlink, header/footer, section/column layout, field, comment, track changes và OOXML phức tạp được cảnh báo/giữ lại qua bản gốc; không ghi đè bản gốc.
- PPTX/XLSX ở milestone này là viewer đọc; chưa có editor Office tương ứng.
- Kho tài liệu chỉ lưu trên thiết bị hiện tại; chưa có cloud sync, upload public hay chia sẻ mới.

## Verification status

- Unit/integration: 47 files, 305 tests passed với Vitest (`--testTimeout=15000`).
- TypeScript noEmit: passed.
- Production Vite build trực tiếp: passed; chunk-size warning còn tồn tại.
- Fixture PDF/DOCX/PPTX/XLSX: parse nội dung thành công; DOCX xuất được mở bằng LibreOffice và render PDF/PNG thành công.
- Browser E2E và screenshot UI chưa kiểm chứng trong môi trường này vì Chrome trả `ERR_BLOCKED_BY_CLIENT` khi truy cập Vite localhost. Không xem đây là gate đã đạt.
