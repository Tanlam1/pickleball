/* sync.js — đồng bộ nhiều người qua Firebase Firestore.
   SDK được nạp bằng dynamic import() nên nếu bạn chưa cấu hình Firebase (hoặc đang offline)
   thì app vẫn chạy bình thường ở chế độ lưu-trên-máy. */
(function (root) {
'use strict';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
const DEBOUNCE = 700;          // gom nhiều thay đổi liên tiếp thành 1 lần ghi

/* Mỗi tab một id riêng, để bỏ qua snapshot do chính mình vừa ghi */
const clientId = 'c' + Math.random().toString(36).slice(2, 10);

let fb = null, ref = null, unsub = null;
let statusCb = function(){};
let timer = null, queued = null;

function configured(){
  const c = root.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId);
}

async function loadSDK(){
  if(fb) return fb;
  const [app, auth, store] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
  ]);
  const a = app.initializeApp(root.FIREBASE_CONFIG);
  fb = { store, auth: auth.getAuth(a), signIn: auth.signInAnonymously, db: store.getFirestore(a) };
  return fb;
}

/* Dịch lỗi Firebase sang tiếng Việt cho dễ xử lý */
function friendly(e){
  const code = (e && (e.code || e.message)) || String(e);
  if(/api-key-not-valid|invalid-api-key/.test(code)) return 'apiKey sai — kiểm tra lại js/firebase-config.js.';
  if(/configuration-not-found/.test(code))           return 'Chưa bật Anonymous trong Authentication > Sign-in method.';
  if(/auth\/unauthorized-domain/.test(code))         return 'Tên miền chưa được phép — thêm vào Authentication > Settings > Authorized domains.';
  if(/permission-denied/.test(code))                 return 'Firestore Rules chặn — dán lại nội dung firestore.rules.';
  if(/not-found|NOT_FOUND/.test(code))               return 'Chưa tạo Firestore Database trong project.';
  if(/unavailable|network|offline/i.test(code))      return 'Không kết nối được mạng.';
  return code;
}

/* Trả về dữ liệu sẵn có của phòng, hoặc null nếu phòng chưa tồn tại */
async function connect(roomId, onRemote, onStatus){
  statusCb = onStatus || function(){};
  statusCb('connecting');
  try{
    const f = await loadSDK();
    await f.signIn(f.auth);
    ref = f.store.doc(f.db, 'rooms', roomId);
    const first = await f.store.getDoc(ref);

    unsub = f.store.onSnapshot(ref,
      s => {
        if(!s.exists()) return;
        const d = s.data();
        if(d.updatedBy === clientId) return;      // bỏ qua tiếng vọng của chính mình
        onRemote(d);
      },
      e => statusCb('error', friendly(e))
    );
    statusCb('live');
    return first.exists() ? first.data() : null;
  }catch(e){
    ref = null;
    statusCb('error', friendly(e));
    throw e;
  }
}

function disconnect(){
  if(unsub) unsub();
  unsub = null; ref = null; queued = null;
  clearTimeout(timer);
  statusCb('off');
}

function connected(){ return !!ref; }

/* now = true (vừa nhập điểm) -> ghi ngay, thu hẹp khoảng trống có thể xung đột */
function push(data, now){
  if(!ref) return;
  queued = data;
  clearTimeout(timer);
  if(now) flush(); else timer = setTimeout(flush, DEBOUNCE);
}

async function flush(){
  if(!ref || !queued) return;
  const d = queued;
  queued = null;
  try{
    await fb.store.setDoc(ref, Object.assign({}, d, {
      updatedAt: fb.store.serverTimestamp(),
      updatedBy: clientId,
    }));
  }catch(e){
    statusCb('error', friendly(e));
  }
}

root.PBSync = { clientId, configured, connect, disconnect, connected, push };

})(window);
