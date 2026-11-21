# QA MindCanvas v5.25.0

Nền mã: v5.24.0. Gói chỉ gồm những file thêm/sửa của v5.25.0 và tài liệu phát hành; không đóng gói dữ liệu tài khoản, .env, node_modules hay harness trình duyệt tạm.

## Kết quả tự động

- Bộ web: 666 tests / 93 files passed, bao gồm hồi quy Flashcard, Quiz, Exam Auto/Manual, Word viewer, Không gian học tập và ứng dụng.
- Sau các sửa cuối về lưu phiên bản tài liệu và byte DOCX ổn định, chạy lại nhóm 22 tests Takenote/DocumentCreator/DocumentTools/ProviderLinks: passed.
- Máy chủ: 66 passed, 0 failed, 0 skipped. Khi chạy đã tạm cách ly cấu hình dịch vụ thật rồi khôi phục, dùng mock transport cho AI để không gửi tài liệu hoặc dùng hạn mức thật.
- npm run typecheck: passed cho web và server.
- npm run build: passed cho web và server. Còn cảnh báo chunk lớn/JSZip static-dynamic import của quá trình build; không có lỗi build.

## Hành vi đã kiểm tra

- Chọn loại tài liệu trước, giữ lựa chọn Takenote khi chuyển qua Đề thi và quay lại.
- Kho Tài liệu đã tạo kết hợp ghi chú và đề cũ, lọc theo loại, mở đi mở lại cùng một Takenote.
- AI Auto gửi đúng nguồn và thuộc tính; không gọi tạo tài liệu khi nguồn [UNREADABLE].
- Lỗi AI giữ nguồn và bản nháp; tải lại/đổi tài khoản khôi phục đúng dữ liệu, không lẫn chủ sở hữu.
- Manual prompt chỉ chứa yêu cầu/thuộc tính/metadata file; không chứa văn bản nguồn Auto đang giữ.
- Copy rồi nhập kết quả cùng một prompt không trừ hạn mức hai lần; từ chối nội dung HTML trống trước khi trừ lượt.
- Lưu HTML vào Tài liệu, lưu lại cùng nội dung không nhân bản; chỉnh nội dung rồi lưu giữ nguyên tài liệu gốc và tạo phiên bản mới.
- Markdown được escape, có tiêu đề/danh sách/bảng/LaTeX/hóa học; HTML từ Markdown không được thực thi trong DOM ứng dụng.
- DOCX là gói OOXML thật, có bảng, tiêu đề và OMML: phân số, căn, chỉ số, công thức hóa học. XML parse hợp lệ; không còn placeholder. Nội dung xuất giống nhau vẫn có byte giống nhau khi thời gian hệ thống thay đổi.
- HTML giữ nguyên byte khi tải xuống, nhận Unicode UTF-8, lưu tách tài khoản. CSP đứng trước script, bỏ base/refresh/form/frame/object/embed và script ngoài khỏi bản xem.
- Các nút nhà cung cấp chuẩn bị đúng prompt, đặt opener=null, mã hóa đúng Unicode/LaTeX/ký tự đặc biệt, fallback khi URL dài, báo clipboard/popup bị chặn và không mở tiếp nếu chuẩn bị hạn mức thất bại.

## Trình duyệt và kiểm tra hình ảnh

Chạy Chromium qua Playwright với web security hoạt động, dùng giao diện thật của DocumentCreatorPage, TakenoteBuilderPage, DocumentToolsPage, DocxViewer và kho IndexedDB. API trả fixture xác định; đây không phải kiểm thử chất lượng đầu ra của một lần gọi Gemini thật.

Các viewport: 1440×1000, 768×1024 và 390×844. Cả ba passed, không pageerror, không tràn ngang ở phần tạo và thư viện.

Tại mỗi viewport đã thử: prompt HTML; tải nguồn; tạo HTML; thay thanh vận tốc và kiểm tra động năng thay đổi từ 16 J thành 64 J; reset; câu tự kiểm tra có phản hồi; iframe từ chối truy cập DOM từ cửa sổ cha do khác origin; toàn màn hình; lưu/mở lại HTML trong Tài liệu; tải nguyên byte HTML; tạo ghi chú kiến thức; hiển thị công thức; xuất Word rồi mở bằng trình xem DOCX thật; mở bản in PDF; khôi phục kết quả sau reload.

Đã xem ảnh trang chọn loại, Manual, kết quả HTML, thư viện HTML và Word. Đã render bản PDF kiểm tra bằng Poppler: công thức động năng, căn và H₂O hiển thị; bảng/tiêu đề rõ ràng; mẫu ngắn có 1 trang A4, không trang trắng thừa.

## Phạm vi chưa xác minh

- Không dùng phiên đăng nhập thật trên ChatGPT/Gemini/Claude để xác nhận điền sẵn. Chỉ kiểm tra URL, sao chép, chuyển tab và fallback; giao diện có chỉ dẫn dán khi prompt chưa xuất hiện. Tham số ChatGPT không phải hợp đồng tích hợp ổn định.
- Không gọi Gemini thật hoặc xuất bản lên hosting trong phiên này. Server adapter, validation và lỗi được kiểm tra bằng mock fetch; nguồn file sử dụng lại reader/OCR đã có.
- Không chạy thiết bị iPhone/iPad Safari thật hoặc Microsoft Word desktop. DOCX đã kiểm tra OOXML và render bằng docx-preview; công thức OOXML nâng cao có thể cần kiểm tra thêm trong Word.
- Không thử đồng bộ/sharing cloud với tài khoản thật; không thay schema cloud. Ghi chú mới lưu theo thiết bị; dùng Lưu vào Tài liệu rồi thao tác cloud sẵn có nếu cần chia sẻ.
- HTML phụ thuộc CDN/API ngoài sẽ không hoạt động đầy đủ trong trình xem tự chứa; có lưu ý rõ. Không bảo đảm phục hồi trạng thái biến JavaScript của một mô phỏng sau khi reload.
