# MindCanvas v5.26.0 — Takenote thành Learning Hub HTML

Áp dụng trên mã nguồn v5.25.0. Giải nén gói changed files vào thư mục gốc chứa package.json, apps/ và packages/, ghi đè đúng đường dẫn. Gói chỉ chứa tệp thêm/sửa và tài liệu phát hành, không chứa toàn bộ dự án. Cập nhật cả web và server. Không thêm dependency, biến môi trường hoặc migration SQL. Phiên bản root/web/server/lock là 5.26.0; build hiện có cập nhật cache service worker theo phiên bản package.

## Luồng tạo

Takenote kiến thức tiếp tục dùng Markdown, Word và PDF. Lựa chọn HTML đổi thành Learning Hub HTML: trang tổng quan, điều hướng chương/chủ đề, ghi chú trực quan, quiz từng chương và ôn tập tổng hợp. Tiêu đề/banner hub chỉ xuất hiện trong nội dung tổng quan; trang chương tập trung vào bài học. Màn hình nhỏ dùng thanh điều hướng cuộn ngang.

Thêm số câu tối đa mỗi lượt (3/5/10/15/20) và ưu tiên kiến thức nền tảng, vận dụng hoặc kết hợp. Quiz bắt buộc với Learning Hub, không bị tắt bởi thuộc tính review của bản nháp cũ. Mức chi tiết thay đổi độ dài giải thích, không được bỏ mục tiêu kiến thức. Bản nháp/cấu hình cũ nhận giá trị mặc định 5 câu và kết hợp.

AI Auto lập mục lục gồm chương, các mục tiêu kiến thức và nguồn tham chiếu trước; sau đó tạo lần lượt từng chương. Máy chủ kiểm tra đúng danh sách mục tiêu, tên và nguồn tham chiếu của mục lục; mỗi mục tiêu có ít nhất hai câu hỏi khác nhau. Tất cả nguồn phải có trong bản đồ; mã đáp án phải trỏ tới lựa chọn có thật, câu hỏi phải trỏ tới mục tiêu có thật, mã chương/mục tiêu/câu hỏi phải duy nhất. Chỉ ghép và trả toàn bộ tài liệu sau khi đủ các chương hợp lệ. Không lưu bản thiếu khi một chương lỗi. Vẫn dùng xác thực, hạn mức và scheduler AI Auto hiện có; một thao tác giữ một lượt quota trong suốt các bước, không tạo quota riêng từng chương.

Giới hạn nguồn cũ được giữ: 6 nguồn, tổng 120.000 ký tự, không tạo khi còn [UNREADABLE]. Giới hạn hub: 24 chương, 40 mục tiêu/chương, 400 mục tiêu và 1.600 câu hỏi; HTML tối đa 1,5 MB. Toàn bộ thao tác Auto có ngân sách 180 giây, các lệnh gọi tiếp theo bị dừng khi hết thời gian; với tài liệu lớn cần chia nguồn. Nền tảng hosting có thể áp dụng thời hạn request ngắn hơn. Bản nháp nguồn được giữ nếu tạo thất bại.

AI Manual dùng cùng yêu cầu về độ phủ, ghi chú và quiz; prompt chỉ có thuộc tính, không nhúng nội dung nguồn trích xuất. Người dùng gửi nguyên file gốc hoặc văn bản riêng cho nhà cung cấp AI. Đầu ra vẫn là một file HTML hoàn chỉnh, hoạt động độc lập. Prompt yêu cầu AI nhúng bản đồ kiến thức và ngân hàng quiz dưới dạng dữ liệu JSON nội bộ trong script application/json có id mindcanvas-learning-hub; người dùng không phải làm việc với file JSON riêng. File được nhập sẽ được kiểm tra dữ liệu và dùng trình dựng chung của MindCanvas. HTML mới thiếu hợp đồng Learning Hub hoặc thiếu ngân hàng quiz bị từ chối trước thao tác tính lượt Manual khi chưa có lượt đã kích hoạt. HTML cũ/generic vẫn xem được trong mục Tài liệu và Takenote đã lưu.

## Ghi chú và tương tác

Mỗi mục tiêu có giải thích dễ hiểu, thuật ngữ/công thức/điều kiện chính xác, ví dụ từng bước nếu bật, lỗi dễ nhầm và tóm tắt ghi nhớ. Công thức trong hub dùng Unicode đọc được; luồng Takenote kiến thức vẫn giữ cơ chế LaTeX/Word/PDF trước đây. Có minh họa theo bước, so sánh, quan hệ nguyên nhân-kết quả. Mô phỏng số hỗ trợ mô hình giới hạn y = a*x^p + b, p thuộc 1/2/3, với hệ số, đơn vị, miền giá trị, giả định và các biến giữ cố định lấy từ nguồn; thanh trượt, đồ thị và đặt lại tính kết quả bằng runtime chung, không eval. Chủ đề không phù hợp dùng minh họa khác. Không sinh công thức mô phỏng tùy ý từ chuỗi mã.

Bản đồ mục tiêu hiển thị trạng thái chưa kiểm tra, đã kiểm tra một phần, cần ôn lại hoặc đã củng cố; có tên tài liệu và vị trí nguồn. Có thể chuyển từ mục tiêu/câu hỏi về đúng phần ghi chú.

## Quiz và tiến độ

Ưu tiên các mục tiêu chưa kiểm tra, rồi mục tiêu có câu trả lời sai, rồi phần còn câu chưa gặp và phần đã củng cố. Chọn một câu mỗi mục tiêu trước khi bổ sung câu còn lại, không lặp câu trong cùng lượt. Độ khó là ưu tiên trong ngân hàng sẵn có, không được dùng để bỏ qua kiến thức chưa kiểm tra. Đảo thứ tự lựa chọn bằng mã đáp án ổn định; không thay câu hỏi/số liệu theo cách làm sai đáp án. Mỗi lượt lấy tối đa số câu đã chọn và số câu ngân hàng hiện có. Đây là ngân hàng hữu hạn chạy offline, không gọi AI để sinh câu mới trong lúc học.

Tách ba số liệu: đã đọc do người học đánh dấu; đã kiểm tra khi có ít nhất một câu trả lời thuộc mục tiêu; đã củng cố khi mọi câu của mục tiêu trong ngân hàng đều có lần trả lời gần nhất đúng. Một lượt điểm cao không hoàn thành toàn bộ độ phủ. Phản hồi có đáp án, lời giải và nút về kiến thức liên quan; có thể tiếp tục lượt mới ưu tiên phần còn thiếu/yếu.

Tiến độ lưu bằng IndexedDB trên thiết bị, tách theo tài khoản và hash dữ liệu hub. Nội dung/bank thay đổi bắt đầu tiến độ mới. Cùng nội dung mở từ Takenote, Tài liệu hoặc tài liệu thư viện trên canvas dùng chung tiến độ. Các lần ghi từ nhiều trình xem được ghép trong transaction. Đây chưa phải đồng bộ tiến độ giữa các thiết bị.

Trình xem vẫn dùng iframe sandbox=allow-scripts, không cấp same-origin. Chỉ hub có dữ liệu hợp lệ dùng runtime chung và kênh tiến độ: kiểm tra cửa sổ gửi, token riêng của phiên khung và loại sự kiện cho phép; phía ứng dụng tự kiểm tra/chấm câu trả lời theo ngân hàng. HTML không có hợp đồng không được mở kênh tiến độ. Không đưa tài khoản hay token đăng nhập vào HTML. Bản tải xuống không chứa token của khung hoặc dữ liệu tiến độ; học offline được, tiến độ trong file chỉ giữ cho lần mở hiện tại.

## Áp dụng và kiểm tra

Giữ nguyên cấu hình môi trường đang có. Chạy npm run typecheck, npm run test --workspace apps/web, npm run test --workspace apps/server và npm run build theo quy trình dự án; khởi động lại web/server sau khi cập nhật. Không có thao tác deploy, gửi tin nhắn hoặc thay đổi dữ liệu cloud trong phiên này. Xem QA_V5.26.0.md và CHANGED_FILES_V5.26.0.json.

Độ phủ được kiểm tra theo bản đồ AI đã lập, không phải chứng minh AI đã hiểu/nhận diện mọi chi tiết trong tài liệu gốc. Giao diện luôn nhắc đối chiếu nguồn và hiển thị cảnh báo nội dung thiếu. Chưa gọi Gemini thật hoặc kiểm thử nhà cung cấp Manual có đăng nhập trong đợt QA này.
