# Chia trận Pickleball

Web app tĩnh (1 file, không cần server) để xếp lịch đánh Pickleball theo số sân,
đảm bảo số ván tối thiểu cho mỗi người, hạn chế trùng cặp và cân bằng trình độ.

## Chức năng

- **Quản lý người chơi** — tên, giới tính, Pickleball rating; sửa trực tiếp trên bảng, tick chọn ai tham gia buổi này. Nhập hàng loạt bằng dán text (`Tên, Nam/Nữ, Rating`). Dữ liệu lưu trong localStorage của trình duyệt.
- **3 chế độ chia trận**
  - *Đôi nam nữ* — mỗi đội 1 nam + 1 nữ
  - *Tách nam nữ* — đôi nam riêng, đôi nữ riêng; số sân tự chia theo tỉ lệ nhu cầu 2 bên
  - *Ngẫu nhiên tự do* — không phân biệt giới tính
- **Ràng buộc** — số sân, số ván tối thiểu / tối đa mỗi người, giới hạn số người mỗi lần chia
- **Tối ưu** — ưu tiên người đánh ít ván và nghỉ lâu nhất; tránh lặp lại bạn cùng đội / đối thủ; cân bằng tổng rating 2 đội trong mỗi ván
- **Kết quả** — lịch theo từng vòng (ai đánh sân nào, ai nghỉ), bảng thống kê số ván mỗi người, cảnh báo khi không thể đáp ứng ràng buộc
- **Xuất** — copy dạng text để dán vào nhóm chat, hoặc in / lưu PDF

## Cấu trúc

- `index.html` — toàn bộ app (HTML + CSS + JS trong một file, không phụ thuộc thư viện ngoài)
- `.nojekyll` — tắt Jekyll của GitHub Pages

## Xem thử trên máy

Mở trực tiếp `index.html` bằng trình duyệt, hoặc:

```bash
python -m http.server 8000
```

rồi mở http://localhost:8000

## Deploy

Push lên nhánh `main`, sau đó vào **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
Trang sẽ có tại `https://<username>.github.io/<tên-repo>/` sau khoảng 1–2 phút.
