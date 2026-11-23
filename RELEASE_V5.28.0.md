# MindCanvas v5.28.0 — Trình soạn quiz

Bản cập nhật chồng lên **v5.27.9**. Giải nén các tệp vào thư mục gốc của dự án (nơi có `package.json`).

1. Trong đúng dự án Supabase của MindCanvas, chạy toàn bộ `supabase/migrations/0035_quiz_studio_manual.sql` trong **SQL Editor** (hoặc áp dụng qua luồng migration của dự án).
2. Commit/push các tệp và build/deploy lại **Static Site / frontend** trên Render. Bản này gọi trực tiếp hàm Supabase mới nên **không cần deploy lại dịch vụ API**. Không cần biến môi trường mới.
3. Thử **AI Manual** với JSON nhiều hơn giới hạn đã chọn. Xóa những câu không cần, thử quay lại ô dán, rồi tạo quiz. Thử tab **Manual** với một câu có LaTeX.

AI Manual có hai khung soạn prompt và nhập JSON; khung nằm cạnh nhau khi màn hình ngang và xếp dọc khi màn hình dọc. Nếu chọn **Dùng JSON có sẵn**, có thể dán hoặc chọn tệp `.json`; giới hạn theo gói và trần hiện tại 100 câu/quiz. Bản nháp JSON tối đa 2 MB và 500 câu để chỉnh sửa trước khi lưu, không cắt câu tự động.

Tab **Manual** dùng trình chỉnh sửa chung cho câu hỏi, bốn lựa chọn, đáp án đúng và giải thích. Gõ ký hiệu trực tiếp như x², √, ≤ hoặc dùng LaTeX như `$x^2$` và `$$\frac{a}{b}$$`. Tab này không dùng lượt AI; AI Manual chỉ tính lượt khi quiz được lưu thành công. Migration không ghi lại quiz cũ.
