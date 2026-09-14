# Chia trận Pickleball

Web app tĩnh để xếp lịch đánh Pickleball và ghi kết quả từng trận. Thiết kế ưu tiên điện thoại —
chạm vào trận là nhập được điểm ngay tại sân. Không cần cài đặt, không cần server.

Đồng bộ nhiều người qua Firebase là **tuỳ chọn** — không cấu hình thì app vẫn chạy đầy đủ ở chế độ lưu-trên-máy.

## Hai màn hình, mở bằng menu ☰ ở góc trái trên

### 1. Danh sách người chơi

Tạo được **nhiều danh sách** (nhóm tối thứ 3, nhóm cuối tuần, giải nội bộ…), mỗi danh sách độc lập.
Mỗi dòng gồm **Tên · Giới tính · Rating · Chơi** (tick chọn ai có mặt buổi này).

- Giới tính bấm một phát là đổi Nam ⇄ Nữ
- Nhập hàng loạt bằng dán text: `Tên, Nam/Nữ, Rating` mỗi dòng
- Xoá một danh sách sẽ xoá luôn các buổi trận dùng nó (có cảnh báo trước)

### 2. Tạo trận

Tạo được **nhiều buổi trận**, mỗi buổi có tên riêng (mặc định `Buổi 14/9`, đổi được).

**Tuỳ chọn chia:**

| | |
|---|---|
| Chế độ | Đôi nam nữ · Tách nam nữ · Ngẫu nhiên tự do |
| Số sân | bao nhiêu trận chạy song song mỗi vòng |
| Ván tối thiểu / tối đa mỗi người | |
| Số người tối đa | 0 = lấy hết |
| **Lệch rating tối đa** | chênh lệch tổng rating giữa 2 đội mỗi trận, 0 = không giới hạn |
| **Bỏ qua rating** | chia không quan tâm trình độ, và ẩn rating khỏi thẻ trận |

Mỗi thẻ trận hiện sẵn mức lệch; trận nào vượt ngưỡng sẽ được tô màu cảnh báo.

**Ghi kết quả:** chạm vào bất kỳ trận nào → mở bảng nhập điểm với nút +/− cỡ lớn.
Điểm cao hơn tự được đánh dấu thắng, hoặc chạm thẳng vào một đội để chọn đội thắng.

**Bảng thống kê** nằm ngay đầu màn hình, cập nhật tức thì: số trận đã đấu, thắng, thua, hiệu số điểm,
xếp hạng theo số trận thắng.

## Thuật toán chia

Mỗi vòng ưu tiên người **đánh ít ván nhất**, rồi **nghỉ lâu nhất**.

Với nhóm đã chọn, app xáo ngẫu nhiên 24 lần; **mỗi lần đều được tinh chỉnh** bằng cách liên tục thử đổi chỗ
hai người và giữ lại nếu điểm phạt giảm, cho tới khi không cải thiện được nữa. Phép đổi chỗ gồm cả việc thay
người trên sân bằng người đang nghỉ **có cùng số ván và cùng số vòng nghỉ** — mở rộng không gian tìm kiếm mà
không hy sinh tính công bằng.

Điểm phạt gồm: trùng bạn cùng đội (nặng, theo bình phương số lần), trùng đối thủ (nhẹ),
lệch rating theo **bình phương**, cộng một bậc phạt lớn nếu vượt ngưỡng "lệch rating tối đa".

### Đánh đổi cần biết

Siết ngưỡng lệch càng chặt thì càng nhiều cặp phải đánh chung lại lần nữa. Đo trên nhóm 16 người, 2 sân:

| Ngưỡng | Đôi nam nữ: lệch max / cặp trùng | Tách nam nữ: lệch max / cặp trùng |
|---|---|---|
| tắt (0) | 3.00 / 0 trên 32 cặp | 2.75 / 8 trên 24 cặp |
| 1.5 | 1.50 / 0.4 | 1.50 / 11.5 |
| **1.0** *(mặc định)* | **1.00 / 1.3** | 1.50 / 14.5 |
| 0.5 | 1.25 / 4.1 | 1.25 / 14.7 |

Mặc định 1.0 rất hợp với **đôi nam nữ**. Với **tách nam nữ** thì không gian lựa chọn hẹp hơn nhiều
(chỉ ghép được trong cùng giới), nên 1.5–2.0 thường hợp lý hơn. App sẽ tự cảnh báo khi ngưỡng đang
là nguyên nhân chính làm cặp trùng tăng.

## Cấu trúc

```
index.html              giao diện — drawer, 2 màn hình, sheet nhập điểm
css/app.css             style mobile-first, tự đổi màu theo light/dark của máy
js/scheduler.js         thuật toán chia trận + thống kê — thuần tuý, chạy được cả trong Node
js/store.js             trạng thái: nhiều danh sách, nhiều buổi trận, lưu localStorage
js/sync.js              đồng bộ Firestore (nạp SDK bằng dynamic import)
js/app.js               giao diện, nối 3 file trên
js/firebase-config.js   cấu hình Firebase — để trống = chạy ngoại tuyến
firestore.rules         security rules, dán vào Firebase Console
FIREBASE.md             hướng dẫn bật đồng bộ nhiều người
```

Không dùng thư viện ngoài nào. Firebase SDK chỉ được tải khi bấm **Kết nối**,
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
