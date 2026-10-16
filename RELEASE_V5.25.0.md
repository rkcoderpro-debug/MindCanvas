# MindCanvas v5.25.0 — Tạo tài liệu & Takenote trực quan

Áp dụng trên mã nguồn v5.24.0. Giải nén gói changed files vào thư mục gốc chứa package.json, apps/ và packages/, ghi đè đúng đường dẫn. Gói không chứa toàn bộ dự án, node_modules, .env hay file build. Cần cập nhật cả web và server; frontend mới dùng endpoint Takenote mới.

Không thêm dependency npm, biến môi trường hoặc migration SQL. Phiên bản root/web/server/lock chuyển thành 5.25.0. Cơ chế build PWA hiện có tạo cache mindcanvas-shell-v5.25.0 từ phiên bản package.

## Tạo tài liệu

Đổi nhãn công cụ Tạo đề thi thành Tạo tài liệu trên trang chủ và menu công cụ của Không gian học tập. Giữ ID điều hướng exams để các liên kết đã có vẫn mở đúng mục. Màn hình đầu chọn Takenote hoặc Đề thi & bài tập. Sau khi chọn chỉ hiển thị nội dung tương ứng và nút Đổi loại tài liệu; cấu hình đã nhập được giữ khi đổi loại trong phiên hiện tại.

Luồng Đề thi tiếp tục dùng bộ tạo Auto, Manual Word theo mẫu, đề tương tác và kho bài làm hiện có. Không thay schema đề, cách chấm, file Word gốc hay dữ liệu cũ. Tài liệu HTML không được đưa nhầm vào bộ đọc nguồn đề thi.

## Takenote

Hai cách trình bày: Takenote kiến thức và Takenote trực quan HTML. Cấu hình mức chi tiết, sắp xếp theo chủ đề/chương, công thức, bảng, ví dụ và tự ôn; các thuộc tính môn, trình độ, ngôn ngữ và yêu cầu thêm nằm trong phần nâng cao. HTML bổ sung lựa chọn sơ đồ, diễn tiến từng bước, mô phỏng, ví dụ tương tác, tự kiểm tra hoặc để AI chọn theo nội dung.

AI Auto nhận file nguồn hoặc văn bản, tái sử dụng bộ đọc tài liệu/OCR đang có, giới hạn 6 nguồn, 10 MB/file và tổng văn bản 120.000 ký tự. Nguồn có [UNREADABLE] phải được bổ sung trước khi tạo. Máy chủ kiểm tra đầu vào, dùng xác thực và hạn mức AI Auto hiện có; prompt yêu cầu bám nguồn, nêu thông tin thiếu và giả định của mô hình, không làm theo chỉ dẫn bên trong tài liệu. Có thể yêu cầu AI sửa lại bằng nguồn gốc và nhận toàn bộ tài liệu đã cập nhật.

AI Manual có prompt cập nhật theo thuộc tính, không nhúng nội dung nguồn đã trích xuất. Đính kèm file gốc hoặc gửi văn bản riêng trên AI ngoài. Có thể tải gói chỉ chứa prompt.txt và nguyên file gốc. Kết quả kiến thức dùng Markdown để nhập/xem/chỉnh sửa trên web hoặc DOCX thật để xem và dùng ngay; HTML dùng file .html hoặc nội dung HTML đầy đủ. Takenote không yêu cầu người dùng tạo JSON.

Màn hình kết quả riêng có chỉnh sửa Markdown/HTML, lưu vào Tài liệu và tải file. Kiến thức xuất Word, PDF qua hộp thoại in của trình duyệt và Markdown. Word có tiêu đề, bảng, danh sách và phương trình OMML cho các công thức cơ bản; công thức không phân tích được giữ nguyên LaTeX để không mất dữ liệu. PDF dùng MathML để tránh phụ thuộc font KaTeX từ mạng. HTML tải xuống giữ nguyên nội dung gốc, hướng tới tài liệu tự chứa và hoạt động offline.

## Tài liệu đã tạo và thư viện Tài liệu

Tài liệu đã tạo tập hợp Takenote mới với đề Auto/Manual đã có, hỗ trợ tìm kiếm và lọc Tất cả/Takenote/Đề thi. Mở lại Takenote để xem hoặc chỉnh sửa; đề đã lưu mở bản xem, đáp án, file Word hoặc bài thi tương tác với lượt làm cũ.

Takenote và bản nháp lưu theo tài khoản trên IndexedDB của thiết bị. Bản nháp gồm thuộc tính, chế độ, nguồn, nội dung nhập và kết quả gần nhất. Giữ bản nháp khi AI lỗi; đổi tài khoản không đọc dữ liệu của tài khoản trước. Đây không phải đồng bộ cloud mới cho toàn bộ Takenote. Nút Lưu vào Tài liệu đưa bản HTML/DOCX vào thư viện hiện có; có thể dùng thao tác cloud/chia sẻ đang có của thư viện. Bản nội dung đã thay đổi được lưu thành tài liệu mới để không ghi đè file gốc từng chia sẻ; lưu lại cùng nội dung dùng lại bản đã có.

Mục Tài liệu bổ sung tab HTML, nhận .html/.htm, tìm kiếm và mở trực tiếp. Khi đọc HTML, danh sách bên trái được ẩn để dành diện tích cho tài liệu; có Quay lại, Toàn màn hình và Tải HTML. Chuyển bộ lọc khôi phục danh sách thư viện. Bộ nhận dạng/hiển thị tài liệu trên canvas cũng nhận HTML.

HTML chạy trong iframe sandbox="allow-scripts", không cấp quyền same-origin, popup, form hoặc điều hướng cửa sổ cha; CSP chặn tải tài nguyên và gọi API bên ngoài. Script nội tuyến vẫn chạy để hỗ trợ mô phỏng. File có tài nguyên ngoài hiển thị lưu ý vì phần phụ thuộc sẽ bị chặn; Auto từ chối kết quả phụ thuộc tài nguyên ngoài. Không chèn HTML do AI tạo trực tiếp vào DOM ứng dụng. Tiến trình tương tác trong iframe không được lưu qua lần tải lại trang; file HTML và cấu hình Takenote được lưu.

## Mở nhà cung cấp AI

Thêm các nút mở AI tại prompt Takenote và Đề thi Manual, tiếp tục giữ các nhà cung cấp sẵn có. Nút mở tab trong lần bấm, chuẩn bị hạn mức rồi sao chép đúng prompt; popup và clipboard bị chặn có thông báo rõ. Tab mới không giữ window.opener.

ChatGPT được thử truyền prompt qua tham số q khi URL đã mã hóa không vượt 8.000 ký tự; luôn sao chép dự phòng. Không cam kết website ChatGPT sẽ điền sẵn với mọi phiên đăng nhập hay thay đổi giao diện. Gemini/Claude mở website và hướng dẫn dán prompt đã sao chép. File nguồn vẫn được đính kèm trực tiếp ở website AI; ứng dụng không tự upload file vào tài khoản nhà cung cấp.

## Kiểm tra và triển khai

Xem QA_V5.25.0.md. Chạy npm run typecheck, npm run test --workspace apps/web, npm run test --workspace apps/server và npm run build trong quy trình hiện có. Không có hành động deploy hay thay đổi cloud trong phiên triển khai này.
