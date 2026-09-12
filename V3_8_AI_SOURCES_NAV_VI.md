# V3.8 — AI đa nguồn, clipboard và điều hướng thu gọn

## Có gì mới

- Mind map và flashcard nhận văn bản dán trực tiếp.
- Có thể bấm **Dán từ clipboard** để dán chữ hoặc ảnh chụp màn hình.
- Có thể chọn/thả các file: `PDF`, `DOCX`, `PPTX`, `TXT`, `Markdown`, `CSV`, `TSV`, `JSON`, `JPG`, `PNG`, `WebP`, `GIF`.
- AI luôn trả preview để sửa trước khi thêm vào canvas hoặc bộ flashcard.
- Sidebar desktop có thể thu gọn thành dải icon; bấm nút ở đầu sidebar hoặc dùng `Ctrl/⌘+Shift+B`.
- Trạng thái thu gọn được lưu cục bộ, không ảnh hưởng dữ liệu project trên cloud.

## Google Docs/Slides

V3.8 chưa gọi Google Drive API để đọc URL Docs/Slides trực tiếp. Cách dùng ổn định là:

1. Mở Google Docs/Slides.
2. Chọn **File → Download**.
3. Tải Google Docs thành `.docx`, Google Slides thành `.pptx`.
4. Trong MindCanvas, chọn file vừa tải ở AI mind map hoặc Flashcards.

Các file `.doc` và `.ppt` cũ bị từ chối có chủ đích; hãy xuất lại thành `.docx`/`.pptx`.

## Luồng kỹ thuật

Frontend gửi file kèm Supabase access token tới API. API kiểm tra session, giới hạn kích thước, trích xuất chữ hoặc chuyển ảnh thành input multimodal rồi gọi provider Gemini qua scheduler hiện có. `GEMINI_API_KEY` chỉ nằm ở service API. Frontend nhận preview có thể chỉnh sửa, sau đó mới lưu nguồn private và Apply dữ liệu.

Endpoint mới:

```text
POST /api/ai/file
multipart/form-data: file, task=mind-map|flashcards, maxCards=3..50
```

Không có migration hoặc biến môi trường mới. Vẫn cần các biến Gemini/Supabase hiện có trên `mindcanvas-api`; tuyệt đối không đặt `GEMINI_API_KEY` ở `mindcanvas-web` hoặc biến `VITE_*`.

## Cách kiểm tra sau deploy

1. Deploy `mindcanvas-api`, kiểm tra `/api/health` có `release: "3.8.0"`.
2. Deploy `mindcanvas-web`, hard refresh và cập nhật PWA nếu được hỏi.
3. Đăng nhập Google rồi thử text, ảnh PNG nhỏ, PDF, DOCX và PPTX ở cả hai luồng AI.
4. Sửa/xóa kết quả preview rồi Apply; xác nhận không có dữ liệu được thêm trước khi Apply.
5. Thu gọn/mở sidebar và tải lại trang.

## Giới hạn

- Mặc định file tối đa 10 MB; text đầu vào AI tối đa 120.000 ký tự.
- DOCX/PPTX hiện lấy nội dung chữ cơ bản và đánh dấu trang/slide; chưa giữ bảng, ảnh, layout, speaker notes.
- PDF scan cần OCR ở phiên bản sau.
- Clipboard ảnh phụ thuộc quyền trình duyệt và phải được kích hoạt từ thao tác người dùng; nếu bị chặn, người dùng vẫn có thể chọn file hoặc dán text vào textarea.
