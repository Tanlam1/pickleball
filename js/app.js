/* app.js — giao diện: cổng vào nhóm, 3 màn hình, sheet nhập điểm.
   Nối PBStore (trạng thái) với PB (thuật toán) và PBSync (đồng bộ). */
(function(){
'use strict';

const $ = id => document.getElementById(id);
const S = PBStore.state;

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sv  = v => (v === null || v === undefined || v === '') ? '–' : v;

const TITLE = { players:'Danh sách người chơi', teams:'Danh sách đội', matches:'Tạo trận' };
const STYLE = { male:'Đôi nam', female:'Đôi nữ', mixed:'Đôi nam nữ', random:'Ngẫu nhiên' };
const SAMPLE = [
  ['Minh','M',4.25],['Tuấn','M',3.75],['Hùng','M',3.5],['Nam','M',4.0],
  ['Dũng','M',3.25],['Khoa','M',3.5],['Phong','M',4.5],
  ['Lan','F',3.5],['Hoa','F',3.0],['Mai','F',3.75],['Thu','F',3.25],
  ['Linh','F',4.0],['Trang','F',3.0],['Ngọc','F',3.5],
];

let H = null;                  // lịch hiện tại đã dựng thành object
let standScope = 'session';    // 'session' | 'day'
let currentRoom = null;

let toastTimer = null;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

const dot      = p => `<span class="dot ${p.gender === 'M' ? 'm' : 'f'}"></span>`;
const pairHtml = t => dot(t.p1) + esc(t.p1.name) + ' &amp; ' + dot(t.p2) + esc(t.p2.name);
const pairText = t => t.p1.name + ' & ' + t.p2.name;
/* Đội có tên riêng thì tên đứng chính, tên 2 người xuống dòng phụ */
const sideHtml = t => t.name
  ? `<b>${esc(t.name)}</b><span class="tmembers">${pairHtml(t)}</span>` : pairHtml(t);
const sideText = t => t.name ? `${t.name} (${pairText(t)})` : pairText(t);

/* ============================ KHUNG ============================ */
function setDrawer(open){
  $('drawer').classList.toggle('open', open);
  $('scrim').classList.toggle('on', open);
}
$('btnMenu').onclick = () => setDrawer(true);
$('scrim').onclick   = () => setDrawer(false);

Array.prototype.forEach.call(document.querySelectorAll('.dnav'), b => {
  b.onclick = () => {
    S.view = b.dataset.view;
    setDrawer(false);
    PBStore.saveLocal();
    render();
  };
});

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if($('sheet').classList.contains('open')) closeSheet();
  else setDrawer(false);
});

function render(){
  $('viewPlayers').classList.toggle('hide', S.view !== 'players');
  $('viewTeams').classList.toggle('hide',   S.view !== 'teams');
  $('viewMatches').classList.toggle('hide', S.view !== 'matches');
  $('pageTitle').textContent = TITLE[S.view] || TITLE.players;
  Array.prototype.forEach.call(document.querySelectorAll('.dnav'),
    b => b.classList.toggle('on', b.dataset.view === S.view));
  $('navRosters').textContent  = S.rosters.length;
  $('navTeams').textContent    = S.teamSets.length;
  $('navSessions').textContent = S.sessions.length;
  if(S.view === 'players')      renderPlayers();
  else if(S.view === 'teams')   renderTeams();
  else                          renderMatches();
}

/* ============================ 1. DANH SÁCH NGƯỜI CHƠI ============================ */
function updateCount(){
  const r = PBStore.roster();
  const a = r.players.filter(p => p.active);
  $('pcount').textContent = r.players.length
    ? `${a.length}/${r.players.length} người được tick chơi · ${a.filter(p=>p.gender==='M').length} nam, ${a.filter(p=>p.gender==='F').length} nữ`
    : 'Danh sách trống — thêm người chơi ở dưới.';
}

function renderPlayers(){
  const r = PBStore.roster();
  $('rosterSel').innerHTML = S.rosters.map(x =>
    `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${esc(x.name)} (${x.players.length})</option>`).join('');

  $('plist').innerHTML = r.players.map((p, i) => `
    <tr>
      <td><input type="text" data-k="name" data-i="${i}" value="${esc(p.name)}"></td>
      <td><button class="gtoggle ${p.gender === 'M' ? 'm' : 'f'}" data-g="${i}">${p.gender === 'M' ? 'Nam' : 'Nữ'}</button></td>
      <td><input type="number" data-k="rating" data-i="${i}" value="${p.rating}" step="0.25" min="1" max="8" inputmode="decimal"></td>
      <td><input type="checkbox" class="ck" data-k="active" data-i="${i}" ${p.active ? 'checked' : ''}></td>
      <td><button class="icon danger" data-del="${i}" aria-label="Xoá">✕</button></td>
    </tr>`).join('');

  $('pempty').classList.toggle('hide', r.players.length > 0);
  updateCount();
}

/* sửa tại chỗ, không render lại cả bảng (giữ con trỏ khi đang gõ) */
$('plist').addEventListener('input', e => {
  const t = e.target, i = t.dataset.i, k = t.dataset.k;
  if(i === undefined || !k) return;
  const p = PBStore.roster().players[i];
  if(!p) return;
  if(k === 'active'){ p.active = t.checked; updateCount(); }
  else if(k === 'rating'){ p.rating = parseFloat(t.value) || 0; }
  else { p.name = t.value; }
  PBStore.save();
});

$('plist').addEventListener('click', e => {
  const g = e.target.closest('[data-g]');
  if(g){
    const p = PBStore.roster().players[+g.dataset.g];
    p.gender = p.gender === 'M' ? 'F' : 'M';
    g.className = 'gtoggle ' + (p.gender === 'M' ? 'm' : 'f');
    g.textContent = p.gender === 'M' ? 'Nam' : 'Nữ';
    updateCount();
    PBStore.save();
    return;
  }
  const d = e.target.closest('[data-del]');
  if(d){
    PBStore.roster().players.splice(+d.dataset.del, 1);
    renderPlayers();
    PBStore.save();
  }
});

$('rosterSel').onchange = () => { S.rosterId = $('rosterSel').value; PBStore.saveLocal(); renderPlayers(); };

$('btnRosterNew').onclick = () => {
  const n = prompt('Tên danh sách mới:', `Danh sách ${S.rosters.length + 1}`);
  if(n === null) return;
  PBStore.addRoster(n);
  render();
  PBStore.save();
};
$('btnRosterRename').onclick = () => {
  const r = PBStore.roster();
  const n = prompt('Đổi tên danh sách:', r.name);
  if(n === null || !n.trim()) return;
  r.name = n.trim().slice(0, 60);
  render();
  PBStore.save();
};
$('btnRosterDel').onclick = () => {
  const r = PBStore.roster();
  const ts = S.teamSets.filter(t => t.rosterId === r.id).length;
  if(!confirm(ts
    ? `Xoá danh sách "${r.name}"?\n\n${ts} danh sách đội (và các danh sách trận dùng chúng) sẽ bị xoá theo.`
    : `Xoá danh sách "${r.name}"?`)) return;
  PBStore.removeRoster(r.id);
  render();
  PBStore.save();
};

function addPlayer(name, gender, rating){
  name = String(name || '').trim();
  if(!name) return false;
  PBStore.roster().players.push(PBStore.normPlayer({ id: PB.newId('p'), name, gender, rating }));
  return true;
}
$('btnAdd').onclick = () => {
  if(!addPlayer($('fName').value, $('fGender').value, $('fRating').value)) return;
  $('fName').value = '';
  $('fName').focus();
  renderPlayers();
  PBStore.save();
};
$('fName').addEventListener('keydown', e => { if(e.key === 'Enter') $('btnAdd').click(); });

$('btnAll').onclick  = () => { PBStore.roster().players.forEach(p => p.active = true);  renderPlayers(); PBStore.save(); };
$('btnNone').onclick = () => { PBStore.roster().players.forEach(p => p.active = false); renderPlayers(); PBStore.save(); };
$('btnSample').onclick = () => {
  const r = PBStore.roster();
  if(r.players.length && !confirm(`Thay ${r.players.length} người trong "${r.name}" bằng 14 người mẫu?`)) return;
  r.players = [];
  SAMPLE.forEach(s => addPlayer(s[0], s[1], s[2]));
  renderPlayers();
  PBStore.save();
};
$('btnBulk').onclick       = () => { $('bulkBox').classList.remove('hide'); $('bulkText').focus(); };
$('btnBulkCancel').onclick = () => { $('bulkBox').classList.add('hide'); };
$('btnBulkGo').onclick = () => {
  let n = 0;
  $('bulkText').value.split('\n').forEach(line => {
    const c = line.split(/[,\t;]/).map(x => x.trim());
    if(!c[0]) return;
    if(addPlayer(c[0], /^(n[ữu]|f|female|w)$/i.test(c[1] || '') ? 'F' : 'M', c[2])) n++;
  });
  $('bulkText').value = '';
  $('bulkBox').classList.add('hide');
  renderPlayers();
  PBStore.save();
  toast(n ? `Đã thêm ${n} người` : 'Không đọc được dòng nào');
};

/* ============================ 2. DANH SÁCH ĐỘI ============================ */
function pickTeamSet(){
  const on = PBStore.teamSetsOn(S.teamDate);
  if(on.map(t => t.id).indexOf(S.teamSetId) < 0) S.teamSetId = on.length ? on[0].id : null;
  return on;
}

function renderTeams(){
  $('tDate').value = S.teamDate;
  const on = pickTeamSet();
  const ts = PBStore.teamSet();

  $('tSetSel').innerHTML = on.map(x =>
    `<option value="${x.id}"${ts && x.id === ts.id ? ' selected' : ''}>${esc(x.name)} (${x.teams.length} đội)</option>`).join('')
    || '<option>— chưa có —</option>';
  $('tSetSel').disabled      = !on.length;
  $('btnTSetRename').disabled = !ts;
  $('btnTSetDel').disabled    = !ts;
  $('noTeamSet').classList.toggle('hide', !!ts);
  $('teamBody').classList.toggle('hide', !ts);
  $('tSetMeta').textContent = on.length
    ? `${on.length} danh sách đội trong ngày ${PBStore.showDate(S.teamDate)}`
    : '';
  if(!ts) return;

  const r = PBStore.rosterOf(ts);
  $('tRosterSel').innerHTML = S.rosters.map(x =>
    `<option value="${x.id}"${r && x.id === r.id ? ' selected' : ''}>${esc(x.name)} (${x.players.length} người)</option>`).join('');

  const teams = PBStore.teamsOf(ts);
  const live  = PBStore.liveTeams(ts);
  const left  = PBStore.unteamed(ts, true);
  const off   = PBStore.unteamed(ts).length - left.length;
  const a     = r ? r.players.filter(p => p.active) : [];

  $('tcount').textContent =
    `${a.length} người đang tick Chơi (${a.filter(p=>p.gender==='M').length} nam, ${a.filter(p=>p.gender==='F').length} nữ)`;

  $('tlist').innerHTML = teams.map((t, i) => `
    <tr>
      <td class="rk">${i + 1}</td>
      <td>
        <input type="text" data-tname="${t.id}" value="${esc(t.name)}"
               placeholder="${esc(t.p1.name)} &amp; ${esc(t.p2.name)}">
        <div class="tmembers">${pairHtml(t)}${
          (t.p1.active && t.p2.active) ? '' : ' <span class="tout">có người chưa tick Chơi</span>'}</div>
      </td>
      <td class="num">${PB.trating(t).toFixed(2)}</td>
      <td><button class="icon danger" data-tdel="${t.id}" aria-label="Xoá đội">✕</button></td>
    </tr>`).join('');

  $('tempty').classList.toggle('hide', teams.length > 0);
  if(teams.length){
    const sums = teams.map(PB.trating);
    $('tmeta').textContent = `${teams.length} đội · ${live.length} đội đủ người · tổng rating ${Math.min.apply(null, sums).toFixed(2)}–${Math.max.apply(null, sums).toFixed(2)}`;
  }else{
    $('tmeta').textContent = '';
  }

  const opts = left.map(p => `<option value="${p.id}">${esc(p.name)} (${p.rating.toFixed(2)})</option>`).join('');
  $('tPickA').innerHTML = opts;
  $('tPickB').innerHTML = opts;
  if(left.length > 1) $('tPickB').value = left[1].id;
  $('btnTeamAdd').disabled = left.length < 2;
  $('tleft').textContent =
    (left.length ? `Chưa có đội: ${left.map(p => p.name).join(', ')}. ` : 'Mọi người đang chơi đều đã có đội. ') +
    (off ? `${off} người chưa tick "Chơi" nên không được ghép đội.` : '');
}

$('tDate').onchange = () => {
  S.teamDate = PBStore.normDate($('tDate').value);
  PBStore.saveLocal();
  renderTeams();
};
$('btnTDateToday').onclick = () => { S.teamDate = PBStore.today(); PBStore.saveLocal(); renderTeams(); };
$('tSetSel').onchange = () => { S.teamSetId = $('tSetSel').value; PBStore.saveLocal(); renderTeams(); };

$('btnTSetNew').onclick = () => {
  PBStore.addTeamSet(S.teamDate);
  render();
  PBStore.save();
};
$('btnTSetRename').onclick = () => {
  const ts = PBStore.teamSet();
  const n = prompt('Đổi tên danh sách đội:', ts.name);
  if(n === null || !n.trim()) return;
  ts.name = n.trim().slice(0, 60);
  render();
  PBStore.save();
};
$('btnTSetDel').onclick = () => {
  const ts = PBStore.teamSet();
  const used = S.sessions.filter(s => s.teamSetId === ts.id).length;
  if(!confirm(used
    ? `Xoá "${ts.name}"?\n\n${used} danh sách trận đang dùng nó sẽ bị xoá theo.`
    : `Xoá danh sách đội "${ts.name}"?`)) return;
  PBStore.removeTeamSet(ts.id);
  render();
  PBStore.save();
};
$('noTeamSet').onclick = () => $('btnTSetNew').click();

$('tRosterSel').onchange = () => {
  const ts = PBStore.teamSet();
  if(ts.teams.length && !confirm('Đổi danh sách người chơi sẽ xoá toàn bộ đội đang có. Tiếp tục?')){
    $('tRosterSel').value = ts.rosterId;
    return;
  }
  ts.rosterId = $('tRosterSel').value;
  ts.teams = [];
  renderTeams();
  PBStore.save();
};

$('tlist').addEventListener('input', e => {
  const id = e.target.dataset.tname;
  if(!id) return;
  const t = PBStore.teamSet().teams.find(x => x.id === id);
  if(t){ t.name = e.target.value.slice(0, 40); PBStore.save(); }
});
$('tlist').addEventListener('click', e => {
  const b = e.target.closest('[data-tdel]');
  if(!b) return;
  const ts = PBStore.teamSet();
  ts.teams = ts.teams.filter(t => t.id !== b.dataset.tdel);
  renderTeams();
  PBStore.save();
});

/* Chỉ ghép đội cho người đang tick "Chơi" */
function buildTeamsFor(ts, style){
  if(!ts) return false;
  const r = PBStore.rosterOf(ts);
  const pool = r ? r.players.filter(p => p.active) : [];
  if(pool.length < 2){ toast('Cần ít nhất 2 người được tick "Chơi"'); return false; }

  const out = PB.makeTeams(pool, style);
  if(!out.teams.length){
    toast(`Không đủ người cho kiểu "${STYLE[style]}"`);
    return false;
  }
  if(ts.teams.length && !confirm(
      `${STYLE[style]}: ghép được ${out.teams.length} đội từ ${pool.length} người đang tick "Chơi".` +
      `\n\nToàn bộ ${ts.teams.length} đội hiện có trong "${ts.name}" sẽ bị thay. Tiếp tục?`)) return false;

  ts.teams = out.teams.map(t => ({ id: PB.newId('t'), name: '', a: t.p1.id, b: t.p2.id }));
  PBStore.save();

  const notes = [];
  if(out.odd) notes.push(`${out.odd.name} lẻ`);
  if(out.skipped.length) notes.push(`bỏ ${out.skipped.length} người không thuộc kiểu này`);
  const offCount = r.players.length - pool.length;
  if(offCount) notes.push(`bỏ ${offCount} người chưa tick Chơi`);
  toast(`${STYLE[style]}: ${ts.teams.length} đội` + (notes.length ? ` — ${notes.join(', ')}` : ''));
  return true;
}
function buildTeams(style){ if(buildTeamsFor(PBStore.teamSet(), style)) render(); }
$('btnTeamMale').onclick   = () => buildTeams('male');
$('btnTeamFemale').onclick = () => buildTeams('female');
$('btnTeamMixed').onclick  = () => buildTeams('mixed');
$('btnTeamRandom').onclick = () => buildTeams('random');

$('btnTeamAdd').onclick = () => {
  const a = $('tPickA').value, b = $('tPickB').value;
  if(!a || !b || a === b){ toast('Chọn hai người khác nhau'); return; }
  PBStore.teamSet().teams.push({ id: PB.newId('t'), name: '', a: a, b: b });
  renderTeams();
  PBStore.save();
};

/* ============================ 3. TẠO TRẬN ============================ */
function pickSession(){
  const on = PBStore.sessionsOn(S.matchDate);
  if(on.map(s => s.id).indexOf(S.sessionId) < 0) S.sessionId = on.length ? on[0].id : null;
  return on;
}

/* Tất cả đội xuất hiện trong các danh sách trận của một ngày (để thống kê cả ngày) */
function dayTeams(date){
  const seen = {};
  let out = [];
  PBStore.sessionsOn(date).forEach(s => {
    if(!s.teamSetId || seen[s.teamSetId]) return;
    seen[s.teamSetId] = true;
    const ts = S.teamSets.find(t => t.id === s.teamSetId);
    if(ts) out = out.concat(PBStore.teamsOf(ts));
  });
  return out;
}

function renderMatches(){
  $('mDate').value = S.matchDate;
  const on = pickSession();
  const s  = PBStore.session();

  $('sessionSel').innerHTML = on.map(x =>
    `<option value="${x.id}"${s && x.id === s.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')
    || '<option>— chưa có —</option>';
  $('sessionSel').disabled      = !on.length;
  $('btnSessionRename').disabled = !s;
  $('btnSessionDel').disabled    = !s;
  $('noSession').classList.toggle('hide', !!s);
  $('sessionBody').classList.toggle('hide', !s);
  if(!s) return;

  /* ưu tiên danh sách đội cùng ngày, nhưng vẫn cho chọn của ngày khác */
  const sameDay = PBStore.teamSetsOn(S.matchDate);
  const others  = S.teamSets.filter(t => t.date !== S.matchDate);
  const opt = t => `<option value="${t.id}"${t.id === s.teamSetId ? ' selected' : ''}>${esc(t.name)} — ${PBStore.liveTeams(t).length} đội</option>`;
  $('cTeamSet').innerHTML =
    (sameDay.length ? `<optgroup label="Ngày ${PBStore.showDate(S.matchDate)}">${sameDay.map(opt).join('')}</optgroup>` : '') +
    (others.length  ? `<optgroup label="Ngày khác">${others.map(t =>
        `<option value="${t.id}"${t.id === s.teamSetId ? ' selected' : ''}>${PBStore.showDate(t.date)} · ${esc(t.name)} — ${PBStore.liveTeams(t).length} đội</option>`).join('')}</optgroup>` : '');

  $('cCourts').value        = s.cfg.courts;
  $('cMin').value           = s.cfg.minGames;
  $('cMax').value           = s.cfg.maxGames;
  $('cCap').value           = s.cfg.cap;
  $('cMaxGap').value        = s.cfg.maxGap;
  $('cIgnoreRating').checked = s.cfg.ignoreRating;
  $('cMaxGap').disabled      = s.cfg.ignoreRating;

  const ts = PBStore.teamSetOf(s);
  const box = $('teamNotice');
  if(!ts){
    box.classList.remove('hide');
    box.innerHTML = `Chưa chọn được danh sách đội. Sang mục <b>Danh sách đội</b> tạo một danh sách cho ngày ${PBStore.showDate(S.matchDate)}.`;
  }else{
    const all = PBStore.teamsOf(ts), live = PBStore.liveTeams(ts);
    if(!all.length){
      box.classList.remove('hide');
      box.innerHTML = `Danh sách đội <b>${esc(ts.name)}</b> chưa có đội nào — sang mục <b>Danh sách đội</b> để ghép.`;
    }else if(live.length < all.length){
      box.classList.remove('hide');
      box.innerHTML = `${all.length - live.length}/${all.length} đội không tham gia được vì có người chưa tick "Chơi".`;
    }else{
      box.classList.add('hide');
    }
  }

  updateGenHint();
  renderRounds();
}

/* Ước lượng ngay dưới ô nhập để biết sắp tạo ra bao nhiêu vòng / trận */
function updateGenHint(){
  const s  = PBStore.session();
  const ts = PBStore.teamSetOf(s);
  const n  = ts ? PBStore.liveTeams(ts).length : 0;
  if(n < 2){ $('genHint').textContent = ''; return; }
  const perRound = Math.min(s.cfg.courts, n >> 1);
  const matches  = Math.ceil(n * s.cfg.minGames / 2);
  const rounds   = Math.ceil(matches / perRound);
  $('genHint').textContent =
    `${n} đội × ${s.cfg.minGames} trận → khoảng ${rounds} vòng, ${matches} trận` +
    (perRound < s.cfg.courts ? ` — chỉ dùng được ${perRound}/${s.cfg.courts} sân vì có ${n} đội` : '');
}

function renderRounds(){
  const s  = PBStore.session();
  const ts = PBStore.teamSetOf(s);
  const teams = ts ? PBStore.teamsOf(ts) : [];
  H = PB.hydrate(s, teams);

  const bare = warn => {
    $('rounds').innerHTML = '';
    $('warnings').innerHTML = warn ? `<div class="warn">${warn}</div>` : '';
  };

  /* ---- bảng xếp hạng (luôn hiện, kể cả khi chưa có lịch, để xem thống kê cả ngày) ---- */
  const dayRows = PB.dayStats(PBStore.sessionsOn(S.matchDate), dayTeams(S.matchDate));
  const sesRows = ts ? PB.teamStats(s, teams) : [];
  const rows = standScope === 'day' ? dayRows : sesRows;

  $('tabSession').classList.toggle('on', standScope === 'session');
  $('tabDay').classList.toggle('on', standScope === 'day');
  $('standTeamBody').innerHTML = rows.map((x, i) => `
    <tr>
      <td class="rk">${i + 1}</td>
      <td>${esc(PBStore.teamLabel(x.team))}${x.team.name
        ? `<div class="tmembers">${pairHtml(x.team)}</div>` : ''}</td>
      <td class="num">${x.done}/${x.sched}</td>
      <td class="num">${x.win}</td>
      <td class="num">${x.loss}</td>
      <td class="num">${x.diff > 0 ? '+' : ''}${x.diff}</td>
    </tr>`).join('');
  $('standEmpty').classList.toggle('hide', rows.length > 0);

  const scopeSessions = standScope === 'day' ? PBStore.sessionsOn(S.matchDate) : [s];
  let all = 0, done = 0;
  scopeSessions.forEach(x => (x.rounds || []).forEach(r => (r.matches || []).forEach(m => {
    all++; if(m.win === 1 || m.win === 2) done++;
  })));
  $('standMeta').textContent = standScope === 'day'
    ? `Ngày ${PBStore.showDate(S.matchDate)} · ${scopeSessions.length} danh sách trận · ${done}/${all} trận đã có kết quả`
    : `${done}/${all} trận đã có kết quả`;

  /* ---- lịch ---- */
  if(!s.rounds.length){ bare('Chưa có lịch. Bấm <b>Tạo trận ngẫu nhiên</b> ở trên.'); return; }
  if(!H){ bare('Danh sách đội đã thay đổi nên lịch cũ không còn khớp. Bấm <b>Tạo trận ngẫu nhiên</b> để xếp lại.'); return; }

  /* ---- cảnh báo ---- */
  const w = [];
  const short = sesRows.filter(x => x.sched < s.cfg.minGames);
  if(short.length)
    w.push(`Chưa đủ ${s.cfg.minGames} trận cho: <b>${short.map(x=>esc(PBStore.teamLabel(x.team))+' ('+x.sched+')').join(', ')}</b>. Tăng số sân hoặc giảm trận tối thiểu.`);

  const met = {}, back = [];
  let prev = {};
  H.rounds.forEach((rd, ri) => {
    const now = {};
    rd.matches.forEach(m => {
      const k = m.ta < m.tb ? m.ta + '|' + m.tb : m.tb + '|' + m.ta;
      met[k] = (met[k] || 0) + 1;
      [m.t1, m.t2].forEach(t => {
        now[t.id] = true;
        if(prev[t.id]) back.push(`${PBStore.teamLabel(t)} (vòng ${ri}→${ri+1})`);
      });
    });
    prev = now;
  });
  const keys = Object.keys(met), rep = keys.filter(k => met[k] > 1).length;
  if(rep)
    w.push(`${rep}/${keys.length} cặp đấu bị lặp. Với ${H.list.length} đội thì mỗi đội chỉ có ${H.list.length - 1} đối thủ khác nhau — muốn hết lặp thì giảm trận tối thiểu xuống ${H.list.length - 1} hoặc thêm đội.`);
  if(back.length)
    w.push(`${back.length} lượt phải đánh 2 trận liên tiếp: ${back.slice(0, 6).map(esc).join(', ')}${back.length > 6 ? '…' : ''}. Không tránh được khi số đội ít hơn ${s.cfg.courts * 4}.`);

  if(!s.cfg.ignoreRating && s.cfg.maxGap > 0){
    const over = [];
    H.rounds.forEach((rd, ri) => rd.matches.forEach((m, ci) => {
      const g = PB.gap(m);
      if(g > s.cfg.maxGap + 1e-9) over.push(`vòng ${ri+1} sân ${ci+1} (lệch ${g.toFixed(2)})`);
    }));
    if(over.length)
      w.push(`${over.length} trận lệch rating quá ${s.cfg.maxGap}: ${over.join(', ')}. Do các đội buộc phải ra sân chênh trình nhau.`);
  }
  $('warnings').innerHTML = w.length
    ? `<div class="warn"><b>Lưu ý</b><ul><li>${w.join('</li><li>')}</li></ul></div>` : '';

  /* ---- các vòng ---- */
  const rate = !s.cfg.ignoreRating;
  $('rounds').innerHTML = H.rounds.map((rd, ri) => `
    <div class="round">
      <div class="rhead">
        <span class="rt">Vòng ${ri + 1}</span>
        <span class="rest">${rd.resting.length ? 'Nghỉ: ' + rd.resting.map(t => esc(PBStore.teamLabel(t))).join(', ') : 'Tất cả ra sân'}</span>
      </div>
      <div class="rounds-grid">${rd.matches.map((m, ci) => {
        const fin = m.win === 1 || m.win === 2;
        const g = PB.gap(m);
        const over = s.cfg.maxGap > 0 && g > s.cfg.maxGap + 1e-9;
        return `<button class="match" data-r="${ri}" data-c="${ci}">
          <span class="mhead">
            <span>Sân ${ci + 1}${rate ? ` <span class="gap${over ? ' over' : ''}">lệch ${g.toFixed(2)}</span>` : ''}</span>
            <span class="mstate ${fin ? 'done' : ''}">${fin ? '✓ Đã ghi' : 'Chạm để nhập điểm'}</span>
          </span>
          <span class="mteam ${m.win === 1 ? 'win' : ''}">
            <span class="names">${sideHtml(m.t1)}${rate ? ` <small class="meta">${PB.trating(m.t1).toFixed(2)}</small>` : ''}</span>
            <span class="sc">${sv(m.s1)}</span>
          </span>
          <span class="mdiv"></span>
          <span class="mteam ${m.win === 2 ? 'win' : ''}">
            <span class="names">${sideHtml(m.t2)}${rate ? ` <small class="meta">${PB.trating(m.t2).toFixed(2)}</small>` : ''}</span>
            <span class="sc">${sv(m.s2)}</span>
          </span>
        </button>`;
      }).join('')}</div>
    </div>`).join('');
}

$('mDate').onchange = () => {
  S.matchDate = PBStore.normDate($('mDate').value);
  PBStore.saveLocal();
  renderMatches();
};
$('btnMDateToday').onclick = () => { S.matchDate = PBStore.today(); PBStore.saveLocal(); renderMatches(); };
$('sessionSel').onchange = () => { S.sessionId = $('sessionSel').value; PBStore.saveLocal(); renderMatches(); };

$('btnSessionNew').onclick = () => {
  PBStore.addSession(S.matchDate);
  render();
  PBStore.save();
};
$('btnSessionRename').onclick = () => {
  const s = PBStore.session();
  const n = prompt('Đổi tên danh sách trận:', s.name);
  if(n === null || !n.trim()) return;
  s.name = n.trim().slice(0, 60);
  render();
  PBStore.save();
};
$('btnSessionDel').onclick = () => {
  const s = PBStore.session();
  if(!confirm(`Xoá danh sách trận "${s.name}"? Kết quả đã nhập sẽ mất.`)) return;
  PBStore.removeSession(s.id);
  render();
  PBStore.save();
};
$('noSession').onclick = () => $('btnSessionNew').click();

$('cTeamSet').onchange = () => {
  const s = PBStore.session();
  if(s.rounds.length && !confirm('Đổi danh sách đội sẽ xoá lịch và kết quả của danh sách trận này. Tiếp tục?')){
    $('cTeamSet').value = s.teamSetId;
    return;
  }
  s.teamSetId = $('cTeamSet').value;
  s.rounds = [];
  renderMatches();
  PBStore.save();
};

$('btnCfgToggle').onclick = () => $('cfgBody').classList.toggle('hide');

function readCfg(){
  PBStore.session().cfg = PBStore.normCfg({
    courts:       $('cCourts').value,
    minGames:     $('cMin').value,
    maxGames:     $('cMax').value,
    cap:          $('cCap').value,
    maxGap:       $('cMaxGap').value,
    ignoreRating: $('cIgnoreRating').checked,
  });
  $('cMaxGap').disabled = PBStore.session().cfg.ignoreRating;
}
['cCourts','cMin','cMax','cCap','cMaxGap','cIgnoreRating'].forEach(id =>
  $(id).addEventListener('change', () => { readCfg(); updateGenHint(); PBStore.save(); }));

Array.prototype.forEach.call(document.querySelectorAll('.tab'), b => {
  b.onclick = () => { standScope = b.dataset.scope; renderRounds(); };
});

$('btnGen').onclick = () => {
  const s  = PBStore.session();
  const ts = PBStore.teamSetOf(s);
  if(!ts){ toast('Chưa chọn danh sách đội'); return; }
  if(PBStore.hasResults(s) &&
     !confirm('Danh sách trận này đã có kết quả. Tạo lại sẽ xoá toàn bộ điểm đã nhập. Tiếp tục?')) return;

  readCfg();
  const res = PB.generate(PBStore.liveTeams(ts), s.cfg);
  if(res.error){
    s.rounds = [];
    renderMatches();
    $('warnings').innerHTML = `<div class="warn">${esc(res.error)}</div>`;
    PBStore.save();
    toast(res.error);
    return;
  }
  s.rounds = PB.toRounds(res);
  PBStore.save();
  renderMatches();
  toast(`${s.rounds.length} vòng · ${s.rounds.reduce((n,x)=>n+x.matches.length,0)} trận`);
};

/* ---- xuất ---- */
function asText(){
  const s = PBStore.session();
  if(!s || !H) return '';
  let out = `${s.name.toUpperCase()} — ngày ${PBStore.showDate(s.date)}\n${H.list.length} đội · ${s.cfg.courts} sân · ${H.rounds.length} vòng\n`;
  H.rounds.forEach((rd, i) => {
    out += `\n--- VÒNG ${i + 1} ---\n`;
    rd.matches.forEach((m, c) => {
      const sc = (m.win === 1 || m.win === 2) ? `  [${sv(m.s1)}-${sv(m.s2)}]` : '';
      out += `Sân ${c+1}: ${sideText(m.t1)}  vs  ${sideText(m.t2)}${sc}\n`;
    });
    if(rd.resting.length) out += `Nghỉ: ${rd.resting.map(t => PBStore.teamLabel(t)).join(', ')}\n`;
  });
  const st = PB.teamStats(s, H.list);
  if(st.some(x => x.done)){
    out += `\n--- BẢNG XẾP HẠNG ---\n`;
    st.forEach((x, i) => {
      out += `${i+1}. ${PBStore.teamLabel(x.team)}: ${x.done} trận, thắng ${x.win}, thua ${x.loss} (${x.diff > 0 ? '+' : ''}${x.diff})\n`;
    });
  }
  return out;
}
$('btnCopy').onclick = async () => {
  const t = asText();
  if(!t) return;
  try{ await navigator.clipboard.writeText(t); toast('Đã copy'); }
  catch(e){ prompt('Copy thủ công:', t); }
};
$('btnPrint').onclick = () => window.print();

/* ============================ SHEET NHẬP ĐIỂM ============================ */
let sheetRef = null, sheetWin = null;

function setWin(w){
  sheetWin = (w === 1 || w === 2) ? w : null;
  $('sTeam1').classList.toggle('win', sheetWin === 1);
  $('sTeam2').classList.toggle('win', sheetWin === 2);
}
function autoWin(){
  const a = $('sScore1').value, b = $('sScore2').value;
  if(a === '' || b === '') return;
  setWin(+a === +b ? null : (+a > +b ? 1 : 2));
}
function openSheet(ri, ci){
  const s = PBStore.session();
  const m = s.rounds[ri] && s.rounds[ri].matches[ci];
  const h = H && H.rounds[ri] && H.rounds[ri].matches[ci];
  if(!m || !h) return;
  sheetRef = { ri, ci };
  $('sheetTitle').textContent = `Vòng ${ri + 1} · Sân ${ci + 1}`;
  $('sNames1').innerHTML = sideHtml(h.t1);
  $('sNames2').innerHTML = sideHtml(h.t2);
  $('sScore1').value = m.s1 === null ? '' : m.s1;
  $('sScore2').value = m.s2 === null ? '' : m.s2;
  setWin(m.win);
  $('sheet').classList.add('open');
  $('sheetScrim').classList.add('on');
}
function closeSheet(){
  $('sheet').classList.remove('open');
  $('sheetScrim').classList.remove('on');
  sheetRef = null;
}

$('rounds').addEventListener('click', e => {
  const b = e.target.closest('.match');
  if(b) openSheet(+b.dataset.r, +b.dataset.c);
});
$('sheetScrim').onclick = closeSheet;
$('sheetClose').onclick = closeSheet;

$('sheet').addEventListener('click', e => {
  const st = e.target.closest('[data-step]');
  if(st){
    const inp = $('sScore' + st.dataset.step);
    inp.value = Math.max(0, Math.min(99, (parseInt(inp.value, 10) || 0) + (+st.dataset.d)));
    autoWin();
    return;
  }
  const tm = e.target.closest('[data-team]');
  if(tm) setWin(+tm.dataset.team);
});
$('sScore1').addEventListener('input', autoWin);
$('sScore2').addEventListener('input', autoWin);

$('sheetSave').onclick = () => {
  if(!sheetRef) return;
  const m = PBStore.session().rounds[sheetRef.ri].matches[sheetRef.ci];
  const a = $('sScore1').value, b = $('sScore2').value;
  m.s1  = a === '' ? null : Math.max(0, Math.min(99, parseInt(a, 10) || 0));
  m.s2  = b === '' ? null : Math.max(0, Math.min(99, parseInt(b, 10) || 0));
  m.win = sheetWin;
  PBStore.save(true);                 // đẩy lên ngay, không chờ debounce
  closeSheet();
  renderRounds();
  toast('Đã lưu kết quả');
};
$('sheetClear').onclick = () => {
  if(!sheetRef) return;
  const m = PBStore.session().rounds[sheetRef.ri].matches[sheetRef.ci];
  m.s1 = m.s2 = null;
  m.win = null;
  PBStore.save(true);
  closeSheet();
  renderRounds();
  toast('Đã xoá kết quả');
};

/* ============================ ĐỒNG BỘ ============================ */
const STATUS = { connecting:'Đang kết nối…', error:'Mất kết nối', off:'Chưa kết nối' };

function setStatus(st, msg){
  const on = st === 'live';
  $('led').className = 'led ' + (on ? 'live' : (st === 'connecting' ? 'connecting' : st === 'error' ? 'error' : ''));
  $('statusText').innerHTML = on
    ? 'Đang đồng bộ — mọi thay đổi hiện ngay với cả nhóm.'
    : esc((STATUS[st] || STATUS.off) + (msg ? ' — ' + msg : '') +
          '. Vẫn dùng được bình thường, dữ liệu lưu trên máy.');
  $('btnReconnect').classList.toggle('hide', on || st === 'connecting');
  $('btnShare').disabled = !on;
}

function normRoom(s){
  const v = String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return /^[a-z0-9][a-z0-9-]{2,31}$/.test(v) ? v : null;
}

function applyRemote(d){
  closeSheet();
  PBStore.applyRemote(d);
  render();
  toast('Có cập nhật từ thành viên khác');
}

/* ---------------- cổng vào ---------------- */
let pendingRoom = null;

function gateMsg(html, offlineFor){
  $('gateErr').innerHTML = html;
  $('gateMsg').className = 'gmsg' + (html ? ' bad' : ' hide');
  pendingRoom = offlineFor || null;
  $('gateOfflineWrap').classList.toggle('hide', !offlineFor);
}
function gateClear(){ gateMsg(''); }
function gateBusy(on){
  $('btnEnter').disabled = on;
  $('gateRoom').disabled = on;
  $('btnEnter').textContent = on ? 'Đang kết nối…' : 'Vào nhóm';
}
function renderGate(){
  const r = PBStore.rooms();
  if(r.last) $('gateRoom').value = r.last;
  $('gateRecent').classList.toggle('hide', !r.list.length);
  $('gateList').innerHTML = r.list.map(id =>
    `<div class="growl"><button class="grow" data-room="${esc(id)}">${esc(id)}</button>` +
    `<button class="icon danger" data-forget="${esc(id)}" title="Xoá khỏi danh sách">✕</button></div>`).join('');
}
$('btnOffline').onclick = () => { if(pendingRoom) openApp(pendingRoom, true); };
$('gateList').addEventListener('click', e => {
  const f = e.target.closest('[data-forget]');
  if(f){
    if(confirm(`Xoá nhóm "${f.dataset.forget}" khỏi danh sách trên máy này?\n\nDữ liệu trên server vẫn còn, vào lại bằng mã là có.`)){
      PBStore.forgetRoom(f.dataset.forget);
      renderGate();
    }
    return;
  }
  const b = e.target.closest('[data-room]');
  if(b){ $('gateRoom').value = b.dataset.room; enterRoom(b.dataset.room); }
});
$('btnEnter').onclick = () => enterRoom($('gateRoom').value);
$('gateRoom').addEventListener('keydown', e => { if(e.key === 'Enter') $('btnEnter').click(); });

function importLegacy(id){
  const L = PBStore.legacy();
  if(!L) return;
  if(confirm(`Máy này còn dữ liệu cũ chưa thuộc nhóm nào: ${L.rosters.length} danh sách người chơi, ${L.teamSets.length} danh sách đội, ${L.sessions.length} danh sách trận.\n\nĐưa vào nhóm "${id}" vừa tạo?`))
    PBStore.applyRemote(L);
  PBStore.dropLegacy();
}

async function enterRoom(raw){
  const id = normRoom(raw);
  if(!id){
    gateMsg('Mã nhóm cần 3–32 ký tự, chỉ gồm chữ thường, số và dấu gạch ngang.');
    return;
  }
  gateBusy(true);
  gateClear();

  const cached = PBStore.load(id);

  let remote = null;
  try{
    remote = await PBSync.connect(id, applyRemote, setStatus);
  }catch(e){
    gateBusy(false);
    gateMsg(`Không vào được nhóm <b>${esc(id)}</b>.<br>${esc(String((e && (e.code || e.message)) || e))}`,
            cached ? id : null);
    return;
  }

  if(remote) PBStore.applyRemote(remote);
  else       importLegacy(id);

  openApp(id);
  if(!remote) PBStore.save(true);
  toast(remote ? `Đã vào nhóm ${id}` : `Đã tạo nhóm ${id}`);
}

function openApp(id, offline){
  currentRoom = id;
  PBStore.rememberRoom(id);
  gateBusy(false);
  $('gate').classList.add('hide');
  $('drawerRoom').textContent = id;
  if(offline) setStatus('error', 'chưa kết nối được');
  location.hash = 'room=' + id;
  render();
  const n = PBStore.note();
  if(n){ PBStore.setNote(''); toast(n); }
}

$('btnSwitch').onclick = () => {
  PBSync.disconnect();
  currentRoom = null;
  setDrawer(false);
  closeSheet();
  history.replaceState(null, '', location.pathname + location.search);
  renderGate();
  gateClear();
  $('gate').classList.remove('hide');
};
$('btnReconnect').onclick = () => {
  if(!currentRoom) return;
  setDrawer(false);
  PBSync.connect(currentRoom, applyRemote, setStatus)
    .then(remote => {
      if(remote){ PBStore.applyRemote(remote); render(); }
      else PBStore.save(true);
      toast('Đã kết nối lại');
    })
    .catch(() => toast('Vẫn chưa kết nối được'));
};
$('btnShare').onclick = async () => {
  const url = location.origin + location.pathname + '#room=' + currentRoom;
  try{ await navigator.clipboard.writeText(url); toast('Đã copy link mời'); }
  catch(e){ prompt('Gửi link này cho cả nhóm:', url); }
};

/* ============================ KHỞI ĐỘNG ============================ */
if(!PBSync.configured()){
  PBStore.load('_local');
  $('gate').classList.add('hide');
  $('syncBox').innerHTML =
    '<p class="dstatus">Chưa cấu hình Firebase — app chạy ngoại tuyến, dữ liệu chỉ lưu trên máy này. ' +
    'Xem <b>FIREBASE.md</b> để bật đồng bộ nhóm.</p>';
  render();
}else{
  renderGate();
  const m = /room=([a-z0-9-]+)/i.exec(location.hash);
  if(m) enterRoom(m[1]);
  else $('gateRoom').focus();
}

})();
