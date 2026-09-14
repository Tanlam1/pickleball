# Chia trận Pickleball

Web app tĩnh để xếp lịch đánh Pickleball và ghi kết quả từng trận. Thiết kế ưu tiên điện thoại —
chạm vào trận là nhập được điểm ngay tại sân. Không cần cài đặt, không cần server.

## Vào nhóm

Mở app là phải **chọn nhóm trước** — nhập mã nhóm rồi mới thấy dữ liệu của nhóm đó.
Cả nhóm dùng chung một mã sẽ thấy cùng dữ liệu, cập nhật ngay tức thì.

- Mỗi nhóm có **cache riêng trên máy** (`pb_room_<mã nhóm>`), nên đổi qua lại giữa các nhóm
  không bao giờ lẫn dữ liệu
- Màn hình vào nhóm nhớ sẵn các nhóm gần đây, bấm một phát là vào
- Mở bằng **link mời** (`...#room=ma-nhom`) thì vào thẳng, không phải nhập
- Mất mạng mà nhóm đó đã từng vào: có nút **dùng dữ liệu đã lưu**, sửa bình thường,
  bấm **Kết nối lại** trong menu khi có mạng
- Đổi nhóm bất cứ lúc nào bằng nút **Đổi nhóm** trong menu ☰

Mã nhóm đóng vai trò như mật khẩu chung — ai biết mã thì xem và sửa được. Nên đặt mã khó đoán.

Chưa cấu hình Firebase thì app bỏ qua bước này và chạy ở chế độ một máy (xem [FIREBASE.md](FIREBASE.md)).

## Ba màn hình, mở bằng menu ☰ ở góc trái trên

### 1. Danh sách người chơi

Tạo được **nhiều danh sách** (nhóm tối thứ 3, nhóm cuối tuần, giải nội bộ…), mỗi danh sách độc lập.
Mỗi dòng gồm **Tên · Giới tính · Rating · Chơi** (tick chọn ai có mặt buổi này).

- Giới tính bấm một phát là đổi Nam ⇄ Nữ
- Nhập hàng loạt bằng dán text: `Tên, Nam/Nữ, Rating` mỗi dòng
- Xoá một danh sách sẽ xoá luôn các buổi trận dùng nó (có cảnh báo trước)

### 2. Danh sách đội — theo ngày

1. **Ngày tạo đội** — chọn ngày
2. **Danh sách đội** — mỗi ngày tạo được nhiều danh sách đội khác nhau
3. **Tạo đội** — bốn kiểu, kiểu nào cũng ghép **mạnh với yếu** để các đội ngang trình độ nhau:

| Kiểu | Ghép |
|---|---|
| **Đôi nam** | chỉ nam với nam |
| **Đôi nữ** | chỉ nữ với nữ |
| **Đôi nam nữ** | 1 nam + 1 nữ (nam mạnh ghép nữ yếu); bên nào dư thì ghép cùng giới |
| **Ngẫu nhiên** | không phân biệt giới tính |

Đội là **cặp 2 người cố định**, gắn với một danh sách người chơi và dùng lại cho mọi buổi trận.

Ghép tự động bằng một nút, ba kiểu:

| Kiểu | Cách ghép |
|---|---|
| **Cân bằng trình độ** | mạnh nhất ghép yếu nhất, để các đội đều sức nhau |
| **Đôi nam nữ** | mỗi đội 1 nam + 1 nữ; phần dư ghép cùng giới |
| **Ngẫu nhiên** | bốc thăm |

**Chỉ người đang tick "Chơi" mới được ghép đội** — ai chưa tick thì bỏ qua hoàn toàn, và app báo rõ
đã bỏ qua bao nhiêu người. Ghép thủ công cũng chỉ liệt kê người đang tick.

Mỗi đội đặt được tên riêng (để trống thì hiện tên 2 người). Số người lẻ sẽ được báo rõ.

Đội đã ghép thì **cố định**: nếu hôm nào có người vắng (bỏ tick), đội đó chỉ tạm không tham gia buổi
trận chứ không bị xoá — tick lại là dùng được ngay. Chỉ khi bấm ghép lại thì toàn bộ đội mới bị thay.

### 3. Tạo trận — theo ngày

1. **Ngày thi đấu** — chọn ngày
2. **Danh sách trận** — tự load các danh sách của ngày đó; chưa có thì tạo mới, tạo được nhiều
3. **Danh sách đội** — chọn dùng danh sách đội nào (ưu tiên gợi ý các danh sách cùng ngày)
4. **Số sân · Số trận mỗi đội** rồi bấm **Tạo trận ngẫu nhiên**. Bên dưới ô nhập có ước lượng
   sẵn sẽ ra khoảng bao nhiêu vòng, bao nhiêu trận. Nút **Tuỳ chọn khác** mở thêm:
   trận tối đa, số đội tối đa, lệch rating tối đa, bỏ qua rating
5. **Bảng xếp hạng** — hai tab: **Danh sách này** và **Cả ngày thi đấu** (gộp mọi danh sách trận trong ngày)

**Ghi kết quả:** chạm vào bất kỳ trận nào → bảng nhập điểm với nút +/− cỡ lớn.
Điểm cao hơn tự được đánh dấu thắng, hoặc chạm thẳng vào một đội để chọn.

Mỗi thẻ trận hiện sẵn mức lệch rating; trận nào vượt ngưỡng được tô màu cảnh báo.

## Thuật toán

### Ghép đội

Cả bốn kiểu đều xếp theo rating rồi **ghép mạnh nhất với yếu nhất**, nên các đội có tổng rating
gần bằng nhau. Riêng *Đôi nam nữ* ghép nam mạnh với nữ yếu (và ngược lại) để đạt cùng mục tiêu đó.
Chỉ lấy người đang tick **Chơi**.

### Xếp trận

Đơn vị xếp lịch là **đội**. Thứ tự ưu tiên, trọng số chênh nhau đủ lớn để mục tiêu trên
luôn thắng mục tiêu dưới:

1. **Không gặp lại đội đã đấu**
2. **Không đánh 2 trận liên tiếp**
3. **Hai đội ngang trình độ**

Mỗi vòng, app chọn các đội đánh ít trận nhất rồi xáo ngẫu nhiên 24 lần; **mỗi lần đều được tinh chỉnh**
bằng cách liên tục thử đổi chỗ hai đội (hoặc thay bằng đội đang nghỉ có cùng số trận) và giữ lại
nếu điểm phạt giảm, cho tới khi không cải thiện được nữa.

### Khi nào không tránh được

Đủ đội thì không cặp nào gặp lại nhau và không ai phải đánh liên tiếp. Đo được:

| Tình huống | Cặp đấu lặp | Đánh liên tiếp |
|---|---|---|
| 10 đội, 2 sân, 4 trận/đội | 0 | 0 |
| 8 đội, 2 sân, 3 trận/đội | 0 | 0 |
| 7 đội, 2 sân, 4 trận/đội | 0 | có (7 đội thì gần như ai cũng ra sân mỗi vòng) |
| 3 đội, 1 sân, 4 trận/đội | buộc phải lặp | buộc phải liên tiếp |

Ít đội quá thì hai mục tiêu đầu mâu thuẫn nhau — app vẫn xếp đủ trận và **báo rõ** cần bao nhiêu đội
để hết lặp. Muốn ít đánh liên tiếp thì cần số đội nhiều hơn 4 lần số sân.

## Cấu trúc

```
index.html              giao diện — drawer, 2 màn hình, sheet nhập điểm
css/app.css             style mobile-first, tự đổi màu theo light/dark của máy
js/scheduler.js         thuật toán chia trận + thống kê — thuần tuý, chạy được cả trong Node
js/store.js             trạng thái: nhiều danh sách, đội cố định, nhiều buổi trận, lưu localStorage
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
