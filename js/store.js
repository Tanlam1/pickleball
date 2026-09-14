/* store.js — trạng thái ứng dụng: nhiều danh sách người chơi, nhiều buổi trận.
   Lưu localStorage và đẩy lên Firestore (nếu đang đồng bộ). */
(function (root) {
'use strict';

const LS     = 'pb_v3';
const LS_OLD = 'pb_scheduler_v2';          // bản một-danh-sách trước đây

const S = {
  rosters:  [],      // [{ id, name, players:[{id,name,gender,rating,active}] }]
  sessions: [],      // [{ id, name, rosterId, cfg, playerIds, rounds, createdAt }]
  view:     'players',
  rosterId: null,
  sessionId:null,
};

let applying = false;                       // đang áp dữ liệu từ xa -> không đẩy ngược lên

/* ---------------- chuẩn hoá (cũng là lớp chắn dữ liệu lạ từ phòng chung) ---------------- */
const clamp = (v, lo, hi, d) => {
  const n = parseFloat(v);
  return isNaN(n) ? d : Math.min(hi, Math.max(lo, n));
};
const text = (v, max, d) => {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  return s || d;
};
const sc = v => (v === null || v === undefined || v === '') ? null : clamp(v, 0, 99, null);

function normPlayer(p){
  p = p || {};
  return {
    id:     String(p.id || PB.newId('p')),
    name:   text(p.name, 40, 'Không tên'),
    gender: p.gender === 'F' ? 'F' : 'M',
    rating: clamp(p.rating, 1, 8, 3.5),
    active: p.active !== false,
  };
}
function normRoster(r){
  r = r || {};
  return {
    id:      String(r.id || PB.newId('r')),
    name:    text(r.name, 60, 'Danh sách'),
    players: (Array.isArray(r.players) ? r.players : []).slice(0, 200).map(normPlayer),
  };
}
function normCfg(c){
  c = c || {};
  return {
    mode:         ['mixed','split','free'].indexOf(c.mode) >= 0 ? c.mode : 'mixed',
    courts:       clamp(c.courts,   1,  20, 2),
    minGames:     clamp(c.minGames, 1,  50, 4),
    maxGames:     clamp(c.maxGames, 0,  50, 0),
    cap:          clamp(c.cap,      0, 200, 0),
    ignoreRating: !!c.ignoreRating,
  };
}
function normMatch(m){
  m = m || {};
  return {
    a:  (Array.isArray(m.a) ? m.a : []).slice(0, 2).map(String),
    b:  (Array.isArray(m.b) ? m.b : []).slice(0, 2).map(String),
    s1: sc(m.s1),
    s2: sc(m.s2),
    win: (m.win === 1 || m.win === 2) ? m.win : null,
  };
}
function normSession(s){
  s = s || {};
  return {
    id:        String(s.id || PB.newId('s')),
    name:      text(s.name, 60, 'Buổi mới'),
    rosterId:  String(s.rosterId || ''),
    cfg:       normCfg(s.cfg),
    playerIds: (Array.isArray(s.playerIds) ? s.playerIds : []).slice(0, 200).map(String),
    rounds:    (Array.isArray(s.rounds) ? s.rounds : []).slice(0, 200)
                 .map(r => ({ matches: (Array.isArray(r && r.matches) ? r.matches : []).slice(0, 20).map(normMatch) })),
    createdAt: clamp(s.createdAt, 0, 1e15, 0),
  };
}

/* ---------------- đọc / ghi ---------------- */
function data(){ return { rosters: S.rosters, sessions: S.sessions }; }

function saveLocal(){
  try{
    localStorage.setItem(LS, JSON.stringify({
      rosters: S.rosters, sessions: S.sessions,
      rosterId: S.rosterId, sessionId: S.sessionId, view: S.view,
    }));
  }catch(e){}
}

/* now = true khi vừa nhập điểm: đẩy ngay để người khác thấy liền */
function save(now){
  saveLocal();
  if(!applying && root.PBSync) PBSync.push(data(), now);
}

/* Trả về true nếu tìm thấy dữ liệu đã lưu (để app biết có cần nạp dữ liệu mẫu không) */
function load(){
  let d = null, found = false;
  try{ d = JSON.parse(localStorage.getItem(LS) || 'null'); }catch(e){}

  if(d){
    S.rosters   = (d.rosters  || []).map(normRoster);
    S.sessions  = (d.sessions || []).map(normSession);
    S.rosterId  = d.rosterId  || null;
    S.sessionId = d.sessionId || null;
    S.view      = d.view === 'matches' ? 'matches' : 'players';
    found = true;
  }else{
    /* chuyển từ bản cũ: một danh sách người chơi duy nhất */
    try{
      const o = JSON.parse(localStorage.getItem(LS_OLD) || 'null');
      if(o && o.players && o.players.length){
        S.rosters = [normRoster({ name: 'Danh sách chính', players: o.players })];
        found = true;
      }
    }catch(e){}
  }
  fix();
  return found;
}

/* Dọn tham chiếu hỏng và đảm bảo luôn có ít nhất 1 danh sách */
function fix(){
  if(!S.rosters.length) S.rosters = [normRoster({ name: 'Danh sách chính', players: [] })];
  const rIds = S.rosters.map(r => r.id);
  if(rIds.indexOf(S.rosterId) < 0) S.rosterId = rIds[0];

  S.sessions.forEach(s => { if(rIds.indexOf(s.rosterId) < 0) s.rosterId = S.rosterId; });
  const sIds = S.sessions.map(s => s.id);
  if(sIds.indexOf(S.sessionId) < 0) S.sessionId = sIds.length ? sIds[sIds.length - 1] : null;
}

function applyRemote(d){
  applying = true;
  if(Array.isArray(d.rosters))  S.rosters  = d.rosters.map(normRoster);
  if(Array.isArray(d.sessions)) S.sessions = d.sessions.map(normSession);
  fix();
  applying = false;
  saveLocal();
}
const isApplying = () => applying;

/* ---------------- truy cập tiện lợi ---------------- */
const roster  = () => S.rosters.find(r => r.id === S.rosterId) || S.rosters[0] || null;
const session = () => S.sessions.find(s => s.id === S.sessionId) || null;
const rosterOf = s => S.rosters.find(r => r.id === (s && s.rosterId)) || null;

function addRoster(name){
  const r = normRoster({ name: name || `Danh sách ${S.rosters.length + 1}` });
  S.rosters.push(r);
  S.rosterId = r.id;
  return r;
}
function addSession(name){
  const d = new Date();
  const base = name || `Buổi ${d.getDate()}/${d.getMonth() + 1}`;
  let n = base, i = 2;
  while(S.sessions.some(s => s.name === n)) n = `${base} (${i++})`;
  const last = S.sessions[S.sessions.length - 1];
  const s = normSession({
    name: n,
    rosterId: S.rosterId,
    cfg: last ? last.cfg : null,             // kế thừa cấu hình buổi trước
    createdAt: Date.now(),
  });
  S.sessions.push(s);
  S.sessionId = s.id;
  return s;
}
function removeRoster(id){
  S.rosters = S.rosters.filter(r => r.id !== id);
  S.sessions = S.sessions.filter(s => s.rosterId !== id);   // buổi trận mất danh sách thì bỏ luôn
  fix();
}
function removeSession(id){
  S.sessions = S.sessions.filter(s => s.id !== id);
  fix();
}

/* Buổi trận đã có kết quả nào chưa (dùng để cảnh báo trước khi tạo lại lịch) */
function hasResults(s){
  return !!(s && s.rounds.some(r => r.matches.some(m => m.win === 1 || m.win === 2)));
}

root.PBStore = {
  state: S, data, load, save, saveLocal, applyRemote, isApplying, fix,
  normPlayer, normRoster, normCfg, normSession,
  roster, session, rosterOf, addRoster, addSession, removeRoster, removeSession, hasResults,
};

})(typeof window !== 'undefined' ? window : globalThis);
