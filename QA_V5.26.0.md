# QA — MindCanvas v5.26.0

Ngày kiểm tra: 2026-10-20. Nền mã: v5.25.0. Không deploy; không gọi nhà cung cấp AI thật hoặc sửa dữ liệu cloud.

## Tự động

- Web: 675 kiểm thử / 94 tệp đạt. Bao gồm các bộ cũ về Learning Hub điều hướng, Takenote Markdown/Word/PDF, đề thi, kho Tài liệu, canvas và tài khoản.
- Server: 69 kiểm thử đạt, không bỏ qua. Môi trường AI/Supabase thật được tách tạm khỏi lần chạy kiểm thử rồi khôi phục. Bộ Takenote cuối cùng 7 kiểm thử đạt sau thay đổi tên nguồn.
- Typecheck web/server và build web/server đạt.
- Bộ mới kiểm tra nguồn bị thiếu, mã nguy hiểm/trùng, mục tiêu bị bỏ/đổi tên, câu hỏi thiếu/đáp án không tồn tại, lỗi một chương không trả bản ghép thiếu, Auto lập mục lục rồi tạo đủ hai chương.
- Bộ quiz kiểm tra nhiều lượt phủ đủ mục tiêu, ưu tiên ý chưa kiểm tra/còn yếu, không lặp trong lượt, giữ mã đáp án sau đảo lựa chọn, tách kết quả lượt khỏi độ phủ; không coi mục tiêu chưa gặp là đã củng cố.
- Kiểm tra tiến độ IndexedDB theo tài khoản/hash nội dung, ghép ghi đồng thời, từ chối sự kiện sai cửa sổ hoặc token; đọc lại bản nháp cũ có giá trị mặc định.
- Kiểm tra runtime HTML tải xuống hoạt động độc lập bằng DOM thực, nội dung nguồn không thoát script dữ liệu, thay runtime nhập bằng dữ liệu đã kiểm tra, mô phỏng v=4 cho 16 J, v=8 cho 64 J và đặt lại.

## Chromium với bản mã đã minify

Dùng thành phần TakenoteBuilderPage, DocumentToolsPage và HtmlDocumentViewer thật, build Vite chế độ test để không dùng tài khoản/dịch vụ thật. Chỉ API fixture được giả lập. Ba kích thước: 1440×1000, 768×1024 và 390×844. Web security bật; không dùng disable-web-security hoặc allow-same-origin cho hub.

Cả ba kích thước đạt:

- Chọn HTML; thấy số câu/độ khó; không có ô tắt quiz; prompt Manual chứa yêu cầu Learning Hub và ngân hàng câu hỏi.
- Auto nhận nguồn và mở hub hai chương, sáu mục tiêu; banner chỉ trên tổng quan; chuyển chương chỉ hiển thị bài học tương ứng.
- Mô phỏng số cho kết quả đúng khi đổi thanh trượt và đặt lại; giải thích/giả định và miền giá trị hiển thị.
- Đánh dấu đọc; làm ba câu có một câu sai; đáp án và lời giải hiện đúng; lượt 2/3 chỉ tăng đã kiểm tra 3/3 và chưa đánh dấu đã củng cố.
- Lưu vào Tài liệu, mở HTML trong khu vực đọc tập trung; khôi phục đã đọc 1/6 và đã kiểm tra 3/6. Reload vẫn giữ tiến độ.
- Chuyển Alice → Bob không thấy tiến độ Alice; quay lại Alice khôi phục đúng.
- Nhập Manual có script thử không tin cậy: dùng dữ liệu hợp lệ và runtime chuẩn, script nhập không chạy; tiến độ cùng nội dung dùng lại được.
- Tải HTML không chứa token của trình xem; mở độc lập khi chặn mạng vẫn chuyển chương và làm quiz được.
- Kiểm tra truy cập DOM iframe từ host bị chặn bởi opaque origin; không có lỗi JavaScript và không tràn ngang host/hub.

Đã xem ảnh desktop/mobile của thiết lập, tổng quan, chương, mô phỏng, quiz và mục Tài liệu. Thanh điều hướng chương cuộn ngang trên mobile; thông tin tiến độ thiết bị thu gọn mặc định. Ảnh QA và entry point thử nghiệm không nằm trong gói phát hành.

## Giới hạn kiểm chứng

API fixture chứng minh luồng ứng dụng/runtime, không đánh giá chất lượng kiến thức do Gemini thật tạo. Chưa kiểm thử đăng nhập ChatGPT/Gemini/Claude, Safari/iOS thật hoặc dịch vụ cloud production. Độ phủ vẫn phụ thuộc AI lập đúng bản đồ nguồn; kiểm tra cấu trúc không chứng minh đầy đủ về ngữ nghĩa. Auto nhiều chương có thể chạm thời hạn của hosting; tác vụ có ngân sách 180 giây và không trả kết quả thiếu. Tiến độ hiện lưu trên thiết bị, chưa đồng bộ nhiều thiết bị. File HTML độc lập chỉ giữ tiến độ trong phiên mở.

Vite có cảnh báo kích thước chunk và JSZip đang được import theo hai cách của dự án; build thành công. Một số kiểm thử React có cảnh báo act liên quan ghi/lazy load bất đồng bộ, không có assertion thất bại.
