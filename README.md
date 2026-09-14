# Chia trận Pickleball

Web app tĩnh để xếp lịch đánh Pickleball theo số sân, đảm bảo số ván tối thiểu cho mỗi người,
hạn chế trùng cặp và cân bằng trình độ. Không cần cài đặt, không cần server.

Đồng bộ nhiều người qua Firebase là **tuỳ chọn** — không cấu hình thì app vẫn chạy đầy đủ ở chế độ lưu-trên-máy.

## Chức năng

- **Quản lý người chơi** — tên, giới tính, Pickleball rating; sửa trực tiếp trên bảng, tick chọn ai tham gia buổi này. Nhập hàng loạt bằng dán text (`Tên, Nam/Nữ, Rating`).
- **3 chế độ chia trận**
  - *Đôi nam nữ* — mỗi đội 1 nam + 1 nữ
  - *Tách nam nữ* — đôi nam riêng, đôi nữ riêng; số sân tự chia theo bên nào đang thiếu ván hơn
  - *Ngẫu nhiên tự do* — không phân biệt giới tính
- **Ràng buộc** — số sân, số ván tối thiểu / tối đa mỗi người, giới hạn số người mỗi lần chia
- **Tối ưu** — ưu tiên người đánh ít ván và nghỉ lâu nhất; tránh lặp bạn cùng đội / đối thủ; cân bằng tổng rating 2 đội mỗi ván
- **Kết quả** — lịch theo từng vòng (ai đánh sân nào, ai nghỉ), thống kê số ván mỗi người, cảnh báo khi không đáp ứng được ràng buộc
- **Xuất** — copy dạng text để dán vào nhóm chat, hoặc in / lưu PDF
- **Đồng bộ nhóm** *(tuỳ chọn)* — mã phòng chung qua Firebase Firestore, mọi thay đổi hiện ngay với cả nhóm

## Cấu trúc

```
index.html              giao diện
css/app.css             style (tự đổi màu theo light/dark của máy)
js/scheduler.js         thuật toán chia trận — thuần tuý, chạy được cả trong Node
js/sync.js              đồng bộ Firestore (nạp SDK bằng dynamic import)
js/app.js               nối giao diện với 2 file trên
js/firebase-config.js   cấu hình Firebase — để trống = chạy ngoại tuyến
firestore.rules         security rules, dán vào Firebase Console
FIREBASE.md             hướng dẫn bật đồng bộ nhiều người
```

Không dùng thư viện ngoài nào. Firebase SDK chỉ được tải khi bạn bấm **Kết nối**,
nên app vẫn chạy đầy đủ khi không có mạng hoặc chưa cấu hình gì.

## Chạy thử trên máy

```bash
python -m http.server 8000
```

rồi mở http://localhost:8000

Mở thẳng `index.html` bằng trình duyệt cũng được, nhưng phần đồng bộ Firebase sẽ không hoạt động
(đăng nhập Firebase không chạy từ `file://`).

## Deploy lên GitHub Pages

Push lên nhánh `main`, sau đó vào **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
Trang sẽ có tại `https://<username>.github.io/<tên-repo>/` sau khoảng 1–2 phút.

Nhớ thêm tên miền đó vào **Authorized domains** của Firebase nếu bạn bật đồng bộ — xem [FIREBASE.md](FIREBASE.md).
