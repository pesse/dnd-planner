// Reiter „Monster“ der Werkbank: Szenenbilder nach Malreihenfolge, filterbar nach Typ, Status und Name.
const MONSTER_STATUS = [['all', 'alle'], ['done', 'gemalt'], ['missing', 'fehlt'], ['flagged', 'markiert'], ['redrawn', 'neu gemalt']];
const typeDe = (t) => (t ? t[0].toUpperCase() + t.slice(1) : 'ohne Vault-Eintrag');
const crText = (cr) => (cr == null ? '' : cr < 1 ? `HG 1/${Math.round(1 / cr)}` : `HG ${cr}`);

function monsterList() {
  const q = (state.mq || '').toLowerCase();
  const status = {
    all: () => true, done: (m) => !!m.scene, missing: (m) => !m.scene,
    flagged: (m) => !!m.scene && !!flagOf(m.scene) && !isRedrawn(m.scene), redrawn: (m) => !!m.scene && isRedrawn(m.scene),
  }[state.mstatus || 'all'];
  return M.monsters.filter((m) => (!state.mtype || m.type === state.mtype) && status(m)
    && (!q || `${m.de} ${m.en} ${m.slug}`.toLowerCase().includes(q)));
}

const monsterItem = (m) => ({ url: m.scene, caption: `${m.de} (${m.en}) · ${typeDe(m.type)} ${crText(m.cr)}`, brief: m.brief });

function monsterTile(m, list) {
  const w = tileW();
  const open = () => openBox(list, list.findIndex((x) => x.url === m.scene));
  const versions = () => openBox([monsterItem(m), ...m.old.map((url, i) => ({ url, caption: `${m.de} – ältere Fassung ${i + 1}`, brief: m.brief }))], 0);
  return el('figure', { class: `tile${m.scene ? flagClasses(m.scene) : ''}`, 'data-flags': m.scene || false, title: m.brief },
    m.scene ? img(m.scene, w, { onclick: open })
      : el('div', { class: 'ph' }, m.icon ? img(m.icon, w / 2, { class: 'ph-icon' }) : null, 'noch nicht gemalt'),
    m.scene ? badge(m.scene) : null,
    el('figcaption', {},
      el('span', {}, m.icon ? img(m.icon, 20, { class: 'mini' }) : null, ` ${m.de} `, el('small', {}, crText(m.cr))),
      el('span', {},
        m.old.length ? el('button', { class: 'pick', title: 'ältere Fassungen ansehen', onclick: versions }, `⟲ ${m.old.length}`) : null,
        m.scene ? el('button', { class: 'pick', title: 'neu malen markieren', onclick: () => toggleRedo(monsterItem(m)) }, '⚑') : null)));
}

function monsterView() {
  const ms = monsterList();
  const list = ms.filter((m) => m.scene).map(monsterItem);
  const done = M.monsters.filter((m) => m.scene).length;
  document.getElementById('stat').textContent = `${done} / ${M.monsters.length} gemalt · ${ms.length} angezeigt`;
  return el('div', { class: 'grid', style: `--tw:${tileW()}px` }, ms.map((m) => monsterTile(m, list)));
}

function monsterControls() {
  const types = [...new Set(M.monsters.map((m) => m.type))].sort();
  return [
    el('label', {}, 'Typ'),
    el('select', { onchange: (e) => { state.mtype = e.target.value; renderMain(); } },
      el('option', { value: '' }, 'alle'), types.map((t) => el('option', { value: t, selected: t === state.mtype }, typeDe(t)))),
    el('label', {}, 'Status'),
    MONSTER_STATUS.map(([v, t]) => el('button', { class: `chip${(state.mstatus || 'all') === v ? ' on' : ''}`, onclick: () => { state.mstatus = v; render(); } }, t)),
    el('input', { type: 'search', placeholder: 'Name …', value: state.mq || '', oninput: (e) => { state.mq = e.target.value; renderMain(); } }),
    el('label', {}, 'Größe'),
    el('input', { type: 'range', min: 28, max: 120, value: state.size, oninput: (e) => { state.size = +e.target.value; renderMain(); } }),
  ];
}
