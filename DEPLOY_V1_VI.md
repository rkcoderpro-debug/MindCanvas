# MindCanvas V1 — hướng dẫn đưa lên mạng

Tài liệu này dùng đúng codebase hiện tại. Quy trình gồm Supabase (Auth + Database + Storage), Google Cloud (Google OAuth), Render API và Render frontend.

## A. Chuẩn bị code local

1. Giải nén project hoặc mở thư mục MindCanvas.
2. Mở Terminal tại thư mục có `package.json` gốc.
3. Chạy:

```bash
npm install
npm run typecheck
npm run build
```

4. Tạo file `.env` từ `.env.example`. Local dùng `http://localhost:8787` cho `VITE_API_BASE_URL`.

## B. Tạo hoặc dùng Supabase project cũ

Nếu project SpeakUp cũ còn đúng tài khoản Supabase, có thể dùng lại project đó nhưng nên tạo bucket `documents` và chạy migration MindCanvas. Không chạy migration vào database production có dữ liệu quan trọng nếu chưa backup.

1. Vào [Supabase](https://supabase.com/) → đăng nhập → chọn project cũ hoặc **New project**.
2. Vào **SQL Editor → New query**.
3. Mở file `supabase/migrations/0001_mindcanvas.sql`, copy toàn bộ và bấm **Run**.
4. Tiếp tục chạy đúng thứ tự các file còn lại: `0002_project_management.sql`, `0003_note_versions.sql`, `0004_note_revision_lock.sql`, `0005_flashcards.sql`.
5. Kiểm tra **Table Editor** có `profiles`, `folders`, `notes`, `documents`, `note_versions`, `flashcard_decks`, `flashcards`; bảng `notes` phải có cột `revision`.
6. Vào **Storage** và kiểm tra bucket `documents` đã tồn tại, trạng thái **Private**.
7. Nếu query báo policy đã tồn tại, mở phần policy để kiểm tra điều kiện `auth.uid()` thay vì chạy lặp lại mù quáng.

`0004_note_revision_lock.sql` đặc biệt quan trọng cho autosave nhiều thiết bị. V3.2.1 không cần migration mới, nhưng nếu file `0004` chưa được chạy thì không thể kiểm thử cơ chế phát hiện/khôi phục xung đột revision.

### Lấy biến Supabase

Vào **Project Settings → API** và lấy:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Nếu project cũ chỉ hiển thị `anon` key, có thể dùng anon key thay cho publishable key. Không đưa `service_role` vào frontend, không đặt nó trong biến `VITE_*`, và không commit vào Git.

## C. Bật Google Login

### 1. Google Cloud

1. Vào [Google Cloud Console](https://console.cloud.google.com/), chọn project Google cũ hoặc tạo project mới.
2. Mở **Google Auth Platform → Branding** và hoàn tất thông tin ứng dụng nếu Google yêu cầu.
3. Vào **Clients → Create Client → Web application**.
4. Thêm Authorized JavaScript origins:

```text
http://localhost:5173
https://mindcanvas-web.onrender.com
```

5. Thêm callback URL của Supabase vào **Authorized redirect URIs**:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

### 2. Supabase Auth

1. Vào **Authentication → Sign In / Providers → Google**.
2. Bật Google.
3. Dán **Client ID** và **Client Secret** từ Google Cloud rồi bấm **Save**.
4. Vào **Authentication → URL Configuration**:

```text
Site URL:
http://localhost:5173

Redirect URLs:
http://localhost:5173/**
https://mindcanvas-web.onrender.com/**
```

Sau khi có URL Render thật, thay domain trong các mục trên. Lỗi `redirect_uri_mismatch` gần như luôn do callback Supabase chưa nằm trong Google Cloud hoặc URL app chưa nằm trong Supabase allow-list.

## D. Chạy local với cloud thật

Tạo `.env` ở thư mục gốc:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_BASE_URL=http://localhost:8787

PORT=8787
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
WEB_ORIGIN=http://localhost:5173

EXPERIENTIAL_LABS_BASE_URL=https://api.experientiallabs.ai/v1
EXPERIENTIAL_LABS_API_KEY=
EXPERIENTIAL_LABS_MODEL=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
# Tùy chọn: thử theo thứ tự, ví dụ 3.8 → 3.7 → 2.5 nếu model đầu bận/lỗi tạm thời
GEMINI_MODELS=gemini-3.8-flash,gemini-3.7-flash,gemini-2.5-flash
MAX_DOCUMENT_BYTES=10485760
```

Mở hai Terminal:

```bash
npm run dev:web
npm run dev:server
```

Mở `http://localhost:5173`. Bấm **Đăng nhập Google**, tạo/kéo node, refresh trang rồi kiểm tra note còn lại. Khi đã đăng nhập và migration chạy đúng, note lưu vào Supabase; PDF lưu vào bucket private `documents`.

## E. Deploy lên Render

Render Blueprint hiện dùng để tạo backend API. Frontend tạo bằng Static Site riêng, vì Blueprint của Render không nhận `type: static` trong cấu hình này.

### E1. Tạo backend API bằng Blueprint

1. Đẩy code lên GitHub repository. Không đẩy `.env`.
2. Vào [Render Dashboard](https://dashboard.render.com/) → **New → Blueprint**.
3. Chọn repository chứa `render.yaml` rồi bấm **Apply**.
4. Blueprint chỉ tạo service `mindcanvas-api`.
5. Ở `mindcanvas-api`, nhập:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
WEB_ORIGIN=https://mindcanvas-web.onrender.com
GEMINI_API_KEY (nếu muốn dùng Gemini)
GEMINI_MODELS (tùy chọn, danh sách model cách nhau bằng dấu phẩy)
EXPERIENTIAL_LABS_BASE_URL/API_KEY/MODEL (chỉ khi đã xác minh contract provider)
```

### E2. Tạo frontend bằng Static Site

1. Vào Render → **New → Static Site**.
2. Chọn đúng GitHub repository `mindcanvas`.
3. Chọn branch `main`.
4. Điền các trường:

```text
Root Directory: .
Build Command: npm install && npm run build --workspace apps/web
Publish Directory: apps/web/dist
```

5. Ở phần Environment Variables, nhập:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_API_BASE_URL=https://mindcanvas-api.onrender.com
```

6. Bấm **Create Static Site**.
7. Sau khi API có URL thật, đặt `VITE_API_BASE_URL` bằng URL API đó rồi chọn **Save, rebuild, and deploy**.

### E3. Kiểm tra API và liên kết hai service

1. Mở:

```text
https://mindcanvas-api.onrender.com/api/health
```

Kết quả đúng phải có `ok: true`.

2. Nếu Render cấp domain khác tên dự kiến, cập nhật `VITE_API_BASE_URL` của frontend và `WEB_ORIGIN` của API theo domain thật rồi redeploy.
3. Quay lại Supabase URL Configuration và Google Cloud OAuth, thay domain dự kiến bằng domain Render thật nếu khác.

## F. Checklist nghiệm thu V1

- Google Login mở đúng và quay về frontend.
- Refresh trang vẫn còn user/session.
- Tạo/kéo node → refresh → dữ liệu vẫn còn.
- Tắt mạng → UI báo Offline, không mất bản local.
- Upload PDF → file xuất hiện trong private Storage bucket.
- API không trả key provider về browser.
- `/api/health` trả `ok: true`.
- PDF sai loại hoặc quá 10 MB bị từ chối.
- User A không đọc được notes/documents của User B.

## G. Lỗi thường gặp

### `redirect_uri_mismatch`

Google Cloud phải có đúng callback Supabase dạng `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. URL Render frontend là JavaScript origin/redirect allow-list, không thay thế callback Supabase.

### API trả `401 Missing Supabase session`

Frontend chưa có session hoặc request chưa gửi access token. Kiểm tra Google Login thành công, `VITE_SUPABASE_*` đúng project và frontend đã build lại sau khi đổi env.

### API trả `503 Unable to validate session`

Kiểm tra `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY` ở service API. Không dùng nhầm biến chỉ có prefix `VITE_` cho backend.

### PDF upload được nhưng không lưu cloud

Kiểm tra bucket chính xác là `documents`, bucket là private, migration đã chạy, và Storage policy dùng thư mục đầu tiên bằng `auth.uid()`.

### AI không chạy

Auth/database không phụ thuộc AI. Kiểm tra canvas + save cloud trước. Sau đó xem Render logs; provider key/model/endpoint phải nằm ở API service, không nằm frontend. Nếu chưa có provider credential, demo provider chỉ dùng để test flow, chưa phải AI live.
