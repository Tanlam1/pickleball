/* Dán cấu hình Firebase của bạn vào đây.
   Lấy ở: Firebase Console > ⚙ Project settings > General > Your apps > Web app > Config

   Để trống = app chạy ở chế độ ngoại tuyến (chỉ lưu trên máy này), phần đồng bộ sẽ bị ẩn.

   Các giá trị này CÔNG KHAI là bình thường — Firebase web app nào cũng lộ apiKey.
   Nó chỉ định danh project, không phải mật khẩu. Bảo mật nằm ở firestore.rules.

   Điền xong, chạy:  node tools/check-firebase.js   để kiểm tra đã đúng chưa. */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcjfCy_FF11XZYfCQJfNGMc0k0ZLFy0c4",
  authDomain: "pickleball-cmc.firebaseapp.com",
  projectId: "pickleball-cmc",
  storageBucket: "pickleball-cmc.firebasestorage.app",
  messagingSenderId: "1024576512759",
  appId: "1:1024576512759:web:e4744851f8ec59f0fa69f2"
};
