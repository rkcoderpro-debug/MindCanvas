# MindCanvas: chẩn đoán Gemini 403

Áp dụng sau gói mindcanvas-gemini-fallback.zip. Thay apps/server/src/gemini.ts và apps/server/tests/gemini.test.ts. Không cần sửa frontend hay biến môi trường để áp dụng bản chẩn đoán.

Bản này đọc lý do lỗi Google và chuyển thành thông báo an toàn: key bị lộ/chặn, HTTP referrer restriction, IP restriction, API chưa bật, API restriction hoặc thiếu quyền model. Không xuất nguyên văn body upstream. Lý do chưa nhận diện sẽ được ghi rõ chưa xác định; không suy đoán key chắc chắn bị chặn. Không thay đổi quy tắc fallback: 403 vẫn dừng.

```bash
npm run typecheck --workspace apps/server
npm run build --workspace apps/server
node --import tsx --test apps/server/tests/gemini.test.ts
git add apps/server/src/gemini.ts apps/server/tests/gemini.test.ts GEMINI_403_VI.md
git commit -m "fix: explain Gemini permission errors safely"
git pull --rebase origin main
git push origin main
```

Dừng nếu có conflict. Chờ backend Render deploy mới rồi thử lại một lần; đọc thông báo trên web hoặc Network → mind-map → Response. Nếu Google báo leaked: tạo key mới và thu hồi key cũ, cập nhật GEMINI_API_KEY ở backend rồi Save and deploy. Nếu API bị giới hạn/tắt: cấu hình đúng quyền Generative Language API trong project sở hữu key. Không tắt toàn bộ giới hạn một cách tùy tiện. Nếu model thiếu quyền: dùng model mà project được phép gọi hoặc xin quyền truy cập. Nếu chưa rõ: gửi thông báo mới, không gửi key.

Network hiển thị HTTP 502 vì backend chuyển lỗi upstream thành 502; trường code HTTP_403 phản ánh mã thực từ Gemini. Đây không tự chứng minh Render bị hỏng.

Test giả lập; chưa xác minh bằng key thật trên Render. API list model thành công chưa chứng minh generateContent được cho phép.

Nguồn: https://ai.google.dev/gemini-api/docs/troubleshooting và https://ai.google.dev/gemini-api/docs/api-key
