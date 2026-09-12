# MindCanvas V1 — hướng dẫn đưa lên mạng

## Cập nhật V3.8.0 — AI đa nguồn và điều hướng thu gọn

V3.8 hợp nhất một pipeline AI phía server cho mind map và flashcard. Người dùng có thể dán văn bản, dán ảnh từ clipboard hoặc chọn/thả PDF, DOCX, PPTX, TXT, Markdown, CSV, TSV, JSON, JPG, PNG, WebP/GIF. Kết quả vẫn đi qua bước preview có thể sửa trước khi Apply. Thanh điều hướng desktop có thể thu gọn thành icon rail bằng nút ở đầu sidebar hoặc `Ctrl/⌘+Shift+B`; trạng thái được lưu trên trình duyệt. Flashcard cũng có nút dán clipboard riêng.

Không có migration Supabase mới và không thêm secret/env bắt buộc. API mới là `POST /api/ai/file`, vẫn yêu cầu session Supabase ở server. Ảnh được gửi cho Gemini dưới dạng dữ liệu inline ở backend; key không xuất hiện trong browser. Google Docs/Slides nên tải xuống dạng `.docx`/`.pptx` rồi chọn file; `.doc` và `.ppt` cũ chưa được hỗ trợ.

Sau khi push V3.8:

1. Deploy `mindcanvas-api` trước. Mở `https://URL-API-CUA-BAN/api/health`; phải có `"release":"3.8.0"` và `"aiConfigured":true` nếu đã đặt Gemini key.
2. Deploy `mindcanvas-web`, hard refresh, sau đó chấp nhận cập nhật PWA nếu trình duyệt báo bản mới.
3. Đăng nhập Google, mở AI mind map hoặc Flashcards → Generate with AI. Thử lần lượt văn bản, ảnh PNG nhỏ, PDF/DOCX/PPTX. Kết quả phải hiện preview trước khi Apply.
4. Thử nút thu gọn sidebar và phím `Ctrl/⌘+Shift+B`. Tải lại trang để kiểm tra trạng thái thu gọn vẫn được giữ.
5. Nếu dùng Google Docs/Slides: **File → Download → Microsoft Word (.docx)** hoặc **Microsoft PowerPoint (.pptx)**, sau đó upload file đã tải xuống.

Giới hạn hiện tại: file upload chịu `MAX_DOCUMENT_BYTES` (mặc định 10 MB), text đưa vào AI bị giới hạn 120.000 ký tự, parser Office chỉ đọc nội dung chữ cơ bản. Bảng, hình, layout phức tạp và PDF scan cần một slice OCR/layout riêng. Live Gemini, Supabase Storage/Auth và Render vẫn cần QA bằng credential thật sau deploy.

## Cập nhật V3.7.1 — Media, resize Figma và AI reliability

V3.7.1 hợp nhất bản nâng cấp bạn gửi từ gói V1: chèn hình/video/audio vào canvas, dán ảnh chụp màn hình, ghi âm bằng micro, nhúng trang web/YouTube/video, crop/trim, xoay, opacity, 8 tay nắm resize kiểu Figma, layer/preview/export nhận đúng các phần tử mới. Vẫn giữ hotfix AI V3.5.1 cho nhiều tài khoản và dữ liệu board cũ tự mở được.

Không có migration Supabase mới và không có biến môi trường mới cho media. Vì phần media được lưu trong board JSON dưới dạng data URL, file export/import vẫn tự chứa nội dung; giới hạn một file media là 12 MB và file project import là 40 MB. Sau khi push code, deploy **cả `mindcanvas-api` và `mindcanvas-web`** để đồng bộ badge/service worker và hotfix AI.

Checklist sau deploy:

1. Deploy `mindcanvas-api`, mở `/api/health`; phải có `"release":"3.5.1"` nếu chỉ kiểm tra API hotfix, còn badge web hiển thị `V3.7.1`. API không cần thay đổi cho media.
2. Deploy `mindcanvas-web`, hard refresh hoặc bấm **Cập nhật ngay** khi PWA báo phiên bản mới.
3. Tạo project trắng, thử chèn ảnh/video/audio, kéo, resize từng cạnh, xoay, chỉnh opacity rồi refresh. Kiểm tra **Elements** vẫn tìm thấy, ẩn/khóa, duplicate và đổi layer.
4. Thử dán screenshot bằng nút clipboard hoặc `Ctrl/⌘+V`; ghi âm chỉ hoạt động khi trình duyệt cấp quyền micro và trang chạy trên HTTPS/localhost.
5. Nhúng URL HTTPS/YouTube. Một số website chặn iframe là giới hạn của website nguồn, không phải lỗi MindCanvas.
6. Xuất SVG và PNG; media hình ảnh phải xuất thành hình, video/audio/embed xuất thành thẻ đại diện có tên/URL. File `.mindcanvas.json` có thể nhập lại trên board cũ.

V3.7.1 không đưa `GEMINI_API_KEY` lên frontend. Nếu AI vẫn báo `AI_UNAVAILABLE`, đó là quota/capacity dùng chung của Google project; retry/fallback không thể làm quota miễn phí vô hạn.

## Hotfix V3.5.1 — AI dùng ổn định hơn cho nhiều tài khoản

V3.5.1 sửa trường hợp AI chạy trên máy chủ dự án nhưng người dùng khác gặp chuỗi `HTTP_503`, `TIMEOUT` và `HTTP_404`. Tất cả người dùng web dùng chung `GEMINI_API_KEY` phía server, vì vậy quota/capacity là tài nguyên chung. Backend mới giới hạn hai tác vụ AI đồng thời, mỗi tài khoản chỉ có một tác vụ đang chạy, xếp hàng có giới hạn, retry lỗi tạm thời bằng exponential backoff rồi mới chuyển model. Một lỗi `503` đơn lẻ không còn khóa model đối với request kế tiếp.

Không có migration Supabase mới. Cần redeploy **cả `mindcanvas-api` và `mindcanvas-web`**.

Trong Render → `mindcanvas-api` → **Environment**, giữ `GEMINI_API_KEY` hiện tại và đặt:

```env
GEMINI_MODELS=gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-2.5-flash,gemini-2.5-flash-lite
GEMINI_TIMEOUT_MS=25000
GEMINI_RETRIES_PER_MODEL=1
GEMINI_TOTAL_TIMEOUT_MS=120000
GEMINI_RETRY_BASE_MS=1000
AI_MAX_CONCURRENT=2
AI_MAX_QUEUE=20
AI_MAX_QUEUE_PER_USER=2
AI_QUEUE_TIMEOUT_MS=30000
```

Các biến mới đều có giá trị mặc định trong code, nhưng nên khai báo rõ trên Render để dễ kiểm tra. Không đưa bất kỳ biến nào ở trên hoặc `GEMINI_API_KEY` vào service frontend/biến `VITE_*`.

Sau khi push V3.5.1:

1. Render → `mindcanvas-api` → **Manual Deploy → Deploy latest commit**.
2. Mở `https://URL-API-CUA-BAN/api/health`. Kết quả phải có `"release":"3.5.1"`, `"aiConfigured":true`, `"aiModelCount":6`, `"aiCapacity":2`.
3. Render → `mindcanvas-web` → deploy latest commit.
4. Mở web khi online và hard refresh. Nếu service worker báo bản mới, bấm **Cập nhật ngay**; badge phải là `V3.5.1`.
5. Dùng hai tài khoản Google trên hai trình duyệt/thiết bị, mỗi tài khoản thử PDF nhỏ 1–4 trang. Render Logs có thể hiện `[AI] retry` hoặc `[AI] fallback`; kết quả thành công sẽ có `[AI] success`.
6. Nếu vẫn nhận `AI_UNAVAILABLE` sau nhiều lần cách nhau ít nhất 30 giây, kiểm tra quota/rate limit của Google project. Retry và fallback không thể biến quota miễn phí dùng chung thành năng lực không giới hạn.

Chi tiết kỹ thuật và danh sách file nằm trong `V3_5_1_SHARED_AI_RELIABILITY_VI.md`.

## Cập nhật V3.5 — PWA, offline và export/layers

V3.5 là bản cập nhật frontend. Bản này thêm PWA có thể cài lên điện thoại/máy tính, cache giao diện để mở lại khi offline, IndexedDB cho project draft lớn, Trung tâm đồng bộ, pinch-to-zoom hai ngón, smart guides, renderer SVG/PNG khớp giao diện editor và bảng Elements mới không chồng chữ.

Không có migration Supabase mới, không thêm biến môi trường và không thay đổi API Gemini. Chỉ cần deploy `mindcanvas-web`; `mindcanvas-api` có thể giữ nguyên.

Sau khi push commit V3.5:

1. Render → service Static Site `mindcanvas-web` → **Manual Deploy → Deploy latest commit**.
2. Chờ build xong, mở URL web và kiểm tra badge là `V3.5`.
3. Reload một lần khi đang có mạng để service worker cache đầy đủ file giao diện. Nếu xuất hiện thông báo có bản mới, bấm **Cập nhật ngay**.
4. Mở một project, sửa nội dung, bấm trạng thái lưu trên topbar để mở **Trung tâm đồng bộ**. Khi online và đăng nhập, hàng đợi phải về 0 sau khi đồng bộ.
5. Chọn menu **Cài ứng dụng**. Android/desktop Chromium hoặc Brave có thể hiện nút cài; iPhone/iPad dùng Safari → Chia sẻ → Thêm vào Màn hình chính.
6. Mở project đã truy cập ít nhất một lần, tắt mạng rồi mở lại app: editor và bản cache phải vẫn mở được. AI, Google Login, PDF cloud và đồng bộ chỉ chạy lại khi có mạng.
7. Kiểm tra SVG/PNG với node dài và node màu tối: chữ phải dùng sans-serif, xuống dòng trong node, có màu tương phản và nền/connector theo theme đang dùng.
8. Tạo nhiều element, mở bảng **Phần tử**: danh sách phải cuộn riêng, không chồng chữ; thử tìm kiếm, ẩn/khóa và kéo hàng để đổi layer.

Danh sách file và checklist chi tiết nằm trong `V3_5_PWA_EXPORT_LAYERS_VI.md`.

## Cập nhật V3.4 — Smart Study Canvas

V3.4 sửa pan/zoom để nền giấy đi cùng element, thêm 6 kiểu nền canvas, rich text, tìm nhanh `Ctrl/⌘+K`, clipboard liên-project, AI cho vùng chọn, liên kết trang PDF nguồn và nâng cấp Flashcards. Không có migration hoặc biến môi trường mới, nhưng có endpoint backend mới `POST /api/ai/selection`, vì vậy cần redeploy **cả `mindcanvas-api` lẫn `mindcanvas-web`**.

Trước khi deploy, bảo đảm Supabase đã chạy đủ `0001` → `0005`. Ở API giữ nguyên `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `WEB_ORIGIN`, `GEMINI_API_KEY` và `GEMINI_MODELS`; không đưa Gemini key vào biến `VITE_*`. Ở frontend giữ `VITE_API_BASE_URL` trỏ đến URL thật của `mindcanvas-api`.

Sau khi push commit V3.4:

1. Render → `mindcanvas-api` → **Manual Deploy → Deploy latest commit**.
2. Chờ `/api/health` trả `{"ok":true,...}` rồi kiểm tra route mới không còn `404` (gọi không có token phải trả `401`, đó là đúng).
3. Render → `mindcanvas-web` → **Manual Deploy → Deploy latest commit**.
4. Hard refresh trình duyệt; badge phải là `V3.4`.
5. Mở project, chọn Hand và kéo: chấm/đường giấy phải đi cùng các element. Đổi lần lượt 6 kiểu nền, refresh và xác nhận nền được lưu.
6. Chọn text/node → **Dùng AI cho vùng chọn** → Generate preview → Apply. Kiểm tra tab Network: browser chỉ gửi bearer session, không có Gemini key.
7. Nếu dùng PDF nguồn/flashcard cloud, kiểm tra bucket `documents` vẫn là Private và migration `0005_flashcards.sql` đã được áp dụng.

Danh sách file và checklist chi tiết nằm trong `V3_4_SMART_STUDY_CANVAS_VI.md`.

## Cập nhật V3.3.1 — Expanded Themes & Motion

V3.3.1 chỉ thay đổi frontend: mở rộng thành 10 theme và thêm interaction motion có hỗ trợ Reduce motion. Không thêm migration, không đổi Supabase/OAuth/Gemini và không thêm biến môi trường. Sau khi push các file trong `V3_3_1_EXPANDED_THEMES_MOTION_VI.md`, chỉ deploy service `mindcanvas-web`.

## Cập nhật V3.3 — Vibrant Themes

V3.3 chỉ thay đổi frontend. Không thêm migration, không đổi Supabase/OAuth/Gemini và không thêm biến môi trường. Sau khi push các file trong `V3_3_VIBRANT_THEMES_VI.md`, chỉ cần deploy latest commit cho service `mindcanvas-web`; `mindcanvas-api` có thể giữ nguyên.

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
