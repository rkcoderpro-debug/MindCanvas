# MindCanvas V5.14.7

Hotfix cho build Render thất bại tại commit `21af7fc1108f2b187406e7981b41962b807e10d1`.

- Khôi phục API kiểm tra ghi cloud `verifyProjectWrite` và `ProjectVerificationError` mà file `projectWriteVerification.test.ts` còn trong nhánh deploy sử dụng.
- Đưa kiểm tra ghi cloud qua API này: đọc lại có thời hạn 15 giây, phân biệt lỗi quyền truy cập với dữ liệu đọc chậm, giữ bản nháp chờ đồng bộ khi chưa được xác nhận.
- Đóng gói file test tương thích để cả nguồn sau rollback lẫn nguồn còn file test V5.15 đều build được.
- Giữ toàn bộ bản vá canvas V5.14.6; cập nhật badge và cache PWA lên V5.14.7. Không có SQL mới.
