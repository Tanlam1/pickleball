/* app.js — giao diện: drawer, 2 màn hình (danh sách người chơi / tạo trận),
   sheet nhập điểm, và nối với PBStore + PBSync. */
(function(){
'use strict';

const $ = id => document.getElementById(id);
const S = PBStore.state;

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sv  = v => (v === null || v === undefined || v === '') ? '–' : v;

const MODE = { mixed:'Đôi nam nữ', split:'Tách nam nữ', free:'Ngẫu nhiên tự do', teams:'Đội cố định' };
const TITLE = { players:'Danh sách người chơi', teams:'Danh sách đội', matches:'Tạo trận' };
const SAMPLE = [
  ['Minh','M',4.25],['Tuấn','M',3.75],['Hùng','M',3.5],['Nam','M',4.0],
  ['Dũng','M',3.25],['Khoa','M',3.5],['Phong','M',4.5],
  ['Lan','F',3.5],['Hoa','F',3.0],['Mai','F',3.75],['Thu','F',3.25],
  ['Linh','F',4.0],['Trang','F',3.0],['Ngọc','F',3.5],
];

let H = null;              // buổi trận hiện tại đã dựng thành object
let TMAP = {};             // id đội -> đội (chỉ dùng ở chế độ đội cố định)
let currentRoom = null;

let toastTimer = null;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

const dot = p => `<span class="dot ${p.gender === 'M' ? 'm' : 'f'}"></span>`;
const teamHtml = t => t.map(p => dot(p) + esc(p.name)).join(' &amp; ');
const teamSum  = t => (t[0].rating + t[1].rating).toFixed(2);

/* Nhãn một bên của trận. Chế độ đội cố định: nếu đội có tên riêng thì tên đứng chính,
   tên 2 người xuống dòng phụ. Các chế độ khác: chỉ tên 2 người. */
function sideHtml(m, side){
  const players = teamHtml(side === 1 ? m.t1 : m.t2);
  const t = TMAP[side === 1 ? m.ta : m.tb];
  return (t && t.name) ? `<b>${esc(t.name)}</b><span class="tmembers">${players}</span>` : players;
}
function sideText(m, side){
  const players = (side === 1 ? m.t1 : m.t2).map(p => p.name).join(' & ');
  const t = TMAP[side === 1 ? m.ta : m.tb];
  return (t && t.name) ? `${t.name} (${players})` : players;
}

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
  $('navTeams').textContent    = PBStore.roster().teams.length;
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

/* Sửa tại chỗ, không render lại cả bảng (giữ con trỏ khi đang gõ) */
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
  const used = S.sessions.filter(s => s.rosterId === r.id).length;
  if(!confirm(used
    ? `Xoá danh sách "${r.name}"?\n\n${used} buổi trận đang dùng danh sách này sẽ bị xoá theo.`
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
function renderTeams(){
  const r = PBStore.roster();
  $('tRosterSel').innerHTML = S.rosters.map(x =>
    `<option value="${x.id}"${x.id === r.id ? ' selected' : ''}>${esc(x.name)} (${x.players.length} người)</option>`).join('');

  const teams = PBStore.teamsOf(r);
  const live  = PBStore.liveTeams(r);
  const left  = PBStore.unteamed(r);

  $('tcount').textContent = `${teams.length} đội · ${live.length} đội đủ người để xếp trận · ${left.length} người chưa có đội`;

  $('tlist').innerHTML = teams.map((t, i) => `
    <tr>
      <td class="rk">${i + 1}</td>
      <td>
        <input type="text" data-tname="${t.id}" value="${esc(t.name)}"
               placeholder="${esc(t.p1.name)} &amp; ${esc(t.p2.name)}">
        <div class="tmembers">${dot(t.p1)}${esc(t.p1.name)} &amp; ${dot(t.p2)}${esc(t.p2.name)}${
          (t.p1.active && t.p2.active) ? '' : ' <span class="tout">có người chưa tick Chơi</span>'}</div>
      </td>
      <td class="num">${(t.p1.rating + t.p2.rating).toFixed(2)}</td>
      <td><button class="icon danger" data-tdel="${t.id}" aria-label="Xoá đội">✕</button></td>
    </tr>`).join('');

  $('tempty').classList.toggle('hide', teams.length > 0);
  if(teams.length){
    const sums = teams.map(t => t.p1.rating + t.p2.rating);
    $('tmeta').textContent = `Tổng rating: thấp nhất ${Math.min.apply(null, sums).toFixed(2)} · cao nhất ${Math.max.apply(null, sums).toFixed(2)}`;
  }else{
    $('tmeta').textContent = '';
  }

  const opts = left.map(p => `<option value="${p.id}">${esc(p.name)} (${p.rating.toFixed(2)})</option>`).join('');
  $('tPickA').innerHTML = opts;
  $('tPickB').innerHTML = opts;
  if(left.length > 1) $('tPickB').value = left[1].id;
  $('btnTeamAdd').disabled = left.length < 2;
  $('tleft').textContent = left.length
    ? `Chưa có đội: ${left.map(p => p.name).join(', ')}`
    : 'Mọi người đều đã có đội.';
}

$('tRosterSel').onchange = () => { S.rosterId = $('tRosterSel').value; PBStore.saveLocal(); render(); };

$('tlist').addEventListener('input', e => {
  const id = e.target.dataset.tname;
  if(!id) return;
  const t = PBStore.roster().teams.find(x => x.id === id);
  if(t){ t.name = e.target.value.slice(0, 40); PBStore.save(); }
});
$('tlist').addEventListener('click', e => {
  const b = e.target.closest('[data-tdel]');
  if(!b) return;
  const r = PBStore.roster();
  r.teams = r.teams.filter(t => t.id !== b.dataset.tdel);
  render();
  PBStore.save();
});

function buildTeamsFor(r, style){
  if(!r || r.players.length < 2){ toast('Cần ít nhất 2 người trong danh sách'); return false; }
  if(r.teams.length && !confirm(`Ghép lại sẽ thay toàn bộ ${r.teams.length} đội hiện có. Tiếp tục?`)) return false;

  const out = PB.makeTeams(r.players, style);
  r.teams = out.teams.map(t => ({ id: PB.newId('t'), name: '', a: t.p1.id, b: t.p2.id }));
  PBStore.save();
  toast(out.odd ? `Đã ghép ${r.teams.length} đội — ${out.odd.name} lẻ chưa có đội`
                : `Đã ghép ${r.teams.length} đội`);
  return true;
}
function buildTeams(style){ if(buildTeamsFor(PBStore.roster(), style)) render(); }
$('btnTeamBalanced').onclick = () => buildTeams('balanced');
$('btnTeamMixed').onclick    = () => buildTeams('mixed');
$('btnTeamRandom').onclick   = () => buildTeams('random');

$('btnTeamAdd').onclick = () => {
  const a = $('tPickA').value, b = $('tPickB').value;
  if(!a || !b || a === b){ toast('Chọn hai người khác nhau'); return; }
  PBStore.roster().teams.push({ id: PB.newId('t'), name: '', a: a, b: b });
  render();
  PBStore.save();
};

/* ============================ 3. TẠO TRẬN ============================ */
function renderMatches(){
  const s = PBStore.session();
  $('sessionSel').innerHTML = S.sessions.map(x =>
    `<option value="${x.id}"${s && x.id === s.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')
    || '<option>— chưa có buổi trận —</option>';
  $('sessionSel').disabled     = !S.sessions.length;
  $('btnSessionRename').disabled = !s;
  $('btnSessionDel').disabled    = !s;
  $('noSession').classList.toggle('hide', !!s);
  $('sessionBody').classList.toggle('hide', !s);
  if(!s) return;

  $('cRoster').innerHTML = S.rosters.map(r =>
    `<option value="${r.id}"${r.id === s.rosterId ? ' selected' : ''}>${esc(r.name)} (${r.players.filter(p=>p.active).length} chơi)</option>`).join('');
  $('cMode').value          = s.cfg.mode;
  $('cCourts').value        = s.cfg.courts;
  $('cMin').value           = s.cfg.minGames;
  $('cMax').value           = s.cfg.maxGames;
  $('cCap').value           = s.cfg.cap;
  $('cMaxGap').value        = s.cfg.maxGap;
  $('cIgnoreRating').checked = s.cfg.ignoreRating;
  $('cMaxGap').disabled      = s.cfg.ignoreRating;
  applyMode(s);

  renderRounds();
}

/* Chế độ "đội cố định" đổi ý nghĩa vài ô nhập, và cần danh sách đội sẵn sàng */
function applyMode(s){
  const T = s.cfg.mode === 'teams';
  const unit = T ? 'trận' : 'ván';
  $('lblMin').innerHTML = T ? 'Trận tối thiểu<br><i>mỗi đội</i>' : 'Ván tối thiểu';
  $('lblMax').innerHTML = `${T ? 'Trận' : 'Ván'} tối đa<br><i>0 = không giới hạn</i>`;
  $('lblCap').innerHTML = T ? 'Số đội tối đa<br><i>0 = tất cả</i>' : 'Số người tối đa<br><i>0 = tất cả</i>';
  $('cfgSummary').textContent =
    `${MODE[s.cfg.mode]} · ${s.cfg.courts} sân · tối thiểu ${s.cfg.minGames} ${unit}`;

  const box = $('teamNotice');
  if(!T){ box.classList.add('hide'); return; }

  const r = PBStore.rosterOf(s);
  const all = PBStore.teamsOf(r), live = PBStore.liveTeams(r), left = PBStore.unteamed(r);
  box.classList.remove('hide');

  if(!all.length){
    box.innerHTML = `Danh sách <b>${esc(r ? r.name : '')}</b> chưa có đội nào.
      <div class="actions"><button class="primary" data-quick="balanced">Ghép đội cân bằng trình độ</button>
      <button data-quick="mixed">Ghép đôi nam nữ</button>
      <button data-quick="random">Ghép ngẫu nhiên</button></div>`;
    return;
  }
  const bits = [`Dùng <b>${live.length}</b> đội cố định từ danh sách <b>${esc(r.name)}</b>.`];
  if(live.length < all.length)
    bits.push(`${all.length - live.length} đội bị loại vì có người chưa tick "Chơi".`);
  if(left.length)
    bits.push(`${left.length} người chưa có đội nên không tham gia: ${left.map(p => esc(p.name)).join(', ')}.`);
  bits.push(`Sửa đội ở mục <b>Danh sách đội</b>.`);
  box.innerHTML = bits.join(' ');
}

$('teamNotice').addEventListener('click', e => {
  const b = e.target.closest('[data-quick]');
  if(!b) return;
  if(buildTeamsFor(PBStore.rosterOf(PBStore.session()), b.dataset.quick)) renderMatches();
});

function renderRounds(){
  const s = PBStore.session();
  const r = PBStore.rosterOf(s);
  H = r ? PB.hydrate(s, r.players) : null;

  const TEAM = s.cfg.mode === 'teams';
  TMAP = {};
  if(TEAM) PBStore.teamsOf(r).forEach(t => { TMAP[t.id] = t; });

  const show = (warn) => {
    $('standPanel').classList.add('hide');
    $('rounds').innerHTML = '';
    $('warnings').innerHTML = `<div class="warn">${warn}</div>`;
  };
  if(!s.rounds.length){
    show('Chưa có lịch. Mở <b>Cấu hình chia trận</b> ở trên, chỉnh tuỳ chọn rồi bấm <b>Tạo lịch</b>.');
    $('cfgPanel').open = true;
    return;
  }
  if(!H){
    show('Danh sách người chơi đã thay đổi nên lịch cũ không còn khớp. Bấm <b>Tạo lịch</b> để xếp lại.');
    return;
  }

  /* --- bảng thống kê: theo đội nếu là chế độ đội cố định, còn lại theo cá nhân --- */
  $('standPanel').classList.remove('hide');
  $('standPlayers').classList.toggle('hide', TEAM);
  $('standTeams').classList.toggle('hide', !TEAM);

  const row = (i, label, x) => `
    <tr>
      <td class="rk">${i + 1}</td>
      <td>${label}</td>
      <td class="num">${x.done}/${x.sched}</td>
      <td class="num">${x.win}</td>
      <td class="num">${x.loss}</td>
      <td class="num">${x.diff > 0 ? '+' : ''}${x.diff}</td>
    </tr>`;

  const tst = TEAM ? PB.teamStats(s, PBStore.teamsOf(r)) : [];
  if(TEAM){
    $('standTeamBody').innerHTML = tst.map((x, i) => row(i,
      `${esc(PBStore.teamLabel(x.team))}${x.team.name
        ? `<div class="tmembers">${dot(x.team.p1)}${esc(x.team.p1.name)} &amp; ${dot(x.team.p2)}${esc(x.team.p2.name)}</div>` : ''}`,
      x)).join('');
  }else{
    $('standBody').innerHTML = PB.stats(H).map((x, i) =>
      row(i, dot(x.p) + esc(x.p.name), x)).join('');
  }

  const all  = H.rounds.reduce((n, x) => n + x.matches.length, 0);
  const done = H.rounds.reduce((n, x) => n + x.matches.filter(m => m.win).length, 0);
  $('standMeta').textContent = `${done}/${all} trận đã có kết quả`;

  /* --- cảnh báo --- */
  const w = [];
  const unit = TEAM ? 'trận' : 'ván';

  if(TEAM){
    const excluded = PBStore.teamsOf(r).filter(t => !t.p1.active || !t.p2.active);
    if(excluded.length)
      w.push(`${excluded.length} đội không tham gia vì có người chưa tick "Chơi": <b>${excluded.map(t=>esc(PBStore.teamLabel(t))).join(', ')}</b>.`);
    const left = PBStore.unteamed(r).filter(p => p.active);
    if(left.length)
      w.push(`${left.length} người chưa có đội nên ngồi ngoài: <b>${left.map(p=>esc(p.name)).join(', ')}</b>.`);

    const shortT = tst.filter(x => x.sched < s.cfg.minGames);
    if(shortT.length)
      w.push(`Không đủ ${s.cfg.minGames} trận cho: <b>${shortT.map(x=>esc(PBStore.teamLabel(x.team))+' ('+x.sched+')').join(', ')}</b>. Thử tăng số sân hoặc giảm trận tối thiểu.`);

    /* đếm cặp đấu bị lặp — đây là điều chế độ này cố tránh nhất */
    const met = {};
    H.rounds.forEach(rd => rd.matches.forEach(m => {
      if(!m.ta || !m.tb) return;
      const k = m.ta < m.tb ? m.ta + '|' + m.tb : m.tb + '|' + m.ta;
      met[k] = (met[k] || 0) + 1;
    }));
    const keys = Object.keys(met), rep = keys.filter(k => met[k] > 1).length;
    if(rep)
      w.push(`Có ${rep}/${keys.length} cặp đấu bị lặp (hai đội gặp nhau hơn 1 lần). Với ${tst.length} đội thì mỗi đội chỉ có ${tst.length - 1} đối thủ khác nhau — muốn hết lặp thì giảm trận tối thiểu xuống ${tst.length - 1} hoặc thêm đội.`);
  }else{
    const dropped = r.players.filter(p => p.active && s.playerIds.indexOf(p.id) < 0);
    if(dropped.length)
      w.push(`Giới hạn còn ${s.playerIds.length} người — không xếp lịch cho: <b>${dropped.map(p=>esc(p.name)).join(', ')}</b>.`);
    const short = H.list.filter(p => H.ctx.games[p.id] < s.cfg.minGames);
    if(short.length)
      w.push(`Không đủ ${s.cfg.minGames} ván cho: <b>${short.map(p=>esc(p.name)+' ('+H.ctx.games[p.id]+')').join(', ')}</b>. Thử tăng số sân hoặc giảm ván tối thiểu.`);

    const pairs = Object.keys(H.ctx.partner).length;
    const dup = Object.keys(H.ctx.partner).filter(k => H.ctx.partner[k] > 1).length;
    if(dup){
      /* siết ngưỡng lệch rating luôn làm cặp trùng tăng — nói rõ để người dùng biết đường nới */
      const capped = !s.cfg.ignoreRating && s.cfg.maxGap > 0 && dup > pairs / 3;
      w.push(`Có ${dup}/${pairs} cặp phải đánh chung nhiều hơn 1 lần` + (capped
        ? `. Phần lớn là do ngưỡng <b>lệch rating tối đa ${s.cfg.maxGap}</b> đang khá chặt — nới lên ${(s.cfg.maxGap + 0.5).toFixed(2)} hoặc đặt 0 sẽ có nhiều cặp khác nhau hơn.`
        : ` (không tránh được với số người hiện tại).`));
    }
  }

  const gs = H.list.map(p => H.ctx.games[p.id]);
  const lo = Math.min.apply(null, gs), hi = Math.max.apply(null, gs);
  if(hi - lo >= 3)
    w.push(`Chênh lệch số ${unit} khá lớn (${lo}–${hi}).${TEAM ? '' : ' Thường do lệch tỉ lệ nam/nữ ở chế độ đang chọn.'}`);

  if(!s.cfg.ignoreRating && s.cfg.maxGap > 0){
    const over = [];
    H.rounds.forEach((rd, ri) => rd.matches.forEach((m, ci) => {
      const g = PB.gap(m);
      if(g > s.cfg.maxGap + 1e-9) over.push(`vòng ${ri+1} sân ${ci+1} (lệch ${g.toFixed(2)})`);
    }));
    if(over.length)
      w.push(`${over.length} trận lệch rating quá ${s.cfg.maxGap}: ${over.join(', ')}. Không tránh được vì những người còn lại trong vòng đó chênh nhau quá nhiều — nới ngưỡng lên hoặc thêm người trình độ trung bình.`);
  }
  $('warnings').innerHTML = w.length
    ? `<div class="warn"><b>Lưu ý</b><ul><li>${w.join('</li><li>')}</li></ul></div>` : '';

  /* --- các vòng --- */
  const rate = !s.cfg.ignoreRating;
  $('rounds').innerHTML = H.rounds.map((rd, ri) => `
    <div class="round">
      <div class="rhead">
        <span class="rt">Vòng ${ri + 1}</span>
        <span class="rest">${rd.resting.length ? 'Nghỉ: ' + rd.resting.map(p=>esc(p.name)).join(', ') : 'Tất cả ra sân'}</span>
      </div>
      <div class="rounds-grid">${rd.matches.map((m, ci) => {
        const fin = m.win === 1 || m.win === 2;
        const g   = PB.gap(m);
        const over = s.cfg.maxGap > 0 && g > s.cfg.maxGap + 1e-9;
        return `<button class="match" data-r="${ri}" data-c="${ci}">
          <span class="mhead">
            <span>Sân ${ci + 1}${rate ? ` <span class="gap${over ? ' over' : ''}">lệch ${g.toFixed(2)}</span>` : ''}</span>
            <span class="mstate ${fin ? 'done' : ''}">${fin ? '✓ Đã ghi' : 'Chạm để nhập điểm'}</span>
          </span>
          <span class="mteam ${m.win === 1 ? 'win' : ''}">
            <span class="names">${sideHtml(m, 1)}${rate ? ` <small class="meta">${teamSum(m.t1)}</small>` : ''}</span>
            <span class="sc">${sv(m.s1)}</span>
          </span>
          <span class="mdiv"></span>
          <span class="mteam ${m.win === 2 ? 'win' : ''}">
            <span class="names">${sideHtml(m, 2)}${rate ? ` <small class="meta">${teamSum(m.t2)}</small>` : ''}</span>
            <span class="sc">${sv(m.s2)}</span>
          </span>
        </button>`;
      }).join('')}</div>
    </div>`).join('');
}

/* ---- chọn / tạo / sửa buổi trận ---- */
$('sessionSel').onchange = () => { S.sessionId = $('sessionSel').value; PBStore.saveLocal(); renderMatches(); };
$('btnSessionNew').onclick = () => {
  PBStore.addSession();
  renderMatches();
  PBStore.save();
  $('cfgPanel').open = true;
};
$('btnSessionRename').onclick = () => {
  const s = PBStore.session();
  const n = prompt('Đổi tên buổi trận:', s.name);
  if(n === null || !n.trim()) return;
  s.name = n.trim().slice(0, 60);
  render();
  PBStore.save();
};
$('btnSessionDel').onclick = () => {
  const s = PBStore.session();
  if(!confirm(`Xoá buổi trận "${s.name}"? Kết quả đã nhập sẽ mất.`)) return;
  PBStore.removeSession(s.id);
  render();
  PBStore.save();
};
$('noSession').onclick = () => $('btnSessionNew').click();

function readCfg(){
  const s = PBStore.session();
  s.cfg = PBStore.normCfg({
    mode:         $('cMode').value,
    courts:       $('cCourts').value,
    minGames:     $('cMin').value,
    maxGames:     $('cMax').value,
    cap:          $('cCap').value,
    maxGap:       $('cMaxGap').value,
    ignoreRating: $('cIgnoreRating').checked,
  });
  $('cMaxGap').disabled = s.cfg.ignoreRating;
  applyMode(s);        // đổi chế độ phải đổi luôn nhãn các ô và ô thông tin đội
}
['cMode','cCourts','cMin','cMax','cCap','cMaxGap','cIgnoreRating'].forEach(id =>
  $(id).addEventListener('change', () => { readCfg(); PBStore.save(); }));

$('cRoster').onchange = () => {
  const s = PBStore.session();
  if(s.rounds.length && !confirm('Đổi danh sách sẽ xoá lịch và kết quả của buổi này. Tiếp tục?')){
    $('cRoster').value = s.rosterId;
    return;
  }
  s.rosterId = $('cRoster').value;
  s.rounds = []; s.playerIds = [];
  renderMatches();
  PBStore.save();
};

function doGenerate(){
  const s = PBStore.session();
  const r = PBStore.rosterOf(s);
  if(!r){ toast('Buổi trận chưa gắn với danh sách nào'); return; }
  if(PBStore.hasResults(s) &&
     !confirm('Buổi này đã có kết quả. Tạo lịch mới sẽ xoá toàn bộ điểm đã nhập. Tiếp tục?')) return;

  readCfg();
  const TEAM = s.cfg.mode === 'teams';
  const res = TEAM
    ? PB.generateTeams(PBStore.liveTeams(r), s.cfg)
    : PB.generate(r.players.filter(p => p.active), s.cfg);

  if(res.error){
    s.rounds = []; s.playerIds = [];
    renderMatches();
    $('warnings').innerHTML = `<div class="warn">${esc(res.error)}</div>`;
    PBStore.save();
    toast(res.error);
    return;
  }

  if(TEAM){
    s.playerIds = [];
    res.list.forEach(t => s.playerIds.push(t.p1.id, t.p2.id));
    s.rounds = PB.toTeamRounds(res);
  }else{
    s.playerIds = res.list.map(p => p.id);
    s.rounds    = PB.toRounds(res);
  }
  PBStore.save();
  renderMatches();
  $('cfgPanel').open = false;
  toast(`Đã tạo ${s.rounds.length} vòng · ${s.rounds.reduce((n,x)=>n+x.matches.length,0)} trận`);
}
$('btnGen').onclick   = doGenerate;
$('btnRegen').onclick = doGenerate;

/* ---- xuất ---- */
function asText(){
  const s = PBStore.session();
  if(!s || !H) return '';
  let out = `${s.name.toUpperCase()} — ${MODE[s.cfg.mode]}\n${H.list.length} người · ${s.cfg.courts} sân · ${H.rounds.length} vòng\n`;
  H.rounds.forEach((rd, i) => {
    out += `\n--- VÒNG ${i + 1} ---\n`;
    rd.matches.forEach((m, c) => {
      const sc = (m.win === 1 || m.win === 2) ? `  [${sv(m.s1)}-${sv(m.s2)}]` : '';
      out += `Sân ${c+1}: ${sideText(m, 1)}  vs  ${sideText(m, 2)}${sc}\n`;
    });
    if(rd.resting.length) out += `Nghỉ: ${rd.resting.map(p=>p.name).join(', ')}\n`;
  });
  const st = PB.stats(H);
  if(st.some(x => x.done)){
    out += `\n--- THỐNG KÊ ---\n`;
    st.forEach((x, i) => {
      out += `${i+1}. ${x.p.name}: ${x.done} trận, thắng ${x.win}, thua ${x.loss} (${x.diff > 0 ? '+' : ''}${x.diff})\n`;
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
  $('sNames1').innerHTML = sideHtml(h, 1);
  $('sNames2').innerHTML = sideHtml(h, 2);
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
const STATUS = {
  off:        'Ngoại tuyến — dữ liệu chỉ lưu trên máy này',
  connecting: 'Đang kết nối…',
  error:      'Lỗi',
};

function setStatus(st, msg){
  const on = st === 'live';
  $('led').className = 'led ' + (on ? 'live' : (STATUS[st] && st !== 'off' ? st : ''));
  $('statusText').innerHTML = on
    ? `<b>Đang đồng bộ</b> · phòng <b>${esc(currentRoom)}</b>`
    : esc((STATUS[st] || STATUS.off) + (msg ? ' — ' + msg : ''));
  $('btnJoin').classList.toggle('hide', on);
  $('btnLeave').classList.toggle('hide', !on);
  $('btnShare').classList.toggle('hide', !on);
  $('roomId').disabled  = on || st === 'connecting';
  $('btnJoin').disabled = st === 'connecting';
}

function normRoom(s){
  const v = String(s || '').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return /^[a-z0-9][a-z0-9-]{2,31}$/.test(v) ? v : null;
}

function applyRemote(d){
  closeSheet();                       // chỉ số trận có thể đổi -> đóng sheet cho chắc
  PBStore.applyRemote(d);
  render();
  toast('Có cập nhật từ thành viên khác');
}

async function join(silent){
  const id = normRoom($('roomId').value);
  if(!id){ toast('Mã phòng: 3–32 ký tự, chữ thường / số / gạch ngang'); return; }
  currentRoom = id;

  let remote;
  try{ remote = await PBSync.connect(id, applyRemote, setStatus); }
  catch(e){ currentRoom = null; return; }        // setStatus đã hiện lý do

  if(remote){
    const nr = (remote.rosters || []).length, ns = (remote.sessions || []).length;
    if(!silent && !confirm(`Phòng "${id}" đã có ${nr} danh sách người chơi và ${ns} buổi trận.\n\nTải về máy? Dữ liệu hiện có trên máy bạn sẽ bị thay thế.`)){
      PBSync.disconnect();
      currentRoom = null;
      return;
    }
    PBStore.applyRemote(remote);
    render();
    toast(`Đã vào phòng ${id}`);
  }else{
    PBStore.save(true);                          // phòng mới: đẩy dữ liệu đang có lên
    toast(`Đã tạo phòng ${id}`);
  }
  location.hash = 'room=' + id;
  setStatus('live');
}

$('btnJoin').onclick = () => join(false);
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
const hadData = PBStore.load();
if(!hadData){
  SAMPLE.forEach(s => addPlayer(s[0], s[1], s[2]));   // lần đầu mở: có sẵn dữ liệu để thử
  PBStore.saveLocal();
}
render();

if(!PBSync.configured()){
  $('syncBox').innerHTML =
    '<p class="dstatus">Chưa cấu hình Firebase — app chạy ngoại tuyến, dữ liệu chỉ lưu trên máy này. ' +
    'Xem <b>FIREBASE.md</b> để bật đồng bộ nhóm.</p>';
}else{
  setStatus('off');
  const m = /room=([a-z0-9-]+)/i.exec(location.hash);
  if(m){ $('roomId').value = m[1]; join(true); }      // mở bằng link mời -> vào thẳng
}

})();
