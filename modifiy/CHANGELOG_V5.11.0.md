# MindCanvas v5.11.0

## Contextual help

- Nút `?` xuất hiện ngay khi mở Workspace, Canvas, Trung tâm học tập hoặc Quản lý thư mục; không phụ thuộc trạng thái guide.
- Danh mục trợ giúp dùng catalog tĩnh theo trang: icon, tên công cụ, mô tả và phím tắt cố định. Không đọc tên project, tên file, giá trị input hay nội dung tài liệu.
- `Chỉ vị trí` tìm target thật đang hiển thị và spotlight toàn control; các target không tồn tại không được đưa vào danh sách.

## Canvas Frames

- Thêm tool Frame (`F`) vào toolbar, More tools, tuỳ biến toolbar và help catalog.
- Chọn preset A4, A5 hoặc B5; một lần bấm canvas tạo frame có metadata template, kích thước và hướng dọc.
- Frame được lưu trong board model, kiểm tra khi import, hiển thị trong canvas/layer/thumbnail và xuất SVG với nhãn cùng viền nét đứt.
- Thay đổi frame là một chỉnh sửa canvas undoable thông qua luồng `onChange` hiện có.

## Tài liệu và guide

- Công cụ tài liệu chỉ còn thư viện viewer cho PDF, DOCX, PPTX và XLSX; dữ liệu DOCX cũ vẫn được giữ và mở ở viewer.
- Guide Công cụ đã bỏ các bước DOCX editor không còn target; chỉ dẫn viewer và chú thích/xuất PDF dùng event nghiệp vụ thật.
- Nút xuất PDF có target ổn định để guide không bị trỏ vào vùng thiếu.

## Kiểm chứng

- Web: 50 test files, 331 tests passed; typecheck passed.
- Server: 42 tests passed; typecheck passed.
- Production build: passed. Vite vẫn cảnh báo một số chunk lớn hơn 500 kB.
- Browser E2E/screenshot với browser thật chưa chạy vì môi trường hiện không có executable Chromium/Firefox. Không coi đây là gate đã đạt.
