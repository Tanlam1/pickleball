/* scheduler.js — thuật toán chia trận + thống kê kết quả.
   Thuần tuý: không đụng DOM, không Firebase. Chạy được cả trong trình duyệt lẫn Node. */
(function (root) {
'use strict';

const W_PARTNER = 120;   // phạt trùng bạn cùng đội (nặng nhất)
const W_OPP     = 22;    // phạt trùng đối thủ
const W_RATING  = 10;    // phạt lệch trình độ giữa 2 đội
const TRIALS    = 240;   // số lần thử xáo mỗi vòng

/* ID ngẫu nhiên thay vì số tăng dần — tránh trùng khi nhiều người cùng thêm */
function newId(pre){ return (pre || 'p') + Math.random().toString(36).slice(2, 10); }

const pk = (a, b) => a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;

function makeCtx(list, cfg){
  const c = { players: list, cfg: cfg || {}, games: {}, rest: {}, partner: {}, opp: {} };
  list.forEach(p => { c.games[p.id] = 0; c.rest[p.id] = 0; });
  return c;
}

function score(matches, ctx){
  let s = 0;
  for(const m of matches){
    s += W_PARTNER * (Math.pow(ctx.partner[pk(m.t1[0], m.t1[1])] || 0, 2)
                    + Math.pow(ctx.partner[pk(m.t2[0], m.t2[1])] || 0, 2));
    for(const a of m.t1) for(const b of m.t2) s += W_OPP * (ctx.opp[pk(a, b)] || 0);
    if(!ctx.cfg.ignoreRating){
      s += W_RATING * Math.abs(m.t1[0].rating + m.t1[1].rating - m.t2[0].rating - m.t2[1].rating);
    }
  }
  return s;
}

function shuffle(a){
  for(let i = a.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* 2C nam + 2C nữ -> C ván đôi nam nữ */
function arrangeMixed(males, females, ctx){
  let best = null, bestS = Infinity;
  for(let t = 0; t < TRIALS; t++){
    const M = shuffle(males.slice()), F = shuffle(females.slice()), ms = [];
    for(let c = 0; c * 2 < M.length; c++){
      const m1 = M[2*c], m2 = M[2*c+1], f1 = F[2*c], f2 = F[2*c+1];
      const A = { t1:[m1, f1], t2:[m2, f2] }, B = { t1:[m1, f2], t2:[m2, f1] };
      ms.push(score([A], ctx) <= score([B], ctx) ? A : B);
    }
    const s = score(ms, ctx);
    if(s < bestS){ bestS = s; best = ms; }
  }
  return best || [];
}

/* nhóm bội số 4 (cùng giới hoặc tự do) -> các ván đôi */
function arrangeGroups(group, ctx){
  let best = null, bestS = Infinity;
  for(let t = 0; t < TRIALS; t++){
    const G = shuffle(group.slice()), ms = [];
    for(let c = 0; c * 4 < G.length; c++){
      const q = G.slice(c*4, c*4 + 4);
      const opts = [
        { t1:[q[0], q[1]], t2:[q[2], q[3]] },
        { t1:[q[0], q[2]], t2:[q[1], q[3]] },
        { t1:[q[0], q[3]], t2:[q[1], q[2]] },
      ];
      ms.push(opts.reduce((a, b) => score([b], ctx) < score([a], ctx) ? b : a));
    }
    const s = score(ms, ctx);
    if(s < bestS){ bestS = s; best = ms; }
  }
  return best || [];
}

/* Chia sân giữa nam và nữ theo bên nào đang thiếu ván nhiều hơn */
function allocate(courts, defM, defF, availM, availF){
  let cm = 0, cf = 0;
  for(let i = 0; i < courts; i++){
    const sM = cm < availM ? defM / (cm + 1) : -1;
    const sF = cf < availF ? defF / (cf + 1) : -1;
    if(sM < 0 && sF < 0) break;
    if(sM >= sF) cm++; else cf++;
  }
  return { cm, cf };
}

function buildRound(ctx){
  const { mode, courts, maxGames } = ctx.cfg;
  const pool = ctx.players.filter(p => !maxGames || ctx.games[p.id] < maxGames);
  pool.forEach(p => { p._r = Math.random(); });
  /* ưu tiên: ít ván nhất -> nghỉ lâu nhất -> ngẫu nhiên */
  const prio = (a, b) => (ctx.games[a.id] - ctx.games[b.id])
                      || (ctx.rest[b.id] - ctx.rest[a.id]) || (a._r - b._r);

  if(mode === 'mixed'){
    const M = pool.filter(p => p.gender === 'M').sort(prio);
    const F = pool.filter(p => p.gender === 'F').sort(prio);
    const c = Math.min(courts, M.length >> 1, F.length >> 1);
    if(c < 1) return null;
    return arrangeMixed(M.slice(0, c*2), F.slice(0, c*2), ctx);
  }
  if(mode === 'split'){
    const M = pool.filter(p => p.gender === 'M').sort(prio);
    const F = pool.filter(p => p.gender === 'F').sort(prio);
    const need = arr => arr.reduce((s, p) => s + Math.max(0, ctx.cfg.minGames - ctx.games[p.id]), 0);
    const { cm, cf } = allocate(courts, need(M), need(F), M.length >> 2, F.length >> 2);
    if(cm + cf < 1) return null;
    return arrangeGroups(M.slice(0, cm*4), ctx).concat(arrangeGroups(F.slice(0, cf*4), ctx));
  }
  const all = pool.slice().sort(prio);
  const c = Math.min(courts, all.length >> 2);
  if(c < 1) return null;
  return arrangeGroups(all.slice(0, c*4), ctx);
}

/* Ghi nhận 1 vòng vào ctx, trả về danh sách người nghỉ vòng đó */
function commit(matches, ctx){
  const playing = new Set();
  for(const m of matches){
    [...m.t1, ...m.t2].forEach(p => { playing.add(p.id); ctx.games[p.id]++; ctx.rest[p.id] = 0; });
    const k1 = pk(m.t1[0], m.t1[1]), k2 = pk(m.t2[0], m.t2[1]);
    ctx.partner[k1] = (ctx.partner[k1] || 0) + 1;
    ctx.partner[k2] = (ctx.partner[k2] || 0) + 1;
    for(const a of m.t1) for(const b of m.t2){ const k = pk(a, b); ctx.opp[k] = (ctx.opp[k] || 0) + 1; }
  }
  return ctx.players.filter(p => !playing.has(p.id)).map(p => { ctx.rest[p.id]++; return p; });
}

/* Giới hạn số người: chế độ đôi nam nữ cắt cân bằng 2 giới, tránh lấy trúng toàn nam/toàn nữ */
function applyCap(list, cap, mode){
  if(!cap || list.length <= cap) return list;
  if(mode !== 'mixed') return list.slice(0, cap);
  const M = list.filter(p => p.gender === 'M'), F = list.filter(p => p.gender === 'F');
  let nm = Math.min(M.length, Math.floor(cap / 2));
  let nf = Math.min(F.length, cap - nm);
  nm = Math.min(M.length, cap - nf);                    // bên nào thiếu thì bên kia bù
  const keep = new Set([...M.slice(0, nm), ...F.slice(0, nf)]);
  return list.filter(p => keep.has(p));                 // giữ nguyên thứ tự danh sách
}

/* cfg = { mode, courts, minGames, maxGames, cap, ignoreRating } */
function generate(activeList, cfg){
  const list = applyCap(activeList, Math.max(0, cfg.cap || 0), cfg.mode);
  const dropped = activeList.filter(p => list.indexOf(p) === -1);

  if(list.length < 4) return { error: 'Cần ít nhất 4 người được tick "Chơi".' };
  const nM = list.filter(p => p.gender === 'M').length, nF = list.length - nM;
  if(cfg.mode === 'mixed' && (nM < 2 || nF < 2))
    return { error: 'Chế độ đôi nam nữ cần tối thiểu 2 nam và 2 nữ.' };
  if(cfg.mode === 'split' && nM < 4 && nF < 4)
    return { error: 'Chế độ tách nam nữ cần ít nhất 4 nam hoặc 4 nữ.' };

  const ctx = makeCtx(list, cfg);
  const rounds = [];
  let stall = 0;
  while(rounds.length < 200){
    const needy = list.filter(p => ctx.games[p.id] < cfg.minGames);
    if(!needy.length) break;
    const matches = buildRound(ctx);
    if(!matches || !matches.length) break;
    const before = needy.map(p => p.id);
    const resting = commit(matches, ctx);
    const progressed = before.some(id => !resting.find(r => r.id === id));
    rounds.push({ matches, resting });
    stall = progressed ? 0 : stall + 1;
    if(stall >= 3) break;
  }
  return { ctx, rounds, cfg, list, dropped };
}

/* ---- Dạng lưu trữ: chỉ id + ô điểm, để cất vào localStorage / Firestore ---- */

function toRounds(res){
  if(!res || res.error) return [];
  return res.rounds.map(r => ({
    matches: r.matches.map(m => ({
      a: m.t1.map(p => p.id), b: m.t2.map(p => p.id),
      s1: null, s2: null, win: null,
    })),
  }));
}

/* Dựng lại object người chơi + tính lại người nghỉ mỗi vòng.
   Trả null nếu danh sách người chơi đã đổi khiến lịch cũ không còn khớp. */
function hydrate(session, players){
  if(!session || !Array.isArray(session.rounds)) return null;
  const by = {};
  players.forEach(p => { by[p.id] = p; });

  const ids = session.playerIds || [];
  const list = ids.map(i => by[i]).filter(Boolean);
  if(!list.length || list.length !== ids.length) return null;

  const rounds = [];
  for(const r of session.rounds){
    const matches = [];
    for(const m of (r.matches || [])){
      const t1 = (m.a || []).map(i => by[i]), t2 = (m.b || []).map(i => by[i]);
      if(t1.length !== 2 || t2.length !== 2 || t1.concat(t2).some(p => !p)) return null;
      matches.push({ t1, t2, s1: m.s1, s2: m.s2, win: m.win || null });
    }
    rounds.push({ matches, resting: [] });
  }
  const ctx = makeCtx(list, session.cfg);
  rounds.forEach(r => { r.resting = commit(r.matches, ctx); });
  return { rounds, ctx, list };
}

/* Bảng thống kê: số trận được xếp, đã đấu, thắng, thua, hiệu số điểm */
function stats(h){
  if(!h) return [];
  const s = {};
  h.list.forEach(p => { s[p.id] = { p, sched: 0, done: 0, win: 0, loss: 0, diff: 0 }; });

  h.rounds.forEach(r => r.matches.forEach(m => {
    m.t1.concat(m.t2).forEach(p => { if(s[p.id]) s[p.id].sched++; });
    if(m.win !== 1 && m.win !== 2) return;
    const a = +m.s1 || 0, b = +m.s2 || 0;
    m.t1.forEach(p => { const x = s[p.id]; if(!x) return;
      x.done++; x.diff += a - b; if(m.win === 1) x.win++; else x.loss++; });
    m.t2.forEach(p => { const x = s[p.id]; if(!x) return;
      x.done++; x.diff += b - a; if(m.win === 2) x.win++; else x.loss++; });
  }));

  return Object.keys(s).map(k => s[k]).sort((x, y) =>
    y.win - x.win || y.diff - x.diff || x.p.name.localeCompare(y.p.name, 'vi'));
}

const API = { newId, pk, makeCtx, commit, applyCap, generate, toRounds, hydrate, stats };
if(typeof module !== 'undefined' && module.exports) module.exports = API;
root.PB = API;

})(typeof window !== 'undefined' ? window : globalThis);
