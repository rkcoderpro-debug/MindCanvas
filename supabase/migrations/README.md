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

## v5.0 — thú cưng học tập và chia sẻ học liệu

Chạy migration theo thứ tự tăng dần. File `0018_v4_9_learning_shares.sql` đã được sửa lỗi PostgreSQL `42601` ở các điều kiện phân hạng gói và có thể chạy lại an toàn trên môi trường đã áp dụng một phần. File `0019_v5_0_pets.sql` thêm hồ sơ thú cưng và nhật ký thời gian học.

```sql
-- Supabase SQL Editor
-- 1) chạy toàn bộ 0018_v4_9_learning_shares.sql đã cập nhật
-- 2) chạy 0019_v5_0_pets.sql
```

Chủ học liệu vẫn là người duy nhất quản lý lời mời; người nhận chỉ đọc nội dung đã được cấp quyền và ghi tiến độ riêng. Pet lưu dự phòng trên trình duyệt khách, còn tài khoản đăng nhập đồng bộ qua `get_my_pet`, `update_my_pet` và `record_pet_activity`. Thời gian chỉ được ghi khi trang đang hiển thị và có tương tác gần đây; không tự động tải Lab cục bộ lên tài khoản.
