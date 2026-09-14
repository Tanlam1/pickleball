/* app.js — giao diện: quản lý người chơi, gọi PB (scheduler.js), nối PBSync (sync.js) */
(function(){
'use strict';

const $ = id => document.getElementById(id);
const LS = 'pb_scheduler_v2', LS_OLD = 'pb_scheduler_v1';

let players = [];
let schedule = null;
let currentRoom = null;
let applyingRemote = false;      // chặn vòng lặp: nhận từ xa -> render -> lại đẩy lên

const SAMPLE = [
  ['Minh','M',4.25],['Tuấn','M',3.75],['Hùng','M',3.5],['Nam','M',4.0],
  ['Dũng','M',3.25],['Khoa','M',3.5],['Phong','M',4.5],
  ['Lan','F',3.5],['Hoa','F',3.0],['Mai','F',3.75],['Thu','F',3.25],
  ['Linh','F',4.0],['Trang','F',3.0],['Ngọc','F',3.5],
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let toastTimer = null;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

/* ============================ STATE ============================ */
function readCfg(){
  return {
    mode:     $('cMode').value,
    courts:   Math.max(1, +$('cCourts').value || 1),
    minGames: Math.max(1, +$('cMin').value || 1),
    maxGames: Math.max(0, +$('cMax').value || 0),
    cap:      Math.max(0, +$('cCap').value || 0),
    balance:  $('cBalance').checked,
  };
}
function writeCfg(c){
  if(!c) return;
  if(c.mode)              $('cMode').value  = c.mode;
  if(c.courts   != null)  $('cCourts').value = c.courts;
  if(c.minGames != null)  $('cMin').value    = c.minGames;
  if(c.maxGames != null)  $('cMax').value    = c.maxGames;
  if(c.cap      != null)  $('cCap').value    = c.cap;
  if(c.balance  != null)  $('cBalance').checked = !!c.balance;
}

/* Làm sạch trước khi lưu / gửi đi: bỏ field tạm (_r) và chặn dữ liệu lạ từ phòng chung */
function normPlayer(p){
  p = p || {};
  const r = parseFloat(p.rating);
  return {
    id:     String(p.id || PB.newId()),
    name:   String(p.name || '').slice(0, 40),
    gender: p.gender === 'F' ? 'F' : 'M',
    rating: isNaN(r) ? 3.5 : Math.min(8, Math.max(1, r)),
    active: p.active !== false,
  };
}
function stateObj(){
  return { players: players.map(normPlayer), cfg: readCfg(), schedule: PB.serialize(schedule) };
}
function saveLocal(){
  try{ localStorage.setItem(LS, JSON.stringify(stateObj())); }catch(e){}
}
function save(){
  saveLocal();
  if(!applyingRemote) PBSync.push(stateObj());
}

function load(){
  let d = null;
  try{ d = JSON.parse(localStorage.getItem(LS) || 'null'); }catch(e){}
  if(!d){
    /* chuyển dữ liệu từ phiên bản trước (id số, tên field cfg khác) */
    try{
      const o = JSON.parse(localStorage.getItem(LS_OLD) || 'null');
      if(o) d = { players: o.players, cfg: o.cfg && {
        mode: o.cfg.mode, courts: +o.cfg.courts, minGames: +o.cfg.min,
        maxGames: +o.cfg.max, cap: +o.cfg.cap, balance: o.cfg.balance } };
    }catch(e){}
  }
  if(!d) return;
  players = (d.players || []).map(normPlayer);
  writeCfg(d.cfg);
  if(d.schedule) schedule = PB.deserialize(d.schedule, players);
}

/* ============================ NGƯỜI CHƠI ============================ */
function addPlayer(name, gender, rating){
  name = String(name || '').trim();
  if(!name) return false;
  players.push(normPlayer({ id: PB.newId(), name, gender, rating }));
  return true;
}

function renderPlayers(){
  $('plist').innerHTML = players.map((p, i) => `
    <tr>
      <td><input type="checkbox" data-k="active" data-i="${i}" ${p.active?'checked':''} style="width:auto"></td>
      <td><input type="text" data-k="name" data-i="${i}" value="${esc(p.name)}"></td>
      <td><select data-k="gender" data-i="${i}">
        <option value="M"${p.gender==='M'?' selected':''}>Nam</option>
        <option value="F"${p.gender==='F'?' selected':''}>Nữ</option></select></td>
      <td><input type="number" data-k="rating" data-i="${i}" value="${p.rating}" step="0.25" min="1" max="8"></td>
      <td><button class="ghost" data-del="${i}">Xoá</button></td>
    </tr>`).join('');

  $('pempty').style.display = players.length ? 'none' : 'block';
  const a = players.filter(p => p.active);
  $('pcount').textContent = players.length
    ? `— ${a.length}/${players.length} tham gia · ${a.filter(p=>p.gender==='M').length} nam, ${a.filter(p=>p.gender==='F').length} nữ`
    : '';
  save();
}

$('plist').addEventListener('input', e => {
  const t = e.target, i = t.dataset.i, k = t.dataset.k;
  if(i === undefined || !k) return;
  if(k === 'active')      players[i].active = t.checked;
  else if(k === 'rating') players[i].rating = parseFloat(t.value) || 0;
  else                    players[i][k] = t.value;
  if(k === 'active') renderPlayers(); else save();
});
$('plist').addEventListener('change', e => {
  if(e.target.dataset.k === 'gender'){
    players[e.target.dataset.i].gender = e.target.value;
    renderPlayers();
  }
});
$('plist').addEventListener('click', e => {
  const d = e.target.dataset.del;
  if(d !== undefined){ players.splice(+d, 1); renderPlayers(); }
});

$('btnAdd').onclick = () => {
  if(addPlayer($('fName').value, $('fGender').value, $('fRating').value)){
    $('fName').value = ''; $('fName').focus();
    renderPlayers();
  }
};
$('fName').addEventListener('keydown', e => { if(e.key === 'Enter') $('btnAdd').click(); });
$('btnAll').onclick  = () => { players.forEach(p => p.active = true);  renderPlayers(); };
$('btnNone').onclick = () => { players.forEach(p => p.active = false); renderPlayers(); };
$('btnSample').onclick = () => {
  if(players.length && !confirm('Thay danh sách hiện tại bằng 14 người mẫu?')) return;
  players = [];
  SAMPLE.forEach(s => addPlayer(s[0], s[1], s[2]));
  renderPlayers();
};
$('btnClear').onclick = () => {
  if(!confirm('Xoá toàn bộ người chơi?')) return;
  players = []; schedule = null;
  $('resultPanel').style.display = 'none';
  renderPlayers();
};
$('btnBulk').onclick       = () => { $('bulkBox').style.display = 'block'; $('bulkText').focus(); };
$('btnBulkCancel').onclick = () => { $('bulkBox').style.display = 'none'; };
$('btnBulkGo').onclick = () => {
  let n = 0;
  $('bulkText').value.split('\n').forEach(line => {
    const c = line.split(/[,\t;]/).map(s => s.trim());
    if(!c[0]) return;
    const g = /^(n[ữu]|f|female|w)$/i.test(c[1] || '') ? 'F' : 'M';
    if(addPlayer(c[0], g, c[2])) n++;
  });
  $('bulkText').value = '';
  $('bulkBox').style.display = 'none';
  renderPlayers();
  toast(n ? `Đã thêm ${n} người` : 'Không đọc được dòng nào');
};

/* ============================ HIỂN THỊ LỊCH ============================ */
const pName = p => `<span class="p"><span class="dot ${p.gender==='M'?'m':'f'}"></span><b>${esc(p.name)}</b> <span style="color:var(--muted);font-size:12px">${p.rating.toFixed(2)}</span></span>`;

function renderSchedule(res){
  $('resultPanel').style.display = 'block';
  if(!res || res.error){
    $('warnings').innerHTML = `<div class="warn">${esc(res ? res.error : 'Chưa có lịch.')}</div>`;
    $('rounds').innerHTML = ''; $('statsBody').innerHTML = ''; $('summary').textContent = '';
    return;
  }
  const { ctx, rounds, cfg, list, dropped } = res;

  $('summary').textContent = `— ${rounds.length} vòng · ${rounds.reduce((s,r)=>s+r.matches.length,0)} ván · ${list.length} người · ${cfg.courts} sân`;

  const w = [];
  if(dropped.length)
    w.push(`Giới hạn còn ${list.length} người — không xếp lịch cho: <b>${dropped.map(p=>esc(p.name)).join(', ')}</b>.`);
  const short = list.filter(p => ctx.games[p.id] < cfg.minGames);
  if(short.length)
    w.push(`Không đủ ${cfg.minGames} ván cho: <b>${short.map(p=>esc(p.name)+' ('+ctx.games[p.id]+')').join(', ')}</b>. Thử tăng số sân, giảm ván tối thiểu, hoặc bỏ giới hạn ván tối đa.`);
  const gs = list.map(p => ctx.games[p.id]);
  const lo = Math.min.apply(null, gs), hi = Math.max.apply(null, gs);
  if(hi - lo >= 3)
    w.push(`Chênh lệch số ván khá lớn (${lo}–${hi} ván). Thường do lệch tỉ lệ nam/nữ ở chế độ đang chọn.`);
  const dup = Object.keys(ctx.partner).filter(k => ctx.partner[k] > 1).length;
  if(dup)
    w.push(`Có ${dup} cặp phải đánh chung nhiều hơn 1 lần (không tránh được với số người hiện tại).`);
  $('warnings').innerHTML = w.length ? `<div class="warn"><b>Lưu ý</b><ul><li>${w.join('</li><li>')}</li></ul></div>` : '';

  $('rounds').innerHTML = rounds.map((r, i) => `
    <div class="round">
      <header><span>Vòng ${i+1}</span>
        <span class="rest">${r.resting.length ? 'Nghỉ: ' + r.resting.map(p=>esc(p.name)).join(', ') : 'Tất cả đều ra sân'}</span>
      </header>
      <div class="courts">${r.matches.map((m, c) => `
        <div class="court">
          <div class="cname">Sân ${c+1}</div>
          <div class="vs">
            <div class="team">${pName(m.t1[0])}${pName(m.t1[1])}
              <span class="sum">Tổng ${(m.t1[0].rating + m.t1[1].rating).toFixed(2)}</span></div>
            <div class="mid">VS</div>
            <div class="team">${pName(m.t2[0])}${pName(m.t2[1])}
              <span class="sum">Tổng ${(m.t2[0].rating + m.t2[1].rating).toFixed(2)}</span></div>
          </div>
        </div>`).join('')}</div>
    </div>`).join('');

  $('statsBody').innerHTML = list.slice()
    .sort((a, b) => ctx.games[a.id] - ctx.games[b.id] || a.name.localeCompare(b.name, 'vi'))
    .map(p => {
      const mates = new Set();
      Object.keys(ctx.partner).forEach(k => {
        const [x, y] = k.split('|');
        if(x === String(p.id)) mates.add(y); else if(y === String(p.id)) mates.add(x);
      });
      const g = ctx.games[p.id];
      return `<tr>
        <td>${esc(p.name)}</td>
        <td><span class="tag ${p.gender==='M'?'m':'f'}">${p.gender==='M'?'Nam':'Nữ'}</span></td>
        <td>${p.rating.toFixed(2)}</td>
        <td${g < cfg.minGames ? ' class="bad"' : ''}>${g}</td>
        <td>${rounds.length - g}</td>
        <td>${mates.size}</td></tr>`;
    }).join('');
}

function asText(){
  if(!schedule) return '';
  const modeName = { mixed:'Đôi nam nữ', split:'Tách nam nữ', free:'Ngẫu nhiên' }[schedule.cfg.mode];
  let out = `LỊCH ĐÁNH PICKLEBALL — ${modeName}\n${schedule.list.length} người · ${schedule.cfg.courts} sân · ${schedule.rounds.length} vòng\n`;
  schedule.rounds.forEach((r, i) => {
    out += `\n--- VÒNG ${i+1} ---\n`;
    r.matches.forEach((m, c) => {
      out += `Sân ${c+1}: ${m.t1[0].name} & ${m.t1[1].name}  vs  ${m.t2[0].name} & ${m.t2[1].name}\n`;
    });
    if(r.resting.length) out += `Nghỉ: ${r.resting.map(p => p.name).join(', ')}\n`;
  });
  return out;
}

function run(){
  const res = PB.generate(players.filter(p => p.active), readCfg());
  schedule = res.error ? null : res;
  renderSchedule(res);
  save();
  $('resultPanel').scrollIntoView({ behavior:'smooth', block:'start' });
}
$('btnGen').onclick   = run;
$('btnRegen').onclick = run;
$('btnPrint').onclick = () => window.print();
$('btnCopy').onclick  = async () => {
  const t = asText();
  if(!t) return;
  try{ await navigator.clipboard.writeText(t); toast('Đã copy lịch'); }
  catch(e){ prompt('Copy thủ công:', t); }
};
['cMode','cCourts','cMin','cMax','cCap','cBalance'].forEach(id => $(id).addEventListener('change', save));

/* ============================ ĐỒNG BỘ ============================ */
const STATUS = {
  off:        ['', 'Ngoại tuyến — dữ liệu chỉ lưu trên máy này'],
  connecting: ['connecting', 'Đang kết nối…'],
  error:      ['error', 'Lỗi'],
};

function setStatus(s, msg){
  const on = s === 'live';
  $('led').className = 'led ' + (on ? 'live' : (STATUS[s] ? STATUS[s][0] : ''));
  $('statusText').innerHTML = on
    ? `<b>Đang đồng bộ</b> · phòng <b>${esc(currentRoom)}</b> · mọi thay đổi hiện ngay với cả nhóm`
    : esc((STATUS[s] ? STATUS[s][1] : '') + (msg ? ' — ' + msg : ''));
  $('btnJoin').style.display  = on ? 'none' : '';
  $('btnLeave').style.display = on ? '' : 'none';
  $('btnShare').style.display = on ? '' : 'none';
  $('roomId').disabled = on || s === 'connecting';
  $('btnJoin').disabled = s === 'connecting';
}

function normRoom(s){
  const v = String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return /^[a-z0-9][a-z0-9-]{2,31}$/.test(v) ? v : null;
}

function applyRemote(d){
  applyingRemote = true;
  if(Array.isArray(d.players)) players = d.players.map(normPlayer);
  writeCfg(d.cfg);
  renderPlayers();
  schedule = d.schedule ? PB.deserialize(d.schedule, players) : null;
  if(schedule) renderSchedule(schedule);
  else $('resultPanel').style.display = 'none';
  applyingRemote = false;
  saveLocal();
}

async function join(silent){
  const id = normRoom($('roomId').value);
  if(!id){
    toast('Mã phòng: 3–32 ký tự, chỉ chữ thường / số / dấu gạch ngang');
    return;
  }
  currentRoom = id;
  let remote;
  try{
    remote = await PBSync.connect(id, d => { applyRemote(d); toast('Có cập nhật từ thành viên khác'); }, setStatus);
  }catch(e){
    currentRoom = null;
    return;                              // setStatus('error', …) đã hiện lý do
  }

  if(remote){
    const n = (remote.players || []).length;
    if(!silent && players.length &&
       !confirm(`Phòng "${id}" đã có sẵn ${n} người chơi.\n\nTải dữ liệu của phòng về máy? Danh sách ${players.length} người hiện có trên máy bạn sẽ bị thay thế.`)){
      PBSync.disconnect();
      currentRoom = null;
      return;
    }
    applyRemote(remote);
    toast(`Đã vào phòng ${id}`);
  }else{
    save();                              // phòng mới: đẩy dữ liệu đang có lên làm dữ liệu gốc
    toast(`Đã tạo phòng ${id}`);
  }
  location.hash = 'room=' + id;
  setStatus('live');
}

$('btnJoin').onclick  = () => join(false);
$('roomId').addEventListener('keydown', e => { if(e.key === 'Enter') join(false); });
$('btnLeave').onclick = () => {
  PBSync.disconnect();
  currentRoom = null;
  history.replaceState(null, '', location.pathname + location.search);
  setStatus('off');
  toast('Đã ngắt đồng bộ — dữ liệu vẫn còn trên máy');
};
$('btnShare').onclick = async () => {
  const url = location.origin + location.pathname + '#room=' + currentRoom;
  try{ await navigator.clipboard.writeText(url); toast('Đã copy link mời'); }
  catch(e){ prompt('Gửi link này cho cả nhóm:', url); }
};

/* ============================ KHỞI ĐỘNG ============================ */
load();
if(!players.length) SAMPLE.forEach(s => addPlayer(s[0], s[1], s[2]));
renderPlayers();
if(schedule) renderSchedule(schedule);

if(!PBSync.configured()){
  $('syncPanel').innerHTML =
    '<div class="status"><span class="led"></span><span>Chưa cấu hình Firebase — app đang chạy ngoại tuyến, ' +
    'dữ liệu chỉ lưu trên máy này. Xem <b>FIREBASE.md</b> để bật đồng bộ nhiều người.</span></div>';
}else{
  setStatus('off');
  const m = /room=([a-z0-9-]+)/i.exec(location.hash);
  if(m){ $('roomId').value = m[1]; join(true); }   // mở bằng link mời -> vào thẳng, lấy dữ liệu phòng
}

})();
