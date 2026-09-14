/* Dán cấu hình Firebase của bạn vào đây.
   Lấy ở: Firebase Console > ⚙ Project settings > General > Your apps > Web app > SDK setup and configuration > Config

   Để trống = app chạy ở chế độ ngoại tuyến (chỉ lưu trên máy này), phần đồng bộ sẽ bị ẩn.

   Các giá trị này CÔNG KHAI là bình thường — Firebase web app nào cũng lộ apiKey.
   Nó chỉ định danh project, không phải mật khẩu. Bảo mật nằm ở firestore.rules.
   Xem FIREBASE.md để biết cách siết quyền. */

window.FIREBASE_CONFIG = {
  apiKey:            "",
  authDomain:        "",
  projectId:         "",
  storageBucket:     "",
  messagingSenderId: "",
  appId:             ""
};
