# Chạy MindCanvas v5.14.9 trên Windows

1. Giải nén ZIP các file thay đổi **vào thư mục gốc** `mindcanvas-v1`. Khi được hỏi, chọn ghi đè các file có cùng tên. Giữ nguyên cấu trúc `apps/web/...` trong ZIP.
2. Tắt tiến trình `npm run dev` cũ (`Ctrl+C`).
3. Nhấp đúp `SETUP_LOCAL_WINDOWS.cmd`, hoặc mở terminal VSCode **tại thư mục gốc** `mindcanvas-v1` và chạy:

   ```powershell
   npm ci
   npm ls katex --workspace apps/web
   npm run dev
   ```

4. Mở `http://localhost:5173`. Lệnh `npm ci` cài KaTeX được khai báo trong `apps/web/package.json` và `package-lock.json`; cần có kết nối Internet. Không chạy `npm ci` từ `apps/web`.

Đăng nhập Google: tạo `.env` tại thư mục gốc `mindcanvas-v1` (cạnh `package.json`), điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` từ đúng dự án Supabase, rồi **tắt và chạy lại** `npm run dev`. Trong Supabase Dashboard → Authentication → URL Configuration → Additional Redirect URLs, thêm `http://localhost:5173`. Nếu Vite dùng cổng khác, thêm URL tương ứng với cổng đó. Giữ khóa service role và Gemini riêng cho server; không đặt vào biến `VITE_`. Để thử AI Manual và các API tài khoản, điền thêm `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SERVICE_ROLE_KEY` trong `.env` gốc.

Nếu `npm ls katex --workspace apps/web` vẫn báo thiếu, kiểm tra `apps/web/package.json` có dòng `"katex": "^0.19.0"`. Nếu chưa có, ZIP đã được chép nhầm vị trí hoặc chưa ghi đè file. Nếu lệnh cài đặt báo lỗi mạng, kiểm tra proxy/mạng và chạy lại `npm ci`.
