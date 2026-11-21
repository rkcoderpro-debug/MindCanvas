# MindCanvas V2.4 — Save Checkpoint Shortcut

V2.4 nối nút Save hiện tại với Version History của V2.3: mỗi lần người dùng bấm Save, board được flush và tạo một checkpoint ổn định. Vì vậy không cần mở lịch sử để lưu mốc thủ công.

## Đã thay đổi

- Badge giao diện đổi thành `V2.4`.
- Nút Save tạo checkpoint sau khi flush thành công.
- Lỗi lưu được hiển thị trong error banner, không bị nuốt.

## Deploy

Giải nén gói source V2.4 đè vào project, sau đó chạy:

```bash
npm run typecheck
npm run build
npm test

git add apps/web/src/App.tsx PROJECT_HANDOFF.md V2_4_SAVE_CHECKPOINT_VI.md
git commit -m "feat: make manual save create a recovery checkpoint"
git pull --rebase origin main
git push origin main
```

Chỉ cần deploy lại `mindcanvas-web`. Migration `0003_note_versions.sql` của V2.3 vẫn cần được chạy một lần trên Supabase; không có migration mới cho V2.4.
