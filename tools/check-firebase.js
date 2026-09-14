/* Kiểm tra cấu hình Firebase đã đúng chưa.
   Chạy:  node tools/check-firebase.js

   Script gọi thẳng Firebase REST API bằng đúng luồng mà app dùng
   (đăng nhập ẩn danh -> đọc -> ghi), nên nếu nó báo OK thì app chạy được. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEST_ROOM = 'kiem-tra-cai-dat';
const W = 42;   // độ rộng cột để căn dấu chấm

let step = 0;
const TOTAL = 5;
function begin(label){
  step++;
  process.stdout.write(`[${step}/${TOTAL}] ${label} `.padEnd(W, '.') + ' ');
}
function pass(note){ console.log('OK' + (note ? '  ' + note : '')); }
function fail(title, ...fixes){
  console.log('CHƯA ĐƯỢC');
  console.log('\n  ✗ ' + title);
  if(fixes.length){
    console.log('\n  Cách sửa:');
    fixes.forEach(f => console.log('    • ' + f));
  }
  console.log('');
  process.exit(1);
}

console.log('\nKIỂM TRA CẤU HÌNH FIREBASE\n');

/* ---------------- 1. đọc config ---------------- */
begin('Đọc js/firebase-config.js');
let cfg;
try{
  const src = fs.readFileSync(path.join(ROOT, 'js', 'firebase-config.js'), 'utf8');
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  cfg = ctx.window.FIREBASE_CONFIG;
}catch(e){
  fail('Không đọc được file: ' + e.message);
}
if(!cfg || !cfg.apiKey || !cfg.projectId){
  fail('File còn để trống.',
    'Vào Firebase Console > ⚙ Project settings > General > Your apps > Web app > Config',
    'Copy các giá trị và dán vào js/firebase-config.js');
}
const miss = ['apiKey','authDomain','projectId','appId'].filter(k => !cfg[k]);
if(miss.length) fail('Thiếu các trường: ' + miss.join(', '), 'Copy lại toàn bộ khối firebaseConfig từ Firebase Console');
pass(`project: ${cfg.projectId}`);

/* ---------------- 2. đăng nhập ẩn danh ---------------- */
async function main(){
  begin('Đăng nhập ẩn danh');
  let idToken;
  try{
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(cfg.apiKey)}`,
      { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ returnSecureToken: true }) });
    const j = await r.json();

    if(!r.ok){
      const msg = (j.error && j.error.message) || JSON.stringify(j);
      if(/API_KEY_INVALID|API key not valid/i.test(msg))
        fail('apiKey không hợp lệ.',
          'Kiểm tra lại apiKey trong js/firebase-config.js — copy nguyên vẹn, không thừa dấu cách');
      if(/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/i.test(msg))
        fail('Chưa bật đăng nhập ẩn danh.',
          'Firebase Console > Build > Authentication > Get started',
          'Tab "Sign-in method" > chọn Anonymous > gạt Enable > Save');
      if(/CONFIGURATION_NOT_FOUND/i.test(msg))
        fail('Project chưa bật Authentication.',
          'Firebase Console > Build > Authentication > Get started, rồi bật Anonymous');
      fail('Đăng nhập thất bại: ' + msg);
    }
    idToken = j.idToken;
  }catch(e){
    if(e.message && /fetch failed|ENOTFOUND|ETIMEDOUT/i.test(e.message))
      fail('Không kết nối được Internet.', 'Kiểm tra mạng rồi chạy lại');
    throw e;
  }
  pass();

  /* ---------------- 3. Firestore Database ---------------- */
  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents`;
  const auth = { Authorization: 'Bearer ' + idToken };

  begin('Firestore Database + quyền đọc');
  {
    const r = await fetch(`${base}/rooms/${TEST_ROOM}`, { headers: auth });
    const j = await r.json().catch(() => ({}));
    const msg = (j.error && j.error.message) || '';

    if(r.status === 404 && /database.*does not exist|Project.*does not exist/i.test(msg))
      fail('Chưa tạo Firestore Database.',
        'Firebase Console > Build > Firestore Database > Create database',
        'Location: chọn asia-southeast1 (Singapore) — chọn xong không đổi được',
        'Chọn "Start in production mode"');
    if(r.status === 403 && /PERMISSION_DENIED|insufficient permissions/i.test(msg))
      fail('Security Rules đang chặn cả việc đọc.',
        'Firestore Database > tab Rules > xoá hết, dán toàn bộ nội dung file firestore.rules > Publish');
    if(r.status === 403 && /Cloud Firestore API has not been used|SERVICE_DISABLED/i.test(msg))
      fail('Firestore API chưa được bật cho project.',
        'Firebase Console > Build > Firestore Database > Create database');
    /* 404 NOT_FOUND cho riêng document là bình thường — nghĩa là đọc được, chỉ là chưa có doc */
    if(!r.ok && r.status !== 404) fail(`Lỗi ${r.status}: ${msg}`);
  }
  pass();

  /* ---------------- 4. ghi dữ liệu hợp lệ ---------------- */
  begin('Ghi dữ liệu hợp lệ');
  const now = new Date().toISOString();
  /* Đúng bộ field mà app đẩy lên — nếu Rules trên Firebase còn cũ thì bước này sẽ bắt được */
  const goodDoc = {
    fields: {
      rosters:   { arrayValue: { values: [] } },
      teamSets:  { arrayValue: { values: [] } },
      sessions:  { arrayValue: { values: [] } },
      updatedBy: { stringValue: 'check-firebase' },
      updatedAt: { timestampValue: now },
    },
  };
  {
    const r = await fetch(`${base}/rooms/${TEST_ROOM}`, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify(goodDoc),
    });
    const j = await r.json().catch(() => ({}));
    const msg = (j.error && j.error.message) || '';
    if(r.status === 403)
      fail('Rules từ chối dữ liệu mà app đẩy lên — nhiều khả năng Rules trên Firebase còn là bản cũ.',
        'Mở firestore.rules trong thư mục dự án, copy TOÀN BỘ',
        'Firebase Console > Firestore Database > tab Rules > xoá hết, dán vào > Publish',
        'Đợi ~10 giây rồi chạy lại script này');
    if(!r.ok) fail(`Ghi thất bại (${r.status}): ${msg}`);
  }
  pass();

  /* ---------------- 5. rules phải chặn dữ liệu sai ---------------- */
  begin('Rules chặn dữ liệu sai định dạng');
  {
    const badDoc = JSON.parse(JSON.stringify(goodDoc));
    badDoc.fields.field_la = { stringValue: 'dữ liệu rác' };   // hasOnly() phải chặn
    const r = await fetch(`${base}/rooms/${TEST_ROOM}`, {
      method: 'PATCH',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify(badDoc),
    });
    if(r.ok){
      console.log('BỊ HỞ');
      console.log('\n  ⚠ Database đang nhận mọi thứ — Security Rules chưa được áp dụng.');
      console.log('    Nhiều khả năng bạn đang ở "test mode" (rules này tự hết hạn sau 30 ngày,');
      console.log('    và trong lúc đó ai cũng ghi/xoá dữ liệu của bạn được).');
      console.log('\n  Cách sửa:');
      console.log('    • Firestore Database > tab Rules');
      console.log('    • Xoá hết nội dung, dán toàn bộ file firestore.rules');
      console.log('    • Bấm Publish, đợi ~10 giây rồi chạy lại script này\n');
      process.exit(1);
    }
  }
  pass();

  /* ---------------- xong ---------------- */
  console.log('\n✓ Tất cả OK — Firebase sẵn sàng.\n');
  console.log('Bước tiếp theo:');
  console.log('  1. Chạy web server:  python -m http.server 8000');
  console.log('  2. Mở http://localhost:8000');
  console.log('  3. Bấm ☰ > nhập mã phòng (vd: cmc-pickleball) > Kết nối');
  console.log('  4. Đèn ở góc phải trên chuyển xanh lá là xong\n');
  console.log(`Ghi chú: script có tạo một document thử tên "${TEST_ROOM}" trong collection rooms.`);
  console.log('Vô hại, xoá được trong Firebase Console nếu muốn.\n');
  console.log('Khi deploy lên GitHub Pages, nhớ thêm <username>.github.io vào');
  console.log('Authentication > Settings > Authorized domains.\n');
}

main().catch(e => { console.log('\n  ✗ Lỗi không lường trước: ' + (e && e.stack || e) + '\n'); process.exit(1); });
