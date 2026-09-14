/* store.js — trạng thái ứng dụng.
   Ba thực thể:
     rosters  — danh sách người chơi
     teamSets — danh sách đội, gắn với MỘT NGÀY và một danh sách người chơi
     sessions — danh sách trận, gắn với MỘT NGÀY và một danh sách đội
   Mỗi nhóm (room) có cache riêng trên máy để không lẫn dữ liệu giữa các nhóm. */
(function (root) {
'use strict';

const LS_ROOM  = 'pb_room_';
const LS_ROOMS = 'pb_rooms';
const LS_V3    = 'pb_v3';                  // bản chưa có nhóm
const LS_V2    = 'pb_scheduler_v2';        // bản một-danh-sách

const S = {
  roomId:    null,
  rosters:   [],
  teamSets:  [],
  sessions:  [],
  view:      'players',
  rosterId:  null,
  teamSetId: null,
  sessionId: null,
  teamDate:  null,   // ngày đang chọn ở màn hình đội
  matchDate: null,   // ngày đang chọn ở màn hình trận
};

let applying = false;
let migrateNote = '';                      // thông báo một lần sau khi chuyển đổi dữ liệu cũ

/* ---------------- tiện ích ---------------- */
const clamp = (v, lo, hi, d) => {
  const n = parseFloat(v);
  return isNaN(n) ? d : Math.min(hi, Math.max(lo, n));
};
const text = (v, max, d) => {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  return s || d;
};
const sc = v => (v === null || v === undefined || v === '') ? null : clamp(v, 0, 99, null);

function today(){
  const d = new Date();
  const p = n => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const normDate = s => isDate(s) ? s : today();

/* dd/mm để hiển thị cho gọn */
function showDate(s){
  if(!isDate(s)) return s || '';
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

/* ---------------- chuẩn hoá ---------------- */
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
function normTeamSet(t){
  t = t || {};
  const taken = {};
  return {
    id:       String(t.id || PB.newId('ts')),
    date:     normDate(t.date),
    name:     text(t.name, 60, 'Danh sách đội'),
    rosterId: String(t.rosterId || ''),
    /* mỗi người chỉ thuộc một đội, hai người trong đội phải khác nhau */
    teams: (Array.isArray(t.teams) ? t.teams : []).slice(0, 100).map(x => ({
      id:   String((x && x.id) || PB.newId('t')),
      name: text(x && x.name, 40, ''),
      a:    String((x && x.a) || ''),
      b:    String((x && x.b) || ''),
    })).filter(x => {
      if(!x.a || !x.b || x.a === x.b || taken[x.a] || taken[x.b]) return false;
      taken[x.a] = taken[x.b] = true;
      return true;
    }),
  };
}
function normCfg(c){
  c = c || {};
  return {
    courts:       clamp(c.courts,   1,  20, 2),
    minGames:     clamp(c.minGames, 1,  50, 3),
    maxGames:     clamp(c.maxGames, 0,  50, 0),
    cap:          clamp(c.cap,      0, 100, 0),    // số đội tối đa
    maxGap:       clamp(c.maxGap,   0,  10, 1),
    ignoreRating: !!c.ignoreRating,
  };
}
function normMatch(m){
  m = m || {};
  return {
    ta: String((m && m.ta) || ''),
    tb: String((m && m.tb) || ''),
    s1: sc(m.s1),
    s2: sc(m.s2),
    win: (m.win === 1 || m.win === 2) ? m.win : null,
  };
}
function normSession(s){
  s = s || {};
  return {
    id:        String(s.id || PB.newId('s')),
    date:      normDate(s.date),
    name:      text(s.name, 60, 'Danh sách trận'),
    teamSetId: String(s.teamSetId || ''),
    cfg:       normCfg(s.cfg),
    rounds:    (Array.isArray(s.rounds) ? s.rounds : []).slice(0, 200)
                 .map(r => ({ matches: (Array.isArray(r && r.matches) ? r.matches : []).slice(0, 20)
                                .map(normMatch).filter(m => m.ta && m.tb) })),
  };
}

/* ---------------- đọc / ghi ---------------- */
function data(){ return { rosters: S.rosters, teamSets: S.teamSets, sessions: S.sessions }; }

function saveLocal(){
  if(!S.roomId) return;
  try{
    localStorage.setItem(LS_ROOM + S.roomId, JSON.stringify({
      rosters: S.rosters, teamSets: S.teamSets, sessions: S.sessions,
      rosterId: S.rosterId, teamSetId: S.teamSetId, sessionId: S.sessionId,
      teamDate: S.teamDate, matchDate: S.matchDate, view: S.view,
    }));
  }catch(e){}
}
function save(now){
  saveLocal();
  if(!applying && root.PBSync) PBSync.push(data(), now);
}

/* Nhận cả dữ liệu cấu trúc cũ (đội nằm trong roster, buổi trận có cfg.mode):
   thiếu hẳn teamSets nghĩa là bản cũ -> chuyển đổi tại chỗ. */
function put(d){
  if(d && !Array.isArray(d.teamSets) && Array.isArray(d.rosters) && d.rosters.length){
    const c = convertLegacy(d);
    if(c){
      S.rosters  = c.rosters;
      S.teamSets = c.teamSets;
      S.sessions = c.sessions;
      if(c.dropped)
        migrateNote = `${c.dropped} danh sách trận kiểu cũ (chia theo từng người) không chuyển sang mô hình đội được nên đã bỏ.`;
      return;
    }
  }
  S.rosters  = ((d && d.rosters)  || []).map(normRoster);
  S.teamSets = ((d && d.teamSets) || []).map(normTeamSet);
  S.sessions = ((d && d.sessions) || []).map(normSession);
}

function load(roomId){
  S.roomId = roomId;
  put({});
  S.rosterId = S.teamSetId = S.sessionId = null;
  S.teamDate = S.matchDate = today();
  S.view = 'players';

  let d = null;
  try{ d = JSON.parse(localStorage.getItem(LS_ROOM + roomId) || 'null'); }catch(e){}
  if(d){
    put(d);
    S.rosterId  = d.rosterId  || null;
    S.teamSetId = d.teamSetId || null;
    S.sessionId = d.sessionId || null;
    S.teamDate  = normDate(d.teamDate);
    S.matchDate = normDate(d.matchDate);
    S.view      = ['players','teams','matches'].indexOf(d.view) >= 0 ? d.view : 'players';
  }
  fix();
  return !!d;
}

/* Dọn tham chiếu hỏng, đảm bảo luôn có ít nhất một danh sách người chơi */
function fix(){
  if(!S.rosters.length) S.rosters = [normRoster({ name: 'Danh sách chính', players: [] })];
  const rIds = S.rosters.map(r => r.id);
  if(rIds.indexOf(S.rosterId) < 0) S.rosterId = rIds[0];

  S.teamSets.forEach(t => { if(rIds.indexOf(t.rosterId) < 0) t.rosterId = rIds[0]; });
  const tIds = S.teamSets.map(t => t.id);
  S.sessions.forEach(s => { if(tIds.indexOf(s.teamSetId) < 0) s.teamSetId = ''; });

  if(tIds.indexOf(S.teamSetId) < 0) S.teamSetId = null;
  if(S.sessions.map(s => s.id).indexOf(S.sessionId) < 0) S.sessionId = null;
}

function applyRemote(d){
  applying = true;
  put(d);
  fix();
  applying = false;
  saveLocal();
}
const isApplying = () => applying;

/* ---------------- nhóm ---------------- */
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
/* Xoá sạch mọi thứ app đã lưu trên máy này. Không đụng tới dữ liệu trên server. */
function wipeLocal(){
  const keys = [];
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && (k.indexOf(LS_ROOM) === 0 || k === LS_ROOMS || k === LS_V3 || k === LS_V2)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }catch(e){}
  return keys.length;
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

/* ---------------- chuyển đổi dữ liệu bản cũ ---------------- */
/* Bản trước: đội nằm trong roster.teams, buổi trận có playerIds + cfg.mode.
   Chuyển: roster.teams -> một teamSet ngày hôm nay; buổi trận theo đội -> trỏ vào teamSet đó.
   Buổi trận của các chế độ chia theo cá nhân (mixed/split/free) không còn biểu diễn được nữa. */
function convertLegacy(o){
  if(!o || !Array.isArray(o.rosters) || !o.rosters.length) return null;
  const d = today();
  const rosters = o.rosters.map(normRoster);
  const teamSets = [], tsByRoster = {};

  o.rosters.forEach((r, i) => {
    if(!r || !Array.isArray(r.teams) || !r.teams.length) return;
    const ts = normTeamSet({
      date: d, name: 'Đội của ' + rosters[i].name,
      rosterId: rosters[i].id, teams: r.teams,
    });
    teamSets.push(ts);
    tsByRoster[rosters[i].id] = ts.id;
  });

  let dropped = 0;
  const sessions = [];
  (o.sessions || []).forEach(s => {
    const teamSetId = tsByRoster[s && s.rosterId];
    const isTeam = s && s.cfg && s.cfg.mode === 'teams' && teamSetId;
    if(!isTeam){ dropped++; return; }
    sessions.push(normSession({
      id: s.id, date: d, name: s.name, teamSetId: teamSetId, cfg: s.cfg,
      rounds: (s.rounds || []).map(r => ({ matches: (r.matches || []).map(m =>
        ({ ta: m.ta, tb: m.tb, s1: m.s1, s2: m.s2, win: m.win })) })),
    }));
  });

  return { rosters, teamSets, sessions, dropped };
}

/* Dữ liệu còn sót từ bản chưa có nhóm — hỏi người dùng có đưa vào nhóm mới không */
function legacy(){
  try{
    const c = convertLegacy(JSON.parse(localStorage.getItem(LS_V3) || 'null'));
    if(c) return c;
  }catch(e){}
  try{
    const o = JSON.parse(localStorage.getItem(LS_V2) || 'null');
    if(o && o.players && o.players.length)
      return { rosters: [normRoster({ name: 'Danh sách chính', players: o.players })],
               teamSets: [], sessions: [], dropped: 0 };
  }catch(e){}
  return null;
}
function dropLegacy(){
  try{ localStorage.removeItem(LS_V3); localStorage.removeItem(LS_V2); }catch(e){}
}

/* ---------------- truy cập tiện lợi ---------------- */
const roster   = () => S.rosters.find(r => r.id === S.rosterId) || S.rosters[0] || null;
const teamSet  = () => S.teamSets.find(t => t.id === S.teamSetId) || null;
const session  = () => S.sessions.find(s => s.id === S.sessionId) || null;

const teamSetsOn = date => S.teamSets.filter(t => t.date === date);
const sessionsOn = date => S.sessions.filter(s => s.date === date);
const teamSetOf  = s => S.teamSets.find(t => t.id === (s && s.teamSetId)) || null;
const rosterOf   = ts => S.rosters.find(r => r.id === (ts && ts.rosterId)) || null;

function addRoster(name){
  const r = normRoster({ name: name || `Danh sách ${S.rosters.length + 1}` });
  S.rosters.push(r);
  S.rosterId = r.id;
  return r;
}
function removeRoster(id){
  S.rosters = S.rosters.filter(r => r.id !== id);
  const gone = S.teamSets.filter(t => t.rosterId === id).map(t => t.id);
  S.teamSets = S.teamSets.filter(t => t.rosterId !== id);
  S.sessions = S.sessions.filter(s => gone.indexOf(s.teamSetId) < 0);
  fix();
}

function uniqueName(base, taken){
  let n = base, i = 2;
  while(taken.indexOf(n) >= 0) n = `${base} (${i++})`;
  return n;
}
function addTeamSet(date, name){
  const on = teamSetsOn(date);
  const ts = normTeamSet({
    date: date,
    name: uniqueName(name || `Đội ${on.length + 1}`, on.map(x => x.name)),
    rosterId: S.rosterId,
  });
  S.teamSets.push(ts);
  S.teamSetId = ts.id;
  return ts;
}
function removeTeamSet(id){
  S.teamSets = S.teamSets.filter(t => t.id !== id);
  S.sessions = S.sessions.filter(s => s.teamSetId !== id);
  fix();
}

function addSession(date, name){
  const on = sessionsOn(date);
  const last = S.sessions[S.sessions.length - 1];
  const sameDay = teamSetsOn(date);
  const s = normSession({
    date: date,
    name: uniqueName(name || `Trận ${on.length + 1}`, on.map(x => x.name)),
    teamSetId: (sameDay[0] && sameDay[0].id) || (S.teamSets[0] && S.teamSets[0].id) || '',
    cfg: last ? last.cfg : null,
  });
  S.sessions.push(s);
  S.sessionId = s.id;
  return s;
}
function removeSession(id){
  S.sessions = S.sessions.filter(s => s.id !== id);
  fix();
}

/* ---------------- đội ---------------- */
/* Đội đã dựng thành object người chơi; bỏ đội có người không còn trong danh sách */
function teamsOf(ts){
  if(!ts) return [];
  const r = rosterOf(ts);
  if(!r) return [];
  const by = {};
  r.players.forEach(p => { by[p.id] = p; });
  return ts.teams
    .map(t => ({ id: t.id, name: t.name, p1: by[t.a], p2: by[t.b] }))
    .filter(t => t.p1 && t.p2);
}
/* Đội dùng được cho buổi trận: cả 2 người phải được tick "Chơi" */
const liveTeams = ts => teamsOf(ts).filter(t => t.p1.active && t.p2.active);

/* Người chưa được xếp vào đội nào trong danh sách đội này */
function unteamed(ts, activeOnly){
  const r = rosterOf(ts);
  if(!r) return [];
  const inTeam = {};
  ts.teams.forEach(t => { inTeam[t.a] = true; inTeam[t.b] = true; });
  return r.players.filter(p => !inTeam[p.id] && (!activeOnly || p.active));
}
const teamLabel = t => t.name || (t.p1.name + ' & ' + t.p2.name);

const hasResults = s =>
  !!(s && s.rounds.some(r => r.matches.some(m => m.win === 1 || m.win === 2)));

root.PBStore = {
  state: S, data, load, save, saveLocal, applyRemote, isApplying, fix,
  rooms, rememberRoom, forgetRoom, wipeLocal, legacy, dropLegacy,
  normPlayer, normRoster, normTeamSet, normCfg, normSession,
  today, normDate, showDate,
  roster, teamSet, session, teamSetsOn, sessionsOn, teamSetOf, rosterOf,
  addRoster, removeRoster, addTeamSet, removeTeamSet, addSession, removeSession,
  teamsOf, liveTeams, unteamed, teamLabel, hasResults,
  note: () => migrateNote, setNote: m => { migrateNote = m; },
};

})(typeof window !== 'undefined' ? window : globalThis);
