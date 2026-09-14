/* store.js — trạng thái ứng dụng: nhiều danh sách người chơi, nhiều buổi trận.
   Lưu localStorage và đẩy lên Firestore (nếu đang đồng bộ). */
(function (root) {
'use strict';

/* Mỗi nhóm có cache riêng: pb_room_<mã nhóm>. Không dùng chung một chỗ lưu nữa
   để dữ liệu các nhóm không lẫn vào nhau khi đổi qua lại. */
const LS_ROOM  = 'pb_room_';
const LS_ROOMS = 'pb_rooms';               // danh sách nhóm gần đây + nhóm dùng lần cuối
const LS_V3    = 'pb_v3';                  // bản chưa có nhóm (một máy một dữ liệu)
const LS_V2    = 'pb_scheduler_v2';        // bản một-danh-sách trước nữa

const S = {
  roomId:   null,    // mã nhóm đang mở ('_local' khi chưa cấu hình Firebase)
  rosters:  [],      // [{ id, name, players:[...], teams:[...] }]
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
  const players = (Array.isArray(r.players) ? r.players : []).slice(0, 200).map(normPlayer);
  const ids = {};
  players.forEach(p => { ids[p.id] = true; });

  /* Đội chỉ hợp lệ khi cả 2 người còn trong danh sách, khác nhau,
     và mỗi người chỉ thuộc đúng một đội. */
  const taken = {};
  const teams = (Array.isArray(r.teams) ? r.teams : []).slice(0, 100).map(t => ({
    id:   String((t && t.id) || PB.newId('t')),
    name: text(t && t.name, 40, ''),
    a:    String((t && t.a) || ''),
    b:    String((t && t.b) || ''),
  })).filter(t => {
    if(!ids[t.a] || !ids[t.b] || t.a === t.b) return false;
    if(taken[t.a] || taken[t.b]) return false;
    taken[t.a] = taken[t.b] = true;
    return true;
  });

  return {
    id:      String(r.id || PB.newId('r')),
    name:    text(r.name, 60, 'Danh sách'),
    players: players,
    teams:   teams,
  };
}
function normCfg(c){
  c = c || {};
  return {
    mode:         ['mixed','split','free','teams'].indexOf(c.mode) >= 0 ? c.mode : 'mixed',
    courts:       clamp(c.courts,   1,  20, 2),
    minGames:     clamp(c.minGames, 1,  50, 4),
    maxGames:     clamp(c.maxGames, 0,  50, 0),
    cap:          clamp(c.cap,      0, 200, 0),
    maxGap:       clamp(c.maxGap,   0,  10, 1),    // lệch tổng rating tối đa mỗi trận, 0 = không giới hạn
    ignoreRating: !!c.ignoreRating,
  };
}
function normMatch(m){
  m = m || {};
  return {
    a:  (Array.isArray(m.a) ? m.a : []).slice(0, 2).map(String),
    b:  (Array.isArray(m.b) ? m.b : []).slice(0, 2).map(String),
    ta: m.ta ? String(m.ta) : null,      // id đội (chỉ có ở chế độ đội cố định)
    tb: m.tb ? String(m.tb) : null,
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
  if(!S.roomId) return;
  try{
    localStorage.setItem(LS_ROOM + S.roomId, JSON.stringify({
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

/* Nạp cache của một nhóm. Trả về true nếu máy này đã có dữ liệu của nhóm đó. */
function load(roomId){
  S.roomId    = roomId;
  S.rosters   = [];
  S.sessions  = [];
  S.rosterId  = null;
  S.sessionId = null;
  S.view      = 'players';

  let d = null;
  try{ d = JSON.parse(localStorage.getItem(LS_ROOM + roomId) || 'null'); }catch(e){}
  if(d){
    S.rosters   = (d.rosters  || []).map(normRoster);
    S.sessions  = (d.sessions || []).map(normSession);
    S.rosterId  = d.rosterId  || null;
    S.sessionId = d.sessionId || null;
    S.view      = ['players','teams','matches'].indexOf(d.view) >= 0 ? d.view : 'players';
  }
  fix();
  return !!d;
}

/* ---------------- danh sách nhóm gần đây ---------------- */
function rooms(){
  try{
    const r = JSON.parse(localStorage.getItem(LS_ROOMS) || 'null');
    if(r && Array.isArray(r.list)) return r;
  }catch(e){}
  return { list: [], last: null };
}
function rememberRoom(id){
  const r = rooms();
  r.list = [id].concat(r.list.filter(x => x !== id)).slice(0, 8);
  r.last = id;
  try{ localStorage.setItem(LS_ROOMS, JSON.stringify(r)); }catch(e){}
}
function forgetRoom(id){
  const r = rooms();
  r.list = r.list.filter(x => x !== id);
  if(r.last === id) r.last = r.list[0] || null;
  try{
    localStorage.setItem(LS_ROOMS, JSON.stringify(r));
    localStorage.removeItem(LS_ROOM + id);
  }catch(e){}
}

/* ---------------- dữ liệu từ bản chưa có nhóm ---------------- */
/* Người dùng cũ có dữ liệu nằm ngoài mọi nhóm. Lần đầu tạo nhóm sẽ được hỏi có đưa vào không. */
function legacy(){
  try{
    const o = JSON.parse(localStorage.getItem(LS_V3) || 'null');
    if(o && o.rosters && o.rosters.length)
      return { rosters: o.rosters.map(normRoster), sessions: (o.sessions || []).map(normSession) };
  }catch(e){}
  try{
    const o = JSON.parse(localStorage.getItem(LS_V2) || 'null');
    if(o && o.players && o.players.length)
      return { rosters: [normRoster({ name: 'Danh sách chính', players: o.players })], sessions: [] };
  }catch(e){}
  return null;
}
function dropLegacy(){
  try{ localStorage.removeItem(LS_V3); localStorage.removeItem(LS_V2); }catch(e){}
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

/* ---------------- đội cố định ---------------- */

/* Đội đã dựng thành object người chơi. Bỏ đội có người không còn trong danh sách. */
function teamsOf(roster){
  if(!roster) return [];
  const by = {};
  roster.players.forEach(p => { by[p.id] = p; });
  return roster.teams
    .map(t => ({ id: t.id, name: t.name, p1: by[t.a], p2: by[t.b] }))
    .filter(t => t.p1 && t.p2);
}

/* Đội dùng được cho buổi trận: cả 2 người phải được tick "Chơi" */
function liveTeams(roster){
  return teamsOf(roster).filter(t => t.p1.active && t.p2.active);
}

/* Người chưa được xếp vào đội nào. activeOnly = chỉ tính người đang tick "Chơi". */
function unteamed(roster, activeOnly){
  if(!roster) return [];
  const inTeam = {};
  roster.teams.forEach(t => { inTeam[t.a] = true; inTeam[t.b] = true; });
  return roster.players.filter(p => !inTeam[p.id] && (!activeOnly || p.active));
}

const teamLabel = t => t.name || (t.p1.name + ' & ' + t.p2.name);

/* Buổi trận đã có kết quả nào chưa (dùng để cảnh báo trước khi tạo lại lịch) */
function hasResults(s){
  return !!(s && s.rounds.some(r => r.matches.some(m => m.win === 1 || m.win === 2)));
}

root.PBStore = {
  state: S, data, load, save, saveLocal, applyRemote, isApplying, fix,
  rooms, rememberRoom, forgetRoom, legacy, dropLegacy,
  normPlayer, normRoster, normCfg, normSession,
  roster, session, rosterOf, addRoster, addSession, removeRoster, removeSession, hasResults,
  teamsOf, liveTeams, unteamed, teamLabel,
};

})(typeof window !== 'undefined' ? window : globalThis);
