/* scheduler.js — thuật toán chia trận + thống kê kết quả.
   Thuần tuý: không đụng DOM, không Firebase. Chạy được cả trong trình duyệt lẫn Node. */
(function (root) {
'use strict';

const W_PARTNER = 120;   // phạt trùng bạn cùng đội
const W_OPP     = 22;    // phạt trùng đối thủ
const W_RATING  = 14;    // phạt lệch trình độ, theo bình phương
const W_OVERGAP = 600;   // phạt khi vượt ngưỡng lệch tối đa (xem mscore)
const SEEDS     = 24;    // số lần xáo ngẫu nhiên, mỗi lần đều được tinh chỉnh lại
const SWEEPS    = 40;    // số vòng tinh chỉnh tối đa (thường dừng sau 3-4 vòng)

/* ID ngẫu nhiên thay vì số tăng dần — tránh trùng khi nhiều người cùng thêm */
function newId(pre){ return (pre || 'p') + Math.random().toString(36).slice(2, 10); }

const pk = (a, b) => a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;

function makeCtx(list, cfg){
  const c = { players: list, cfg: cfg || {}, games: {}, rest: {}, partner: {}, opp: {} };
  list.forEach(p => { c.games[p.id] = 0; c.rest[p.id] = 0; });
  return c;
}

/* Chênh lệch tổng rating giữa 2 đội của một trận */
const gap = m => Math.abs(m.t1[0].rating + m.t1[1].rating - m.t2[0].rating - m.t2[1].rating);

/* Điểm phạt của MỘT trận. Các trận trong cùng vòng không ảnh hưởng nhau
   (mỗi người chỉ ở đúng một trận), nên tổng vòng = tổng điểm từng trận.
   Nhờ vậy phần tinh chỉnh chỉ cần tính lại trận vừa đổi. */
function mscore(m, ctx){
  let s = W_PARTNER * (Math.pow(ctx.partner[pk(m.t1[0], m.t1[1])] || 0, 2)
                     + Math.pow(ctx.partner[pk(m.t2[0], m.t2[1])] || 0, 2));
  for(const a of m.t1) for(const b of m.t2) s += W_OPP * (ctx.opp[pk(a, b)] || 0);

  if(!ctx.cfg.ignoreRating){
    const d = gap(m);
    s += W_RATING * d * d;                          // bình phương: lệch càng lớn càng bị phạt nặng
    /* Vượt ngưỡng phải trả một bậc phạt cố định lớn hơn hẳn mọi khoản khác
       (600 > 5 lần phạt trùng cặp), nên ngưỡng gần như là ràng buộc cứng.
       Phần bình phương phía sau chỉ để khi bất khả thi thì vẫn chọn cái vượt ít nhất. */
    const cap = ctx.cfg.maxGap;
    if(cap > 0 && d > cap) s += W_OVERGAP * (1 + (d - cap) * (d - cap));
  }
  return s;
}

function score(matches, ctx){
  let s = 0;
  for(const m of matches) s += mscore(m, ctx);
  return s;
}

/* Tinh chỉnh một vòng đã xáo: liên tục thử đổi chỗ 2 người, giữ lại nếu điểm phạt giảm.
   Dừng khi không còn cải thiện được nữa. */
function refine(matches, bench, ctx){
  const mixed = ctx.cfg.mode === 'mixed';
  const slots = [];
  matches.forEach((m, mi) => slots.push(
    { mi, t:'t1', i:0 }, { mi, t:'t1', i:1 }, { mi, t:'t2', i:0 }, { mi, t:'t2', i:1 }));

  const ms = matches.map(m => mscore(m, ctx));
  let total = ms.reduce((a, b) => a + b, 0);

  for(let sweep = 0; sweep < SWEEPS; sweep++){
    let improved = false;

    /* đổi chỗ 2 người đang ở trên sân */
    for(let a = 0; a < slots.length; a++){
      for(let b = a + 1; b < slots.length; b++){
        const A = slots[a], B = slots[b];
        if(A.mi === B.mi && A.t === B.t) continue;   // cùng một đội -> đổi chỗ vô nghĩa
        if(mixed && A.i !== B.i) continue;           // giữ cấu trúc 1 nam + 1 nữ mỗi đội

        const pa = matches[A.mi][A.t][A.i], pb = matches[B.mi][B.t][B.i];
        /* tách nam nữ: không được đưa nữ sang trận nam và ngược lại
           (chế độ đôi nam nữ đã an toàn nhờ ràng buộc A.i === B.i ở trên) */
        if(ctx.cfg.mode === 'split' && pa.gender !== pb.gender) continue;

        const old = ms[A.mi] + (A.mi === B.mi ? 0 : ms[B.mi]);
        matches[A.mi][A.t][A.i] = pb;
        matches[B.mi][B.t][B.i] = pa;
        const nA = mscore(matches[A.mi], ctx);
        const nB = A.mi === B.mi ? 0 : mscore(matches[B.mi], ctx);

        if(nA + nB < old - 1e-9){
          ms[A.mi] = nA;
          if(A.mi !== B.mi) ms[B.mi] = nB;
          total += nA + nB - old;
          improved = true;
        }else{
          matches[A.mi][A.t][A.i] = pa;
          matches[B.mi][B.t][B.i] = pb;
        }
      }
    }

    /* thay bằng người đang nghỉ CÓ CÙNG mức ưu tiên (bằng số ván và bằng số vòng nghỉ)
       -> mở rộng không gian tìm kiếm mà không hy sinh tính công bằng */
    for(let a = 0; a < slots.length; a++){
      const A = slots[a], pa = matches[A.mi][A.t][A.i];
      for(let k = 0; k < bench.length; k++){
        const pb = bench[k];
        if(ctx.games[pb.id] !== ctx.games[pa.id]) continue;
        if(ctx.rest[pb.id]  !== ctx.rest[pa.id])  continue;
        /* chế độ tự do thì ai vào cũng được; hai chế độ kia phải đúng giới tính */
        if(ctx.cfg.mode !== 'free' && pb.gender !== pa.gender) continue;

        const old = ms[A.mi];
        matches[A.mi][A.t][A.i] = pb;
        const n = mscore(matches[A.mi], ctx);
        if(n < old - 1e-9){
          ms[A.mi] = n;
          total += n - old;
          bench[k] = pa;
          improved = true;
          break;
        }
        matches[A.mi][A.t][A.i] = pa;
      }
    }

    if(!improved) break;
  }
  return total;
}

function shuffle(a){
  for(let i = a.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* 2C nam + 2C nữ -> C trận đôi nam nữ. Xáo nhiều lần, mỗi lần tinh chỉnh, giữ lại phương án tốt nhất. */
function arrangeMixed(males, females, bench, ctx){
  let best = null, bestS = Infinity;
  for(let t = 0; t < SEEDS; t++){
    const M = shuffle(males.slice()), F = shuffle(females.slice()), ms = [];
    for(let c = 0; c * 2 < M.length; c++){
      ms.push({ t1:[M[2*c], F[2*c]], t2:[M[2*c+1], F[2*c+1]] });
    }
    const s = refine(ms, bench.slice(), ctx);
    if(s < bestS){ bestS = s; best = ms; }
  }
  return best || [];
}

/* các nhóm (mỗi nhóm bội số 4, cùng giới hoặc tự do) -> các trận đôi */
function arrangeGroups(groups, bench, ctx){
  let best = null, bestS = Infinity;
  for(let t = 0; t < SEEDS; t++){
    const ms = [];
    groups.forEach(g => {
      const G = shuffle(g.slice());
      for(let c = 0; c * 4 < G.length; c++){
        ms.push({ t1:[G[c*4], G[c*4+1]], t2:[G[c*4+2], G[c*4+3]] });
      }
    });
    if(!ms.length) continue;
    const s = refine(ms, bench.slice(), ctx);
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
    return arrangeMixed(M.slice(0, c*2), F.slice(0, c*2),
                        M.slice(c*2).concat(F.slice(c*2)), ctx);
  }
  if(mode === 'split'){
    const M = pool.filter(p => p.gender === 'M').sort(prio);
    const F = pool.filter(p => p.gender === 'F').sort(prio);
    const need = arr => arr.reduce((s, p) => s + Math.max(0, ctx.cfg.minGames - ctx.games[p.id]), 0);
    const { cm, cf } = allocate(courts, need(M), need(F), M.length >> 2, F.length >> 2);
    if(cm + cf < 1) return null;
    return arrangeGroups([M.slice(0, cm*4), F.slice(0, cf*4)],
                         M.slice(cm*4).concat(F.slice(cf*4)), ctx);
  }
  const all = pool.slice().sort(prio);
  const c = Math.min(courts, all.length >> 2);
  if(c < 1) return null;
  return arrangeGroups([all.slice(0, c*4)], all.slice(c*4), ctx);
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

/* cfg = { mode, courts, minGames, maxGames, cap, maxGap, ignoreRating } */
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

/* ============================ ĐỘI CỐ ĐỊNH ============================
   Ở chế độ này đơn vị xếp lịch là ĐỘI (cặp 2 người cố định) chứ không phải cá nhân.
   Mục tiêu: mỗi đội đánh đủ số trận, và hạn chế gặp lại đội đã đấu rồi. */

/* Ở chế độ đội cố định, KHÔNG GẶP LẠI ĐỘI ĐÃ ĐẤU là mục tiêu số một.
   W_MET phải lớn hơn MỌI khoản phạt rating có thể có, nếu không thuật toán sẽ
   chấp nhận lặp cặp đấu để né ngưỡng lệch — ngược thứ tự ưu tiên.
   Rating 1–8 nên tổng đội là 2–16, lệch tối đa 14; phạt rating tối đa
   = 14*14² + 600*(1+13²) ≈ 105.000, nên 1.000.000 là đủ an toàn.
   Không chặn trên phần vượt ngưỡng: chặn sẽ làm mọi mức lệch lớn trông như nhau
   và ngưỡng mất khả năng phân biệt. */
const W_MET = 1000000;

const trating = t => t.p1.rating + t.p2.rating;

/* Ghép đội tự động. style: 'balanced' | 'mixed' | 'random' */
function makeTeams(players, style){
  const P = shuffle(players.slice());          // xáo trước để các trường hợp bằng nhau không bị thiên vị
  const teams = [], left = [];

  if(style === 'mixed'){
    const M = P.filter(p => p.gender === 'M'), F = P.filter(p => p.gender === 'F');
    const n = Math.min(M.length, F.length);
    for(let i = 0; i < n; i++) teams.push({ p1: M[i], p2: F[i] });
    left.push.apply(left, M.slice(n).concat(F.slice(n)));   // dư bên nào thì ghép cùng giới
  }else if(style === 'balanced'){
    const S = P.slice().sort((a, b) => b.rating - a.rating);
    while(S.length >= 2) teams.push({ p1: S.shift(), p2: S.pop() });   // mạnh nhất ghép yếu nhất
    left.push.apply(left, S);
  }else{
    left.push.apply(left, P);
  }

  for(let i = 0; i + 1 < left.length; i += 2) teams.push({ p1: left[i], p2: left[i+1] });
  return { teams, odd: left.length % 2 ? left[left.length - 1] : null };
}

function tscore(m, ctx){
  let s = W_MET * Math.pow(ctx.met[pk(m.t1, m.t2)] || 0, 2);
  if(!ctx.cfg.ignoreRating){
    const d = Math.abs(trating(m.t1) - trating(m.t2));
    s += W_RATING * d * d;
    const cap = ctx.cfg.maxGap;
    if(cap > 0 && d > cap) s += W_OVERGAP * (1 + (d - cap) * (d - cap));
  }
  return s;
}

function refineTeams(matches, bench, ctx){
  const slots = [];
  matches.forEach((m, mi) => slots.push({ mi, k:'t1' }, { mi, k:'t2' }));
  const ms = matches.map(m => tscore(m, ctx));
  let total = ms.reduce((a, b) => a + b, 0);

  for(let sweep = 0; sweep < SWEEPS; sweep++){
    let improved = false;

    /* đổi chỗ 2 đội giữa hai trận khác nhau */
    for(let a = 0; a < slots.length; a++){
      for(let b = a + 1; b < slots.length; b++){
        const A = slots[a], B = slots[b];
        if(A.mi === B.mi) continue;                  // đảo 2 đội trong cùng trận -> vẫn là trận đó
        const ta = matches[A.mi][A.k], tb = matches[B.mi][B.k];
        const old = ms[A.mi] + ms[B.mi];
        matches[A.mi][A.k] = tb;
        matches[B.mi][B.k] = ta;
        const nA = tscore(matches[A.mi], ctx), nB = tscore(matches[B.mi], ctx);
        if(nA + nB < old - 1e-9){
          ms[A.mi] = nA; ms[B.mi] = nB;
          total += nA + nB - old;
          improved = true;
        }else{
          matches[A.mi][A.k] = ta;
          matches[B.mi][B.k] = tb;
        }
      }
    }

    /* thay bằng đội đang nghỉ có cùng mức ưu tiên */
    for(let a = 0; a < slots.length; a++){
      const A = slots[a], ta = matches[A.mi][A.k];
      for(let k = 0; k < bench.length; k++){
        const tb = bench[k];
        /* Chỉ cần bằng số trận đã đấu. Khác chế độ cá nhân, ở đây không đòi bằng cả số vòng nghỉ:
           đội là khối cố định nên không gian lựa chọn đã rất hẹp, siết thêm thì gần như
           mỗi vòng chỉ còn đúng một cách xếp. Công bằng số trận vẫn được giữ nguyên. */
        if(ctx.games[tb.id] !== ctx.games[ta.id]) continue;
        const old = ms[A.mi];
        matches[A.mi][A.k] = tb;
        const n = tscore(matches[A.mi], ctx);
        if(n < old - 1e-9){
          ms[A.mi] = n; total += n - old; bench[k] = ta; improved = true; break;
        }
        matches[A.mi][A.k] = ta;
      }
    }

    if(!improved) break;
  }
  return total;
}

function buildTeamRound(ctx){
  const { courts, maxGames } = ctx.cfg;
  const pool = ctx.teams.filter(t => !maxGames || ctx.games[t.id] < maxGames);
  pool.forEach(t => { t._r = Math.random(); });
  const prio = (a, b) => (ctx.games[a.id] - ctx.games[b.id])
                      || (ctx.rest[b.id] - ctx.rest[a.id]) || (a._r - b._r);

  const sorted = pool.slice().sort(prio);
  const c = Math.min(courts, sorted.length >> 1);
  if(c < 1) return null;

  const sel = sorted.slice(0, c*2), bench = sorted.slice(c*2);
  let best = null, bestS = Infinity;
  for(let t = 0; t < SEEDS; t++){
    /* Seed 0 xếp theo rating rồi ghép hai đội liền kề — với một nhóm đội cho trước
       đây là cách ghép cho tổng chênh lệch nhỏ nhất, nên là điểm xuất phát rất tốt.
       Các seed còn lại xáo ngẫu nhiên để thoát khỏi cực tiểu cục bộ. */
    const T = t === 0 ? sel.slice().sort((a, b) => trating(a) - trating(b)) : shuffle(sel.slice());
    const ms = [];
    for(let i = 0; i * 2 < T.length; i++) ms.push({ t1: T[2*i], t2: T[2*i+1] });
    const s = refineTeams(ms, bench.slice(), ctx);
    if(s < bestS){ bestS = s; best = ms; }
  }
  return best || [];
}

function commitTeams(matches, ctx){
  const playing = new Set();
  for(const m of matches){
    [m.t1, m.t2].forEach(t => { playing.add(t.id); ctx.games[t.id]++; ctx.rest[t.id] = 0; });
    const k = pk(m.t1, m.t2);
    ctx.met[k] = (ctx.met[k] || 0) + 1;
  }
  return ctx.teams.filter(t => !playing.has(t.id)).map(t => { ctx.rest[t.id]++; return t; });
}

/* teams = [{ id, name, p1, p2 }] — p1/p2 là object người chơi */
function generateTeams(teams, cfg){
  const list = cfg.cap ? teams.slice(0, cfg.cap) : teams;
  const dropped = teams.filter(t => list.indexOf(t) === -1);
  if(list.length < 2)
    return { error: 'Cần ít nhất 2 đội có đủ cả 2 người được tick "Chơi".' };

  const ctx = { teams: list, cfg, games: {}, rest: {}, met: {} };
  list.forEach(t => { ctx.games[t.id] = 0; ctx.rest[t.id] = 0; });

  const rounds = [];
  let stall = 0;
  while(rounds.length < 200){
    const needy = list.filter(t => ctx.games[t.id] < cfg.minGames);
    if(!needy.length) break;
    const matches = buildTeamRound(ctx);
    if(!matches || !matches.length) break;
    const before = needy.map(t => t.id);
    const resting = commitTeams(matches, ctx);
    const progressed = before.some(id => !resting.find(r => r.id === id));
    rounds.push({ matches, resting });
    stall = progressed ? 0 : stall + 1;
    if(stall >= 3) break;
  }
  return { ctx, rounds, cfg, list, dropped };
}

/* Lưu trữ chung một định dạng với chế độ cá nhân: a/b là id 2 người mỗi bên.
   Thêm ta/tb để biết đó là đội nào. */
function toTeamRounds(res){
  if(!res || res.error) return [];
  return res.rounds.map(r => ({
    matches: r.matches.map(m => ({
      a: [m.t1.p1.id, m.t1.p2.id], b: [m.t2.p1.id, m.t2.p2.id],
      ta: m.t1.id, tb: m.t2.id,
      s1: null, s2: null, win: null,
    })),
  }));
}

/* Bảng xếp hạng theo ĐỘI (chế độ đội cố định) */
function teamStats(session, teams){
  const by = {};
  teams.forEach(t => { by[t.id] = t; });
  const s = {};

  (session.rounds || []).forEach(r => (r.matches || []).forEach(m => {
    [[m.ta, 1], [m.tb, 2]].forEach(pair => {
      const id = pair[0], side = pair[1];
      if(!id || !by[id]) return;
      const x = s[id] || (s[id] = { team: by[id], sched: 0, done: 0, win: 0, loss: 0, diff: 0 });
      x.sched++;
      if(m.win !== 1 && m.win !== 2) return;
      const a = +m.s1 || 0, b = +m.s2 || 0;
      x.done++;
      x.diff += side === 1 ? a - b : b - a;
      if(m.win === side) x.win++; else x.loss++;
    });
  }));

  return Object.keys(s).map(k => s[k]).sort((x, y) => y.win - x.win || y.diff - x.diff);
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
      matches.push({ t1, t2, s1: m.s1, s2: m.s2, win: m.win || null, ta: m.ta, tb: m.tb });
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

const API = { newId, pk, gap, makeCtx, commit, applyCap, generate, toRounds, hydrate, stats,
              makeTeams, generateTeams, toTeamRounds, teamStats };
if(typeof module !== 'undefined' && module.exports) module.exports = API;
root.PB = API;

})(typeof window !== 'undefined' ? window : globalThis);
