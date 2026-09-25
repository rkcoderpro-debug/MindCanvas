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
