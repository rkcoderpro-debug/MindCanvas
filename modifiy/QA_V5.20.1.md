# QA — MindCanvas v5.20.1

Ngày kiểm tra: 12/10/2026. Nguồn nền: ZIP v5.20.0 do người dùng cung cấp tại `Downloads/Compressed/mindcanvas-v1 (4).zip`. Kiểm thử trên bản sao riêng; không sửa bản ZIP gốc.

## Kết quả đã thực sự chạy

| Kiểm tra | Kết quả |
|---|---|
| Typecheck web và server (`npm run typecheck`) | Đạt sau các sửa đổi cuối |
| Toàn bộ test web | 72 file, 474 test đạt; không bỏ qua test |
| Toàn bộ test server (`npm run test --workspace apps/server`) | 54 test đạt; không bỏ qua test |
| Build web | Đạt, 2.305 module; vẫn có cảnh báo chunk lớn hơn 500 kB |
| Build server (`npm run build --workspace apps/server`) | Đạt |
| Health trong output server đã build | Payload có `release: "5.20.1"`, khớp package server |
| Worker trong output web đã build | Cache `mindcanvas-shell-v5.20.1`; không còn placeholder |
| Root/web/server/lockfile | Cùng 5.20.1 |
| Migration | Test toàn bộ số migration đạt; giữ 0031 thông báo và 0032 Lab |

### Điều kiện chạy web trong môi trường này

Lệnh test/build thông thường ban đầu bị lỗi `EPERM` của `fs.realpathSync.native` trên Windows, kể cả file bình thường trong workspace. Đã dùng một config tạm ngoài project: kế thừa nguyên config Vite của project và đặt `resolve.preserveSymlinks = true` để tránh syscall đó. Test dùng pool forks, ba worker. Config tạm không nằm trong ZIP và không thay đổi cấu hình phát hành.

Test web cuối chạy qua script test sẵn có với config tạm; thời lượng 63,06 giây. Build web chạy Vite trên `apps/web` với cùng config tạm sau khi typecheck đạt. Vì vậy không ghi nhận lệnh `npm run build` thông thường là đã đạt trong sandbox này; build web với điều chỉnh môi trường và build server riêng đã đạt.

Node local là 24.14.1. Vite được cài trong nguồn là 7.3.6, plugin React 5.2.0; metadata của cả hai yêu cầu Node `^20.19.0 || >=22.12.0`, nên Node local phù hợp. `render.yaml` vẫn ghi Node 20; chưa đối chiếu runtime production thực tế và không tự thay cấu hình Render.

## Những tình huống được kiểm thử

- Web: 10 test cấu hình Supabase kiểm tra publishable, anon, rỗng, khoảng trắng, thiếu khóa/URL; client không được tạo nếu chưa đủ cấu hình, tùy chọn giữ phiên vẫn nguyên.
- Server: 9 test cấu hình trong tiến trình riêng kiểm tra ưu tiên/fallback và trạng thái cấu hình; khóa dùng để test là dữ liệu giả. Hai test health bảo vệ version package và tập trường public.
- PWA: 13 test chạy chính mã worker trong VM với CacheStorage/fetch giả lập: install shell/assets đúng phiên bản, giữ cache cũ lúc chờ, activate chỉ xóa shell cũ, offline đúng cache, không lấy asset từ cache cũ, không ghi HTTP 503 đè shell tốt, cache đầy/không dùng được vẫn trả mạng, từ chối cập nhật tự động, không intercept API/cross-origin/POST và install lỗi giữ shell cũ.
- Hồi quy toàn bộ web bao gồm Canvas, workspace, Lab gallery/editor/viewer, IndexedDB, cloud mock, quiz, lớp học và auth.
- Ba lỗi có sẵn trong nguồn nền đã tái hiện rồi sửa, các test cũ được giữ nguyên: đọc kho tài liệu của tài khoản báo lỗi thay vì danh sách rỗng; ba nhãn trang tài liệu theo tiếng Anh; xóa dấu nhớ tài khoản trước sự kiện đăng xuất. Thêm test khôi phục dấu nhớ khi sign-out ném lỗi mạng.
- File migration 0018 `_FIXED` bị trùng số đã được xác nhận giống hệt byte với 0018 chính trước khi loại khỏi bản sao nguồn. Hướng dẫn xóa khi áp dụng có trong RELEASE và manifest.

## Chưa kiểm chứng thực tế

- HTTP GET `/api/health`: tiến trình server đã khởi động nhưng kết nối localhost bị sandbox chặn `EACCES`; payload nguồn và output build đã được kiểm tra trực tiếp. Không ghi nhận HTTP endpoint là đã đạt.
- Nâng cấp PWA đã cài bằng Chrome/Brave/mobile, fullscreen, hành vi offline thật và phiên đăng nhập sau F5.
- Supabase thật: OAuth, RPC/RLS nhiều tài khoản, schema 0032, quota và đồng bộ nhiều tab/thiết bị.
- Production: commit, runtime Node, badge, health và asset đang chạy.

Không push/deploy, chạy SQL hoặc truy cập tài khoản thật. Không đưa `.env`, secret, dependency hay output build vào ZIP. Các cảnh báo React `act(...)` trong test và cảnh báo bundle lớn vẫn tồn tại; không có test thất bại ở lượt chạy cuối.
