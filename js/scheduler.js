/* scheduler.js — ghép đội và xếp lịch thi đấu giữa các đội.
   Thuần tuý: không đụng DOM, không Firebase. Chạy được cả trong trình duyệt lẫn Node.

   Đơn vị xếp lịch là ĐỘI (cặp 2 người cố định). Thứ tự ưu tiên khi xếp trận:
     1. Không gặp lại đội đã đấu          (W_MET)
     2. Không đánh 2 trận liên tiếp       (W_BACK)
     3. Hai đội ngang trình độ nhau       (W_RATING / W_OVERGAP)
   Trọng số chênh nhau đủ lớn để mục tiêu trên luôn thắng mục tiêu dưới. */
(function (root) {
'use strict';

/* Rating 1–8 nên tổng đội 2–16, lệch tối đa 14.
   Trần phạt rating = 14*14² + 600*(1+13²) ≈ 105.000, nên các mốc dưới đây không chồng lấn. */
const W_MET     = 1000000;   // gặp lại đội đã đấu (bình phương theo số lần)
const W_BACK    = 200000;    // mỗi đội phải đánh trận liên tiếp
const W_RATING  = 14;        // lệch tổng rating, bình phương
const W_OVERGAP = 600;       // vượt ngưỡng lệch tối đa
const SEEDS     = 24;        // số lần xáo ngẫu nhiên mỗi vòng, mỗi lần đều được tinh chỉnh
const SWEEPS    = 40;        // số vòng tinh chỉnh tối đa

function newId(pre){ return (pre || 'p') + Math.random().toString(36).slice(2, 10); }

const pk = (a, b) => a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;

function shuffle(a){
  for(let i = a.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ============================ GHÉP ĐỘI ============================ */

const trating = t => t.p1.rating + t.p2.rating;

/* Ghép mạnh nhất với yếu nhất -> các đội có tổng rating gần bằng nhau. */
function pairBalanced(list){
  const S = list.slice().sort((a, b) => b.rating - a.rating);
  const out = [];
  while(S.length >= 2) out.push({ p1: S.shift(), p2: S.pop() });
  return { teams: out, odd: S[0] || null };
}

/* style: 'male' | 'female' | 'mixed' | 'random'. Kiểu nào cũng ưu tiên các đội ngang trình độ.
   Trả về { teams, odd, skipped }:
     odd     — người lẻ không ghép được (thiếu 1 người để đủ cặp)
     skipped — người không thuộc diện của kiểu đang chọn (vd chọn "Đôi nam" thì nữ bị bỏ ra) */
function makeTeams(players, style){
  const P = shuffle(players.slice());          // xáo trước để các trường hợp bằng điểm không thiên vị
  const M = P.filter(p => p.gender === 'M');
  const F = P.filter(p => p.gender === 'F');

  if(style === 'male'  ){ const r = pairBalanced(M); return { teams: r.teams, odd: r.odd, skipped: F }; }
  if(style === 'female'){ const r = pairBalanced(F); return { teams: r.teams, odd: r.odd, skipped: M }; }

  if(style === 'mixed'){
    /* Nam mạnh ghép nữ yếu (và ngược lại) để tổng các đội đều nhau. */
    const ms = M.slice().sort((a, b) => b.rating - a.rating);
    const fs = F.slice().sort((a, b) => a.rating - b.rating);
    const n = Math.min(ms.length, fs.length);
    const teams = [];
    for(let i = 0; i < n; i++) teams.push({ p1: ms[i], p2: fs[i] });
    /* Bên nào dư thì ghép cùng giới với nhau, vẫn theo mạnh+yếu, để không ai phải ngồi ngoài. */
    const rest = pairBalanced(ms.slice(n).concat(fs.slice(n)));
    return { teams: teams.concat(rest.teams), odd: rest.odd, skipped: [] };
  }

  const r = pairBalanced(P);
  return { teams: r.teams, odd: r.odd, skipped: [] };
}

/* ============================ XẾP TRẬN ============================ */

const gap = m => Math.abs(trating(m.t1) - trating(m.t2));

function tscore(m, ctx){
  let s = W_MET * Math.pow(ctx.met[pk(m.t1, m.t2)] || 0, 2);

  if(ctx.last[m.t1.id]) s += W_BACK;           // vòng trước vừa đánh rồi
  if(ctx.last[m.t2.id]) s += W_BACK;

  if(!ctx.cfg.ignoreRating){
    const d = gap(m);
    s += W_RATING * d * d;
    const cap = ctx.cfg.maxGap;
    if(cap > 0 && d > cap) s += W_OVERGAP * (1 + (d - cap) * (d - cap));
  }
  return s;
}

/* Tinh chỉnh một vòng đã xáo: đổi chỗ 2 đội, hoặc thay bằng đội đang nghỉ cùng mức ưu tiên.
   Giữ lại mọi thay đổi làm giảm điểm phạt, lặp tới khi không cải thiện được nữa. */
function refineTeams(matches, bench, ctx){
  const slots = [];
  matches.forEach((m, mi) => slots.push({ mi, k:'t1' }, { mi, k:'t2' }));
  const ms = matches.map(m => tscore(m, ctx));
  let total = ms.reduce((a, b) => a + b, 0);

  for(let sweep = 0; sweep < SWEEPS; sweep++){
    let improved = false;

    for(let a = 0; a < slots.length; a++){
      for(let b = a + 1; b < slots.length; b++){
        const A = slots[a], B = slots[b];
        if(A.mi === B.mi) continue;              // đảo 2 đội trong cùng trận -> vẫn là trận đó
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

    for(let a = 0; a < slots.length; a++){
      const A = slots[a], ta = matches[A.mi][A.k];
      for(let k = 0; k < bench.length; k++){
        const tb = bench[k];
        if(ctx.games[tb.id] !== ctx.games[ta.id]) continue;   // giữ công bằng số trận
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

function buildRound(ctx){
  const { courts, maxGames } = ctx.cfg;
  const pool = ctx.teams.filter(t => !maxGames || ctx.games[t.id] < maxGames);
  pool.forEach(t => { t._r = Math.random(); });

  /* ít trận nhất -> chưa đánh vòng trước -> nghỉ lâu nhất -> ngẫu nhiên */
  const prio = (a, b) => (ctx.games[a.id] - ctx.games[b.id])
                      || ((ctx.last[a.id] ? 1 : 0) - (ctx.last[b.id] ? 1 : 0))
                      || (ctx.rest[b.id] - ctx.rest[a.id])
                      || (a._r - b._r);

  const sorted = pool.slice().sort(prio);
  const c = Math.min(courts, sorted.length >> 1);
  if(c < 1) return null;

  const sel = sorted.slice(0, c*2), bench = sorted.slice(c*2);
  let best = null, bestS = Infinity;
  for(let t = 0; t < SEEDS; t++){
    /* Seed 0: xếp theo rating rồi ghép hai đội liền kề — cách ghép cho tổng lệch nhỏ nhất
       với một nhóm đội cho trước. Các seed sau xáo ngẫu nhiên để thoát cực tiểu cục bộ. */
    const T = t === 0 ? sel.slice().sort((a, b) => trating(a) - trating(b)) : shuffle(sel.slice());
    const ms = [];
    for(let i = 0; i * 2 < T.length; i++) ms.push({ t1: T[2*i], t2: T[2*i+1] });
    const s = refineTeams(ms, bench.slice(), ctx);
    if(s < bestS){ bestS = s; best = ms; }
  }
  return best || [];
}

function commit(matches, ctx){
  const playing = {};
  for(const m of matches){
    [m.t1, m.t2].forEach(t => { playing[t.id] = true; ctx.games[t.id]++; ctx.rest[t.id] = 0; });
    const k = pk(m.t1, m.t2);
    ctx.met[k] = (ctx.met[k] || 0) + 1;
  }
  const resting = ctx.teams.filter(t => !playing[t.id]);
  resting.forEach(t => { ctx.rest[t.id]++; });
  ctx.last = playing;                          // vòng sau dùng để tránh đánh liên tiếp
  return resting;
}

/* teams = [{ id, name, p1, p2 }] với p1/p2 là object người chơi.
   cfg   = { courts, minGames, maxGames, cap, maxGap, ignoreRating } */
function generate(teams, cfg){
  const list = cfg.cap ? teams.slice(0, cfg.cap) : teams;
  const dropped = teams.filter(t => list.indexOf(t) === -1);
  if(list.length < 2)
    return { error: 'Cần ít nhất 2 đội có đủ cả 2 người được tick "Chơi".' };

  const ctx = { teams: list, cfg, games: {}, rest: {}, met: {}, last: {} };
  list.forEach(t => { ctx.games[t.id] = 0; ctx.rest[t.id] = 0; });

  const rounds = [];
  let stall = 0;
  while(rounds.length < 200){
    const needy = list.filter(t => ctx.games[t.id] < cfg.minGames);
    if(!needy.length) break;
    const matches = buildRound(ctx);
    if(!matches || !matches.length) break;
    const before = needy.map(t => t.id);
    const resting = commit(matches, ctx);
    const progressed = before.some(id => !resting.find(r => r.id === id));
    rounds.push({ matches, resting });
    stall = progressed ? 0 : stall + 1;
    if(stall >= 3) break;
  }
  return { ctx, rounds, cfg, list, dropped };
}

/* ============================ LƯU TRỮ ============================ */

/* Chỉ lưu id đội + ô điểm. Người chơi suy ra từ đội nên không cần lưu lại. */
function toRounds(res){
  if(!res || res.error) return [];
  return res.rounds.map(r => ({
    matches: r.matches.map(m => ({ ta: m.t1.id, tb: m.t2.id, s1: null, s2: null, win: null })),
  }));
}

/* Dựng lại object từ dạng lưu trữ. Trả null nếu danh sách đội đã đổi khiến lịch cũ không còn khớp. */
function hydrate(session, teams){
  if(!session || !Array.isArray(session.rounds)) return null;
  const by = {};
  teams.forEach(t => { by[t.id] = t; });

  const rounds = [];
  for(const r of session.rounds){
    const matches = [];
    for(const m of (r.matches || [])){
      const t1 = by[m.ta], t2 = by[m.tb];
      if(!t1 || !t2) return null;
      matches.push({ t1, t2, ta: m.ta, tb: m.tb, s1: m.s1, s2: m.s2, win: m.win || null });
    }
    rounds.push({ matches, resting: [] });
  }

  /* chỉ tính các đội thực sự góp mặt trong lịch này */
  const used = {};
  rounds.forEach(r => r.matches.forEach(m => { used[m.ta] = true; used[m.tb] = true; }));
  const list = teams.filter(t => used[t.id]);

  rounds.forEach(r => {
    const play = {};
    r.matches.forEach(m => { play[m.ta] = true; play[m.tb] = true; });
    r.resting = list.filter(t => !play[t.id]);
  });
  return { rounds, list };
}

/* ============================ THỐNG KÊ ============================ */

function blank(team){ return { team, sched: 0, done: 0, win: 0, loss: 0, diff: 0 }; }

function tally(into, sessions, by){
  sessions.forEach(s => (s.rounds || []).forEach(r => (r.matches || []).forEach(m => {
    [[m.ta, 1], [m.tb, 2]].forEach(pair => {
      const id = pair[0], side = pair[1];
      if(!id || !by[id]) return;
      const x = into[id] || (into[id] = blank(by[id]));
      x.sched++;
      if(m.win !== 1 && m.win !== 2) return;
      const a = +m.s1 || 0, b = +m.s2 || 0;
      x.done++;
      x.diff += side === 1 ? a - b : b - a;
      if(m.win === side) x.win++; else x.loss++;
    });
  })));
  return into;
}

const rank = o => Object.keys(o).map(k => o[k])
  .sort((x, y) => y.win - x.win || y.diff - x.diff || x.done - y.done);

/* Bảng xếp hạng của MỘT danh sách trận */
function teamStats(session, teams){
  const by = {};
  teams.forEach(t => { by[t.id] = t; });
  return rank(tally({}, [session], by));
}

/* Bảng xếp hạng gộp NHIỀU danh sách trận (dùng cho thống kê cả ngày thi đấu) */
function dayStats(sessions, teams){
  const by = {};
  teams.forEach(t => { by[t.id] = t; });
  return rank(tally({}, sessions, by));
}

const API = { newId, pk, gap, trating, makeTeams, generate, toRounds, hydrate, teamStats, dayStats };
if(typeof module !== 'undefined' && module.exports) module.exports = API;
root.PB = API;

})(typeof window !== 'undefined' ? window : globalThis);
