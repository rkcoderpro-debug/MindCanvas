# Kiểm thử MindCanvas v5.26.1

Cơ sở: mã v5.26.0 dựng lại từ bản gốc và các gói cập nhật kế tiếp. Chỉ thay luồng Workspace, kiểm thử và phiên bản; không sửa cơ sở dữ liệu.

- 682 kiểm thử web / 94 tệp đạt, gồm 32 kiểm thử vòng đời Workspace.
- 69 kiểm thử server đạt.
- Build và kiểm tra kiểu TypeScript web/server đạt; xác nhận PWA build dùng cache v5.26.1.
- Các mô phỏng hồi quy: mở bản nháp trước khi PATCH hoàn tất; giữ bản nháp và revision khi server trả 57014; mở canvas khác khi bản cũ còn đang lưu; quay lại Workspace bình thường; dùng bản trên máy cho chủ sở hữu khi GET timeout nhưng không dùng để lách lỗi quyền; kiểm tra cloud khi mở bản chia sẻ; đổi vị trí/zoom không tạo PATCH; lỗi lưu thiết bị ngăn rời bản nháp; phản hồi đọc đến trễ không mở sai canvas.
- Bản lưu mã nguồn cũ kèm hai tệp migration 0018 giống hệt nhau. Khi kiểm thử đã chuyển bản _FIXED trùng byte ra khỏi thư mục migration của bản dựng lại, giữ nguyên tệp 0018 chuẩn. Không đưa bất kỳ tệp SQL nào vào gói vá.
- Các lỗi cloud được mô phỏng trong test. Chưa triển khai, chưa đo tốc độ hoặc sửa nguyên nhân UPDATE chậm trên Supabase production.
