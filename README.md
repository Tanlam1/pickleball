# CMC Pickleball

Trang tĩnh (static site) host trên GitHub Pages.

## Cấu trúc

- `index.html` — toàn bộ nội dung trang (HTML + CSS trong một file)
- `.nojekyll` — tắt Jekyll của GitHub Pages, giúp file/thư mục bắt đầu bằng `_` không bị bỏ qua

## Xem thử trên máy

Mở trực tiếp `index.html` bằng trình duyệt, hoặc chạy:

```bash
python -m http.server 8000
```

rồi mở http://localhost:8000

## Deploy

Push lên nhánh `main`, sau đó vào **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
Trang sẽ có tại `https://<username>.github.io/<tên-repo>/` sau khoảng 1–2 phút.
