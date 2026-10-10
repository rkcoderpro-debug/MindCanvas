# MindCanvas V5.0

MindCanvas is a visual study workspace for turning notes and private documents into editable canvases, mind maps and flashcards. V4.0 adds manually administered Free/Plus/Pro/Max plans, daily AI quotas reset at 12:00 Vietnam time, the separate 29,000₫/month AI Manual add-on, subscription history, per-account quota telemetry, a protected admin dashboard and Zalo-based upgrade requests without automatic payments or webhooks. V4.1 refines text editing, diagonal touchpad panning, connector feedback, remaining AI quota visibility, and the canvas navigator/zoom layout. V4.2 adds adaptive AI study plans, material-to-flashcard previews, deck expansion suggestions, ordered/random review, single-card flip/swipe sessions, forgotten-card retries, idempotent offline study events and streaks. V4.3 groups study tools in Learning Hub, adds manual/hybrid daily task planning, four-choice Quiz tests from documents or Gemini Web, quiz attempts and a persistent floating timer. V3.8 server-side AI file pipeline, responsive navigation, temporary theme previews, V3.7.1 media/resize work and the V3.5.1 shared Gemini reliability hotfix remain included. This repository contains a React/Vite frontend, an Express server boundary for private AI/document operations, shared graph types, and Supabase migration scaffolding.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on Vite's default port and the API runs on `http://localhost:8787`. Without Supabase credentials, the app intentionally uses a blank local canvas. With Supabase configured, projects, folders, notes and source documents are scoped to the signed-in user through RLS. `.doc`/`.ppt` legacy files are intentionally rejected; export them as `.docx`/`.pptx` first.

See [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md) for architecture, setup, credentials, current limits, and the next implementation slices.

Để cấu hình Supabase, Google OAuth và deploy hai service lên Render, làm theo [DEPLOY_V1_VI.md](./DEPLOY_V1_VI.md).

## v5.12.0 — lưu bản sao học liệu được chia sẻ

Chạy `0023_v5_12_0_save_shared_learning.sql` sau `0022_v5_11_5_quiz_answer_reveal.sql`. Migration này thêm quyền chia sẻ Tài liệu, thao tác lưu Quiz/Flashcard/Lab thành bản sao thuộc tài khoản nhận, và sao chép object Storage cho Tài liệu. Bản sao giữ độc lập khi người chia sẻ sửa, thu hồi quyền hoặc xóa bản gốc. Tài liệu được sao chép sẽ tính vào quota Storage của người nhận.

```sql
-- Supabase SQL Editor, chạy một lần sau khi database đã có migration 0022
-- Nếu database còn thiếu migration trước đó, chạy lần lượt các migration còn thiếu trước 0023.
-- Chạy toàn bộ file 0023_v5_12_0_save_shared_learning.sql
```

Quiz/Flashcard cần gói Plus trở lên để chia sẻ; Lab/Tài liệu cần Pro trở lên. Người nhận vẫn có thể lưu bản sao bằng tài khoản Free. Bản sao Quiz/Flashcard/Lab xuất hiện ở tab tương ứng; Tài liệu xuất hiện trong thư viện Tài liệu. Tiến độ ôn tập của Flashcard bắt đầu riêng cho bản sao.

## v5.13.0 — cho phép Lab dùng thư viện CDN có kiểm soát

Chạy `0024_v5_13_0_lab_cdn_resources.sql` sau `0023_v5_12_0_save_shared_learning.sql`. Migration thêm cờ cho phép thư viện CDN, lưu cờ này cùng Lab trên cloud và khi người nhận lưu bản sao, đồng thời đưa thay đổi cờ vào bộ đếm phiên bản Lab.

Trong Lab, bật **Cho phép tải thư viện CDN** trước khi chạy HTML dùng React/Babel/Tailwind/MathJax. Chỉ các miền CDN được nêu trong giao diện mới được tải. Kết nối mạng của nội dung, gồm Gemini/API, vẫn bị chặn; iframe giữ sandbox không cùng nguồn. Người nhận Lab được chia sẻ sẽ phải đồng ý trước khi tải CDN. Bản sao đính kèm có thể nhập từ `examples/labs/PHANMEMDAYHOC_3D_KHOI_CUTV2_LAB_BACKUP.json`.

## v5.14.0 — thêm thú cưng Hamster

Sau khi database đã chạy đến migration 0024, chạy `0025_v5_14_0_hamster_pet.sql`. Migration này thêm `hamster` vào giới hạn loại pet và RPC cập nhật hồ sơ. Tài khoản khách vẫn lưu lựa chọn trong trình duyệt; tài khoản đăng nhập cần migration để đồng bộ Hamster lên cloud.

## v5.14.1 — sửa lưu canvas và xung đột cloud

Không có migration mới. Ứng dụng ghi project có revision bằng optimistic locking; với database cũ chưa có cột revision, ứng dụng dùng `updated_at` đọc từ cloud làm điều kiện cập nhật và xác minh lại nội dung sau khi lưu.

## v5.0 — thú cưng học tập và chia sẻ học liệu

Chạy migration theo thứ tự tăng dần. File `0018_v4_9_learning_shares.sql` đã sửa lỗi `42601` và `42P13`; nếu cần chạy lại sau `0020`, bản sửa vẫn giữ đáp án Quiz riêng tư. File `0019_v5_0_pets.sql` thêm hồ sơ thú cưng và nhật ký thời gian học. File `0020` giới hạn quyền đọc đáp án Quiz trước khi nộp. File `0021_v5_11_3_learning_version_trigger_fix.sql` sửa lỗi `42703` do trigger dùng chung đọc `OLD.questions` trên bảng `flashcards`. File `0022_v5_11_5_quiz_answer_reveal.sql` bổ sung lựa chọn xem đáp án từng câu ngay khi chọn, có ghi nhận lựa chọn trên server.

```sql
-- Supabase SQL Editor
-- 1) chạy toàn bộ 0018_v4_9_learning_shares.sql đã cập nhật
-- 2) chạy 0019_v5_0_pets.sql
-- 3) chạy 0020, 0021, 0022, rồi 0023 theo thứ tự trên database chưa có các migration này
-- Nếu database đang ở 0022, chỉ cần chạy 0023 để bật lưu bản sao học liệu được chia sẻ.
```

Chủ học liệu vẫn là người duy nhất quản lý lời mời; người nhận chỉ đọc nội dung đã được cấp quyền và ghi tiến độ riêng. Pet lưu dự phòng trên trình duyệt khách, còn tài khoản đăng nhập đồng bộ qua `get_my_pet`, `update_my_pet` và `record_pet_activity`. Thời gian chỉ được ghi khi trang đang hiển thị và có tương tác gần đây; không tự động tải Lab cục bộ lên tài khoản.

## v5.15.0 — phần B: kết nối và trao đổi học liệu

Chạy `0026_v5_15_0_connections_messages.sql` **sau** `0025_v5_14_0_hamster_pet.sql`, trên môi trường staging trước khi cập nhật production. Mã web V5.15.0 cần migration này để sử dụng tab **Bạn bè & tin nhắn**.

- Tạo lời mời bằng email (hiện trong tài khoản người nhận) hoặc liên kết dùng một lần; ứng dụng không tự gửi email. Không có tìm kiếm tài khoản công khai.
- Người nhận có thể chấp nhận/từ chối; người gửi có thể hủy. Chỉ cặp đã kết nối, chưa chặn nhau được gửi tin nhắn. Nội dung chat là văn bản hoặc thẻ tham chiếu Quiz, Flashcard, Lab, Tài liệu.
- Gửi học liệu trong hộp **Chia sẻ** sẽ tạo quyền xem bản gốc và một thẻ trong cuộc trò chuyện cùng giao dịch. Quyền gói Plus/Pro của chủ học liệu được kiểm tra trên database. Hủy kết nối hoặc chặn sẽ thu hồi quyền xem bản gốc giữa hai người; bản sao người nhận đã lưu vẫn thuộc người nhận.
- Tin nhắn được lưu trong database; giao diện kiểm tra cập nhật mỗi 5 giây trong hội thoại và 15 giây ở danh sách khi tab đang hiển thị. Chat nhóm và push realtime bằng kênh riêng chưa nằm trong bản này.

**Kiểm tra trên staging bằng ba tài khoản A, B, C:** A mời B bằng email; B nhận và chấp nhận, C không nhìn thấy lời mời. A gửi Quiz và Tài liệu cho B; B tải bản gốc và lưu bản sao; C không thể truy vấn tin nhắn, file Storage hay học liệu. B từ chối lời mời khác; thử nhận liên kết sai email và liên kết đã dùng phải thất bại. A hủy kết nối hoặc B chặn A: tin nhắn mới và bản gốc phải bị chặn, bản sao vẫn mở được. Thử quá 20 tin/phút và quá 10 lời mời/ngày để xác minh giới hạn; kiểm tra số tin chưa đọc và tải tin cũ. Sau đó mới chạy migration trên production và deploy web.

Không đưa service-role key vào Vite hoặc trình duyệt. Các bảng chỉ cấp SELECT cho authenticated dưới RLS; mọi thay đổi phải qua RPC kiểm tra danh tính và quyền.

## v5.16.0 — phần C và D: quan hệ giáo viên, lớp học, bài tập và điểm

Chạy `0027_v5_16_0_classrooms.sql` **sau** `0026_v5_15_0_connections_messages.sql` trên staging, kiểm tra luồng bên dưới rồi áp dụng production trước khi deploy web V5.16.0. Mục **Lớp học** cần người dùng đăng nhập và bản migration mới.

- Giáo viên mời người đã kết nối làm học trò. Học trò chấp nhận hoặc từ chối; chỉ quan hệ đã chấp nhận mới được mời vào lớp. Học trò phải chấp nhận lời mời lớp lần nữa. Một tài khoản có thể dạy lớp của mình và học ở lớp khác.
- Giáo viên tạo lớp, mời/xóa học trò, giao bài dạng ghi chú hoặc đính kèm Quiz cloud do chính mình sở hữu, đặt hạn và thang điểm. Quiz cần quyền chia sẻ Plus trở lên theo quy tắc hiện có. Học trò làm Quiz trong tab lớp, rồi nộp lượt làm cùng ghi chú (nếu có); điểm Quiz lấy từ lượt làm được chấm trên server, giáo viên có thể nhận xét và sửa điểm.
- Bài nộp được sửa trước hạn nếu chưa chấm; sau hạn hoặc khi giáo viên đóng bài sẽ không nhận bài mới. Chỉ giáo viên xem danh sách bài nộp, chỉ học trò xem điểm và nhận xét của mình. Rời lớp, kết thúc quan hệ học tập hoặc ngắt kết nối khiến học trò mất quyền mở Quiz lớp; bản ghi bài nộp của lớp vẫn thuộc hồ sơ chấm điểm của giáo viên.
- Mọi bảng mới bật RLS và không cấp quyền đọc/ghi trực tiếp cho trình duyệt; RPC kiểm tra danh tính, vai trò, thành viên, thời hạn. Không trả đáp án Quiz trước khi nộp. Giới hạn 30 lớp/giáo viên, 100 học trò/lớp, 500 bài/lớp.

**Kiểm tra staging bằng giáo viên A, học trò B và tài khoản C:** A kết nối B, mời B làm học trò, B đồng ý; A tạo lớp và mời B, B đồng ý. C không thấy lớp và không đọc được bài nộp/điểm qua RPC hoặc bảng. A giao một bài văn bản và một Quiz, B nộp văn bản, làm Quiz rồi nộp lượt làm hợp lệ; A thấy điểm server và chấm/nhận xét, B chỉ thấy điểm của mình. Thử gửi lượt Quiz của C hoặc lượt cũ trước lúc giao bài, điểm vượt thang, bài nộp sau deadline, bài đã chấm, và yêu cầu chấm bằng tài khoản B: tất cả phải thất bại. B rời lớp hoặc ngắt kết nối; quyền làm Quiz lớp phải mất. Kiểm tra lời mời bị từ chối không cho xem lớp. Không có tài khoản staging/DB trong môi trường mã nguồn nên các bước này phải chạy trước phát hành production.

## v5.17.0 — phần E: chấm điểm và sổ điểm

Chạy `0028_v5_17_0_gradebook.sql` **sau** `0027_v5_16_0_classrooms.sql` trên staging, kiểm tra với nhiều tài khoản rồi chạy production trước khi deploy web V5.17.0. Các lớp/bài nộp cũ được giữ; migration ghi một bản chụp điểm hiện có, không suy diễn lịch sử sửa điểm trước thời điểm nâng cấp.

- Giáo viên mở **Lớp học → Mở sổ điểm và chấm bài** ở từng bài tập. Sổ điểm gồm học trò chưa nộp, chờ chấm, đã chấm, điểm Quiz server, điểm cuối, số câu sai, bài nộp và nhận xét. Giáo viên xem chi tiết câu trả lời/đáp án chỉ của lượt Quiz đã hoàn tất và thực sự được nộp vào bài tập.
- Chấm lần đầu và mọi thay đổi điểm/nhận xét ghi nhật ký với người thao tác, giá trị trước/sau và thời gian. Lần sửa sau khi đã chấm bắt buộc lý do ít nhất 10 ký tự; RPC chấm điểm cũ không còn quyền thực thi cho trình duyệt. Điểm Quiz tự động hoặc lần cập nhật bài trước khi chấm cũng được ghi nhận.
- CSV và Excel xuất đúng các hàng/cột đang hiển thị trong sổ điểm của **bài tập đang mở**; dữ liệu tải về xử lý chuỗi dạng công thức spreadsheet như văn bản. Không cấp SELECT trực tiếp cho bảng nhật ký, lượt Quiz hay bảng điểm; giáo viên xem sổ điểm và bài nộp, học trò chỉ có thể truy vấn lịch sử điểm của chính mình trong lớp đang hoạt động.

**Kiểm tra staging:** A là giáo viên, B/C là học trò trong lớp, D ngoài lớp. B và C nộp Quiz; A xem sổ điểm có hàng chưa nộp, xem câu sai của B, chấm lần đầu rồi sửa điểm và nhận xét kèm lý do. So sánh điểm/nhận xét ở màn hình với hai file CSV/XLSX. Thử sửa điểm không có lý do, vượt thang, chấm bằng B/C/D, đọc bài Quiz chưa nộp, xem lịch sử của người khác, đọc trực tiếp `class_grade_events`: đều phải thất bại. Cho B nộp lại trước khi chấm để xác nhận điểm tự động và nhật ký. Mở lại sau F5; điểm và lịch sử phải giữ nguyên. Việc chạy SQL/RLS trên staging/production chưa thể kiểm chứng trong môi trường mã nguồn này.

## v5.18.1 — tạo lớp trước khi mời học trò

Chạy `0029_v5_18_1_require_class_before_student_invite.sql` sau `0028` trước khi cập nhật web. RPC mời học trò yêu cầu người gửi sở hữu ít nhất một lớp. Kiểm tra bằng tài khoản đã kết nối: chưa tạo lớp thì nút mời bị khóa và RPC trả `CLASS_REQUIRED`; sau khi tạo lớp, lời mời gửi được; người nhận vẫn phải đồng ý trước khi được mời vào lớp. Tài khoản chỉ tham gia lớp của giáo viên khác vẫn không có quyền mời học trò.

## v5.18.2 — giao diện Quiz của bài tập lớp

Quiz trong bài tập lớp dùng giao diện từng câu, ô đáp án, thanh tiến độ và điều hướng giống Quiz thường. Học trò có thể đổi đáp án trước khi nộp; đáp án đúng và giải thích chỉ xuất hiện sau khi server nhận lượt làm. Sau đó lượt làm được chọn cho bài tập, học trò vẫn cần bấm **Nộp bài** để ghi điểm vào lớp. Không có migration mới cho V5.18.2; nếu chưa chạy `0029` của V5.18.1, áp dụng migration đó trước khi deploy bản này.

## v5.19.0 — lưu trữ bài tập, xem lại Quiz và chuông thông báo

Sau `0029`, chạy toàn bộ `0030_v5_19_0_assignment_archive_quiz_review.sql` rồi `0031_v5_19_0_activity_notifications.sql` trên staging, kiểm tra hai tài khoản và triển khai database production **trước** web V5.19.0. Nếu chưa áp dụng migration, phần thông báo và thao tác lưu trữ/xem lại sẽ báo thiếu RPC; các phần cũ vẫn có thể dùng.

- Giáo viên lưu trữ bài tập thay vì xóa. Lưu trữ sẽ đóng nhận bài mới; khôi phục sẽ mở lại nếu bài vốn đang mở và hạn nộp vẫn còn. Bài nộp, điểm và lịch sử chấm được giữ. Học sinh đã nộp vẫn xem được bài lưu trữ và kết quả cũ.
- Học sinh xem lại lượt Quiz đã hoàn thành, kể cả sau hạn nộp, qua RPC chỉ trả lượt thuộc chính họ. Xem kết quả không tự chọn lượt để nộp. Không có quyền đọc đáp án của lượt chưa hoàn thành.
- Chuông tổng hợp tin nhắn, chia sẻ Quiz/Flashcard/Lab, thẻ tài liệu gửi trong tin nhắn, lời mời kết nối/lớp/giáo viên/Canvas và bài tập mới. Chỉ lưu dấu đã đọc; nguồn sự kiện được đọc từ các bảng hiện có. Lời mời bằng liên kết chưa gắn email không hiện cho tài khoản bất kỳ. Chuông kiểm tra khi trang có focus và mỗi 20 giây khi trang đang hiển thị.

Kiểm tra staging: giáo viên lưu trữ bài đã có điểm rồi khôi phục và kiểm tra sổ điểm/lịch sử; học sinh xem lại lượt đã hoàn thành sau hạn nhưng không thể mở lượt của người khác hay lượt chưa nộp; tài khoản thứ ba không thấy thông báo/tin nhắn của cặp khác; nhận lời mời từ chuông và tải lại trang để kiểm tra số chưa đọc. Thử trên màn 320, 390, 768 và 1366 px, bàn phím và tùy chọn giảm chuyển động.

## v5.20.0 — thư viện Lab

Chạy `0032_v5_20_0_lab_library.sql` **sau** `0031_v5_19_0_activity_notifications.sql`. Số `0031` đã dành cho thông báo v5.19; không đổi tên hoặc ghi đè migration đó.

Migration thêm chế độ Lab, ảnh bìa, cấu hình khung xem và thông tin tạo Lab; cập nhật RPC chia sẻ/lưu bản sao, trigger phiên bản và quota. Kiểm tra lưu, mở lại, chia sẻ và lưu bản sao bằng hai tài khoản trên staging trước khi chạy production và deploy web v5.20.0. Kiểm thử cloud/RLS thực tế chưa được thực hiện trong phiên mã nguồn.

Nếu đã dùng gói v5.20.0 cũ, xóa **chỉ** `0031_v5_20_0_lab_library.sql` khỏi repository và thay bằng `0032_v5_20_0_lab_library.sql`; giữ nguyên `0031_v5_19_0_activity_notifications.sql`. Nếu đã chạy SQL Lab cũ trong SQL Editor, việc sửa số file không yêu cầu xóa dữ liệu; nội dung SQL chỉ đổi chú thích thứ tự. Xem `RELEASE_V5.20.0.md` và `QA_V5.20.0.md` ở thư mục gốc.
