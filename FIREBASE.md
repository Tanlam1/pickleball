# Bật đồng bộ nhiều người với Firebase

Mặc định app chạy **ngoại tuyến** — dữ liệu chỉ nằm trong trình duyệt của từng máy.
Làm theo hướng dẫn này để cả nhóm cùng thấy một danh sách người chơi và một lịch thi đấu, cập nhật ngay tức thì.

Toàn bộ mất khoảng **10 phút** và **miễn phí** với quy mô một CLB.

---

## Cách nó hoạt động

```
Máy A ──┐                                    ┌──> Máy B (thấy ngay)
        ├──> Firestore: rooms/cmc-pickleball ─┤
Máy C ──┘         (1 document)               └──> Máy D (thấy ngay)
```

- Mỗi nhóm dùng một **mã phòng** (ví dụ `cmc-pickleball`). Ai nhập đúng mã đó thì vào chung dữ liệu.
- Một phòng = một document Firestore chứa `rosters` (các danh sách người chơi) và `sessions` (các buổi trận, kèm lịch và điểm đã nhập).
- Ai sửa gì, các máy khác nhận được sau chưa tới 1 giây qua `onSnapshot` (real-time listener).
- Nhập điểm được đẩy lên **ngay lập tức**; sửa danh sách thì gom lại 700ms rồi mới ghi một lần.
- Đăng nhập **ẩn danh** — không ai phải tạo tài khoản.
- Mất mạng vẫn dùng được bình thường, dữ liệu vẫn lưu trên máy.

---

## Bước 1 — Tạo project Firebase

1. Vào https://console.firebase.google.com → **Create a project** (hoặc **Add project**)
2. Đặt tên, ví dụ `pickleball-cmc`
3. Google Analytics: **tắt** đi cho gọn (không cần)
4. Bấm **Create project**, đợi ~30 giây

## Bước 2 — Tạo Web app và lấy config

1. Ở trang tổng quan project, bấm biểu tượng **`</>`** (Web)
2. App nickname: `pickleball` → **Register app**
   *(Không tick "Also set up Firebase Hosting" — ta dùng GitHub Pages)*
3. Màn hình tiếp theo hiện đoạn code có `const firebaseConfig = { ... }` → **copy phần trong ngoặc nhọn**
4. Mở [js/firebase-config.js](js/firebase-config.js) và dán các giá trị vào:

```js
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...........",
  authDomain:        "pickleball-cmc.firebaseapp.com",
  projectId:         "pickleball-cmc",
  storageBucket:     "pickleball-cmc.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdef123456"
};
```

> Nếu lỡ đóng màn hình đó: **⚙ Project settings → General → Your apps → SDK setup and configuration → Config**.

## Bước 3 — Tạo Firestore Database

1. Menu trái → **Build → Firestore Database** → **Create database**
2. **Location**: chọn `asia-southeast1 (Singapore)` — gần Việt Nam nhất, độ trễ thấp nhất.
   ⚠️ **Chọn xong không đổi được nữa.**
3. Chọn **Start in production mode** (bước sau ta dán rules riêng).
   *Đừng chọn test mode — rules của nó tự hết hạn sau 30 ngày và app sẽ ngừng hoạt động.*
4. **Create**

## Bước 4 — Bật đăng nhập ẩn danh

1. Menu trái → **Build → Authentication** → **Get started**
2. Tab **Sign-in method** → chọn **Anonymous** → gạt **Enable** → **Save**

> Bỏ qua bước này sẽ gặp lỗi `configuration-not-found` khi bấm Kết nối.

## Bước 5 — Dán Security Rules

1. **Firestore Database** → tab **Rules**
2. Xoá hết nội dung có sẵn, dán toàn bộ nội dung file [firestore.rules](firestore.rules)
3. **Publish**

Rules này cho phép: ai đăng nhập được (kể cả ẩn danh) **và** biết mã phòng thì đọc/ghi phòng đó.
Đồng thời chặn ghi rác (sai field, quá 200 người chơi) và cấm xoá phòng.

## Bước 6 — Cho phép tên miền GitHub Pages

1. **Authentication → Settings → Authorized domains → Add domain**
2. Thêm `<username>.github.io` (thay `<username>` bằng tài khoản GitHub của bạn)

`localhost` đã có sẵn nên test trên máy không cần thêm gì.

## Bước 7 — Kiểm tra bằng script

```bash
node tools/check-firebase.js
```

Script gọi thẳng Firebase REST API bằng đúng luồng mà app dùng (đăng nhập ẩn danh → đọc → ghi),
và chỉ ra chính xác bước nào chưa xong:

```
[1/5] Đọc js/firebase-config.js .......... OK  project: pickleball-cmc
[2/5] Đăng nhập ẩn danh .................. OK
[3/5] Firestore Database + quyền đọc ..... OK
[4/5] Ghi dữ liệu hợp lệ ................. OK
[5/5] Rules chặn dữ liệu sai định dạng ... OK
```

Bước 5 quan trọng: nó thử ghi dữ liệu sai định dạng và **mong đợi bị từ chối**.
Nếu ghi được, nghĩa là Rules chưa áp dụng — database của bạn đang mở cho cả thế giới.

## Bước 8 — Chạy thử trên máy

Đăng nhập Firebase **không chạy được từ `file://`**, nên phải mở qua web server:

```bash
python -m http.server 8000
```

Mở http://localhost:8000 → nhập mã phòng (vd `cmc-pickleball`) → **Kết nối**.
Đèn chuyển **xanh lá** + dòng chữ "Đang đồng bộ" là xong.

Kiểm tra thật: mở thêm một cửa sổ ẩn danh vào cùng địa chỉ, nhập cùng mã phòng, thêm một người chơi —
cửa sổ kia phải cập nhật ngay.

## Bước 9 — Đưa lên GitHub Pages

```powershell
git add -A
git commit -m "Bat dong bo Firebase"
git push
```

Vài phút sau vào `https://<username>.github.io/pickleball/`.

---

## Dùng hàng ngày

| Việc | Cách làm |
|---|---|
| Lập phòng cho CLB | Nhập mã phòng bất kỳ → **Kết nối**. Chưa có thì app tự tạo bằng dữ liệu đang có trên máy bạn. |
| Mời cả nhóm | Bấm **Copy link mời** → dán vào group chat. Ai mở link sẽ tự vào phòng. |
| Tạm tách ra làm riêng | Bấm **Ngắt**. Dữ liệu vẫn còn trên máy, chỉ không đồng bộ nữa. |

Mã phòng hợp lệ: 3–32 ký tự, chữ thường / số / dấu gạch ngang. App tự chuẩn hoá (`CMC Pickleball!!` → `cmc-pickleball`).

---

## Chi phí

Gói **Spark (miễn phí)** của Firebase, tại thời điểm viết, cho khoảng **50.000 lượt đọc** và **20.000 lượt ghi** mỗi ngày.

Ước tính thực tế: 15 người cùng mở app, mỗi lần ai đó sửa gì thì **mỗi máy đang mở tốn 1 lượt đọc**.
Một buổi chia trận sửa vài chục lần ⇒ khoảng vài trăm lượt đọc. Còn rất xa hạn mức.

App đã gom thay đổi (debounce 700ms) nên gõ liên tục không tạo ra hàng loạt lượt ghi.

Hạn mức có thể đổi — kiểm tra tại https://firebase.google.com/pricing

---

## Về bảo mật

**`apiKey` lộ ra trong code là bình thường.** Mọi Firebase web app đều vậy — nó chỉ định danh project chứ không phải mật khẩu. Không cần giấu, không cần `.gitignore`. Bảo vệ dữ liệu là việc của Security Rules.

**Giới hạn của mô hình hiện tại:** ai biết mã phòng thì sửa được phòng đó. Với một CLB quen biết nhau thì ổn — đặt mã phòng khó đoán một chút (vd `cmc-pkb-2026-x7q`) là đủ.

**Xung đột khi sửa cùng lúc:** cả phòng là một document, ghi sau đè ghi trước. Nếu hai người cùng thao tác trong vòng dưới một giây, một thay đổi có thể bị mất.

Điều này đáng lưu ý nhất khi **nhiều người cùng ghi điểm trên các sân khác nhau**. App đã thu hẹp khoảng trống bằng cách đẩy điểm lên ngay khi bấm Lưu (không chờ debounce), nên rủi ro thấp — nhưng không phải bằng không.

Cách làm an toàn: **để một người phụ trách nhập điểm cho cả buổi.** Người khác vẫn xem được mọi thứ theo thời gian thực.

Muốn nhiều người cùng ghi điểm thật sự an toàn thì phải tách mỗi buổi trận thành một document riêng (`rooms/{id}/sessions/{sessionId}`), khi đó hai người ghi hai buổi khác nhau sẽ không đè nhau.

### Muốn siết chặt: chỉ người phụ trách được sửa

Đổi sang đăng nhập Google và chỉ cho phép một số tài khoản ghi:

```js
// firestore.rules — thay phần allow
function isAdmin() {
  return request.auth != null && request.auth.token.email in [
    'nguoiphutrach@gmail.com',
    'phogiai@gmail.com'
  ];
}
allow read:           if request.auth != null && validId();
allow create, update: if isAdmin() && validId() && validData();
```

Kèm theo, trong [js/sync.js](js/sync.js) đổi `signInAnonymously` thành `signInWithPopup` + `GoogleAuthProvider`,
và bật **Google** trong Authentication → Sign-in method.
Kết quả: ai cũng xem được lịch, chỉ người phụ trách sửa được.

---

## Lỗi thường gặp

App đã dịch sẵn các lỗi Firebase sang tiếng Việt và hiện ngay cạnh đèn trạng thái.

| Thông báo | Nguyên nhân | Cách sửa |
|---|---|---|
| Chưa bật Anonymous... | Thiếu bước 4 | Authentication → Sign-in method → bật Anonymous |
| Firestore Rules chặn | Rules chưa đúng | Dán lại [firestore.rules](firestore.rules), bấm Publish |
| apiKey sai | Copy thiếu/thừa | Kiểm tra lại [js/firebase-config.js](js/firebase-config.js) |
| Chưa tạo Firestore Database | Thiếu bước 3 | Build → Firestore Database → Create database |
| Tên miền chưa được phép | Thiếu bước 6 | Authentication → Settings → Authorized domains |
| Không kết nối được mạng | Mất mạng / bị chặn | App vẫn dùng offline được bình thường |

**Đèn không đổi màu, không có lỗi gì:** mở Console trình duyệt (F12). Nếu thấy lỗi CORS hoặc module,
nhiều khả năng bạn đang mở bằng `file://` — phải chạy qua `python -m http.server`.

**Muốn quay về ngoại tuyến:** xoá các giá trị trong [js/firebase-config.js](js/firebase-config.js) về chuỗi rỗng.
