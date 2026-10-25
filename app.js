/* 8:8 미팅 파티 — 화면 동작. 상태는 이 페이지 안에만 있고, 새로 고치면 예시로 돌아간다. */
(function () {
  'use strict';

  const L = window.MeetLogic;
  const D = window.MeetData;
  const { $, $$, esc, toast, movePill, selectTab, syncPills, showError, clearError, digits, copyText } = window.MeetKit;
  const { CHECK_SVG, initApplyForm, readForm } = window.MeetForm;

  const VIEWS = ['apply', 'host', 'day', 'after'];
  const DISARM_MS = 4000;
  const ARM_GUARD_MS = 400;
  const LAST_PHASE = L.ROUND_COUNT + 1;
  const ROUND_MS = L.ROUND_MINUTES * 60 * 1000;
  const TOTAL_SEATS = L.SEATS_PER_GENDER * 2;
  const BIG_CHECK_SVG = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22"/><path d="M14 24.5l6.5 6.5L34 17.5"/></svg>';
  const CHEVRON_SVG = '<svg viewBox="0 0 16 16"><path d="M4 6.5L8 10.5L12 6.5"/></svg>';
  const STATUS = {
    confirmed: { label: '확정', cls: 'good', order: 0 },
    pending: { label: '입금 대기', cls: 'warn', order: 1 },
    waitlist: { label: '대기자', cls: '', order: 2 },
    cancelled: { label: '취소', cls: '', order: 3 },
  };

  const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
  const gcls = (p) => (p.gender === 'F' ? 'her' : 'him');
  const gshort = (p) => L.byId(L.GENDERS, p.gender).short;
  const nickOf = (name) => (/^[가-힣]{3}$/.test(name) ? name.slice(1) : name);
  const toTable = (n) => `테이블 ${n}${[0, 3, 6].includes(n % 10) ? '으로' : '로'}`;

  const freshUi = () => ({
    openKeys: new Set(),
    armedCancel: null,
    armedAt: 0,
    justNumbered: null,
    shownTable: null,
    draft: { viewerId: null, ids: [] },
    celebrate: false,
    depositorTouched: false,
  });

  function freshState() {
    const people = D.samplePeople();
    const plan = L.planRounds(people);
    return {
      settings: D.sampleSettings(),
      people,
      round1: plan.ok ? plan.round1 : null,
      phase: 0,
      phaseStartedAt: null,
      picks: D.samplePicks(),
      viewerId: 'p1',
      hostRound: 0,
      hostFilter: 'all',
      swapPick: null,
    };
  }

  let state = freshState();
  let ui = freshUi();
  let view = 'apply';
  let disarmTimer = null;

  function setState(patch) {
    state = { ...state, ...patch };
    render();
  }
  const setUi = (patch) => { ui = { ...ui, ...patch }; };

  const find = (id) => state.people.find((p) => p.id === id);
  const tagOf = (p) => (p.number ? `${p.number}번 ${p.nick}` : p.nick);
  const currentRounds = () => (L.round1Valid(state.round1, state.people) ? L.deriveRounds(state.round1) : null);
  const countOf = (status, gender) => state.people.filter((p) => p.status === status && (!gender || p.gender === gender)).length;

  /* ---------- 공통 동작 ---------- */
  function toggleAcc(head) {
    const acc = head.closest('.t-acc');
    const open = acc.getAttribute('data-open') === 'true';
    acc.setAttribute('data-open', String(!open));
    head.setAttribute('aria-expanded', String(!open));
    if (acc.dataset.key) {
      const next = new Set(ui.openKeys);
      if (open) next.delete(acc.dataset.key);
      else next.add(acc.dataset.key);
      setUi({ openKeys: next });
    }
  }

  function showView(next) {
    if (!VIEWS.includes(next)) return;
    view = next;
    VIEWS.forEach((v) => { $(`#view-${v}`).hidden = v !== next; });
    const bar = $('#main-tabs');
    $$('.t-tab', bar).forEach((t) => t.setAttribute('aria-selected', t.dataset.view === next ? 'true' : 'false'));
    movePill(bar, true);
    if (next === 'day') renderDay();
    syncPills($(`#view-${next}`));
    window.scrollTo(0, 0);
  }

  /* ---------- 신청 ---------- */
  function resetForm() {
    $('#apply-form').reset();
    $$('#apply-form [role="radio"], #apply-form [role="checkbox"]').forEach((t) => t.setAttribute('aria-checked', 'false'));
    $('#f-politics [data-value=""]').setAttribute('aria-checked', 'true');
    $$('#apply-form .t-input-wrap').forEach(clearError);
    $$('#apply-form .t-tabs').forEach((bar) => movePill(bar, false));
    setUi({ depositorTouched: false });
  }

  function buildPerson(values) {
    const { consent, ...rest } = values;
    const queued = state.people.some((p) => p.status === 'waitlist' && p.gender === values.gender);
    const open = !queued && L.seatsTaken(state.people, values.gender) < L.SEATS_PER_GENDER;
    return {
      ...rest,
      id: `n${Date.now().toString(36)}`,
      nick: nickOf(values.name),
      status: open ? 'pending' : 'waitlist',
      number: null,
      appliedAt: Date.now(),
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const { values, errors } = readForm();
    if (errors.length) {
      errors.forEach(({ id, msg }) => showError($(`#${id}`).closest('.t-input-wrap'), msg, false));
      $(`#${errors[0].id}`).closest('.t-input-wrap').scrollIntoView({ block: 'center' });
      toast(`${errors.length}곳을 확인해 주세요`);
      return;
    }
    const person = buildPerson(values);
    setState({ people: [...state.people, person] });
    showDone(person);
  }

  function showDone(person) {
    const waiting = person.status === 'waitlist';
    const gender = L.byId(L.GENDERS, person.gender).label;
    const full = L.seatsTaken(state.people, person.gender) >= L.SEATS_PER_GENDER;
    const why = full ? `${gender} 자리 ${L.SEATS_PER_GENDER}개가 다 찼어요.` : '먼저 기다리는 분이 있어요.';
    $('#done-title').textContent = waiting ? '대기자로 신청했어요' : '신청했어요';
    $('#done-text').textContent = waiting
      ? `${why} 지금 대기 ${L.waitlistPosition(state.people, person)}번째예요. 자리가 나면 연락드리고, 그때 예약금을 받아요.`
      : `${won(state.settings.deposit)}을 보내주시면 주최자가 확인하고 번호를 드려요. 주최자 화면의 '입금 대기'에서 이어서 볼 수 있어요.`;
    $('#apply-form').hidden = true;
    const done = $('#apply-done');
    done.hidden = false;
    const check = $('.t-success-check', done);
    check.setAttribute('data-state', 'out');
    void check.offsetWidth;
    check.setAttribute('data-state', 'in');
    done.scrollIntoView({ block: 'center' });
    toast(waiting ? '대기자 명단에 올렸어요' : '신청서를 받았어요');
  }

  function renderApply() {
    const s = state.settings;
    const rows = L.timetable(s.start);
    $('#apply-title').textContent = s.name;
    $('#apply-facts').innerHTML = [
      ['날짜', s.date], ['시간', `${rows[1].start} ~ ${rows[rows.length - 1].start}`], ['장소', s.place], ['예약금', won(s.deposit)],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('#apply-program').innerHTML = programHtml(rows, false);
    $('#apply-seats').innerHTML = `<p class="label">남은 자리</p>${L.GENDERS.map(seatRow).join('')}
      <p class="hint">자리가 차면 대기자로 받아요. 취소가 나오면 같은 성별 대기자에게 먼저 연락드려요.</p>`;
    $('#apply-bank').innerHTML = `
      <div class="bank-row"><span class="label">예약금</span><span class="bank-amount">${esc(won(s.deposit))}</span></div>
      <div class="bank-row"><span class="copyable">${esc(s.account)}</span><button type="button" class="btn small" data-action="copy" data-copy="${esc(s.account)}">계좌 복사</button></div>
      <p class="hint">${esc(s.refund)}</p>`;
  }

  // 신청 화면은 일정 안내라 설명을 붙이고, 주최자 진행판은 지금 단계를 표시한다.
  function programHtml(rows, live) {
    const note = (r) => {
      if (live) return '';
      if (r.phase === 1) return '<small>설문으로 정한 첫 테이블</small>';
      if (r.phase > 1 && r.phase <= L.ROUND_COUNT) return '<small>남자 2명이 옆 테이블로 옮겨요</small>';
      return '';
    };
    return rows.map((r) => `<li class="${live && r.phase === state.phase ? 'is-now' : ''}">
      <span class="when">${r.end ? `${r.start}–${r.end}` : r.start}</span>
      <span class="what">${esc(r.label)}${note(r)}</span></li>`).join('');
  }

  function seatRow(g) {
    const taken = L.seatsTaken(state.people, g.id);
    const wait = countOf('waitlist', g.id);
    const dots = Array.from({ length: L.SEATS_PER_GENDER }, (_, i) => `<span class="dot${i < taken ? ' on' : ''}"></span>`).join('');
    return `<div class="seatrow ${g.id === 'F' ? 'her' : 'him'}"><span class="who-g">${g.short}</span>
      <span class="dots" aria-hidden="true">${dots}</span>
      <span class="count">${taken}/${L.SEATS_PER_GENDER}${wait ? ` · 대기 ${wait}` : ''}</span></div>`;
  }

  /* ---------- 주최자 ---------- */
  function renderHost() {
    $('#host-stats').innerHTML = [
      [`${countOf('confirmed', 'F')}/${L.SEATS_PER_GENDER}`, '여 확정'],
      [`${countOf('confirmed', 'M')}/${L.SEATS_PER_GENDER}`, '남 확정'],
      [countOf('pending'), '입금 대기'],
      [countOf('waitlist'), '대기자'],
    ].map(([n, label]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join('');
    renderTables();
    renderPeople();
    renderFlow();
    renderLinks();
  }

  function renderTables() {
    const rs = currentRounds();
    const r = state.hostRound;
    const locked = state.phase > 0;
    const women = countOf('confirmed', 'F');
    const men = countOf('confirmed', 'M');
    const full = women === L.SEATS_PER_GENDER && men === L.SEATS_PER_GENDER;
    $('#btn-replan').disabled = locked || !full;
    if (!rs) {
      $('#tables-hint').textContent = '';
      const msg = full ? '참가자가 바뀌어서 테이블을 다시 짜야 해요.' : `확정 인원이 여 ${women} · 남 ${men}이에요. 8 대 8이 되면 배정할 수 있어요.`;
      $('#tables-body').innerHTML = `<div class="empty"><p>${esc(msg)}</p>${full ? '<button type="button" class="btn primary small" data-action="replan">설문으로 배정하기</button>' : ''}</div>`;
      return;
    }
    $('#tables-hint').textContent = r > 0
      ? '라운드마다 남자 2명이 옆 테이블로 한 칸씩 옮기고, 여자는 자리를 지켜요. 1라운드 자리를 바꾸면 여기도 따라 바뀌어요.'
      : locked
        ? '파티가 시작돼서 자리를 바꿀 수 없어요.'
        : '이름을 누르고 같은 성별인 다른 사람을 누르면 두 사람 자리가 바뀌어요.';
    const swappable = r === 0 && !locked;
    $('#tables-body').innerHTML = `<div class="tables">${rs[r].map((t, i) => tableCard(t, i, swappable)).join('')}</div>`;
  }

  function tableCard(table, i, swappable) {
    const ins = L.tableInsight(table, find);
    const seat = (id) => {
      const p = find(id);
      return `<button type="button" class="seat ${gcls(p)}" data-action="swap" data-id="${esc(p.id)}" aria-pressed="${state.swapPick === p.id}"${swappable ? '' : ' disabled'}>
        <span class="badge-num">${p.number}</span><span class="nm">${esc(p.nick)}</span>
        <span class="meta">${L.yy(p.birthYear)}년생 · ${esc(p.mbti || 'MBTI 없음')}</span></button>`;
    };
    const pairs = ins.pairs.filter((pr) => pr.blocks.length === 0).map((pr) => {
      const w = find(pr.woman);
      const m = find(pr.man);
      const why = pr.reasons.slice(0, 3).join(' · ') || '특별히 겹치는 건 없어요';
      return `<div class="pair-line"><b>추천 짝 ${w.number} ${esc(w.nick)} ↔ ${m.number} ${esc(m.nick)}</b><span>${esc(why)}</span></div>`;
    }).join('');
    const pill = ins.blocks.length
      ? `<span class="pill warn">걸리는 조건 ${ins.blocks.length}</span>`
      : `<span class="pill${ins.score >= 20 ? ' good' : ''}">궁합 ${ins.score > 0 ? '+' : ''}${Math.round(ins.score)}</span>`;
    const warns = ins.blocks.length ? `<ul class="warns">${ins.blocks.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '';
    return `<article class="table-card"><header><h4>테이블 ${i + 1}</h4>${pill}</header>
      <div class="seats">${L.seatsOf(table).map(seat).join('')}</div><div class="pairs">${pairs}</div>${warns}</article>`;
  }

  function renderPeople() {
    const filter = state.hostFilter;
    const list = state.people
      .filter((p) => filter === 'all' || p.status === filter)
      .sort((a, b) => STATUS[a.status].order - STATUS[b.status].order
        || (a.number || 99) - (b.number || 99) || a.appliedAt - b.appliedAt);
    $('#people-body').innerHTML = list.length ? list.map(personRow).join('') : '<p class="hint">해당하는 사람이 없어요.</p>';
  }

  function personRow(p) {
    const st = STATUS[p.status];
    const open = ui.openKeys.has(p.id);
    const num = p.number ? digits(p.number, ui.justNumbered === p.id) : '–';
    const wait = p.status === 'waitlist' ? ` ${L.waitlistPosition(state.people, p)}번` : '';
    return `<div class="t-acc person${p.status === 'cancelled' ? ' is-cancelled' : ''}" data-open="${open}" data-key="${esc(p.id)}">
      <div class="person-line">
        <button type="button" class="t-acc-head" aria-expanded="${open}" aria-controls="pd-${esc(p.id)}">
          <span class="person-main">
            <span class="badge-num ${p.number ? gcls(p) : 'none'}">${num}</span>
            <span class="txt"><span class="nm">${esc(p.name)}</span>
              <span class="meta">${gshort(p)} · ${L.yy(p.birthYear)}년생 · ${esc(L.labelOf(L.INTENTS, p.intent))}</span></span>
          </span>
          <span class="pill ${st.cls}">${st.label}${wait}</span>
          <span class="t-acc-chevron" aria-hidden="true">${CHEVRON_SVG}</span>
        </button>
        <div class="person-act">${personActions(p)}</div>
      </div>
      <div class="t-acc-panel" id="pd-${esc(p.id)}"><div class="t-acc-panel-inner"><dl class="detail">${personDetail(p)}</dl></div></div>
    </div>`;
  }

  function personActions(p) {
    const id = esc(p.id);
    const cancel = ui.armedCancel === p.id
      ? `<button type="button" class="btn small danger-armed" data-action="cancel" data-id="${id}">한 번 더 누르면 취소</button>`
      : `<button type="button" class="btn small" data-action="cancel" data-id="${id}">취소</button>`;
    if (p.status === 'pending') return `<button type="button" class="btn small primary" data-action="confirm" data-id="${id}">입금 확인</button>${cancel}`;
    if (p.status === 'confirmed') return state.phase > 0 ? '' : cancel;
    if (p.status === 'waitlist') {
      const open = L.seatsTaken(state.people, p.gender) < L.SEATS_PER_GENDER;
      return `<button type="button" class="btn small" data-action="promote" data-id="${id}"${open ? '' : ' disabled title="빈자리가 생기면 올릴 수 있어요"'}>자리로 올리기</button>`;
    }
    return '';
  }

  function personDetail(p) {
    const labels = (list, ids) => ids.map((x) => L.labelOf(list, x)).filter(Boolean);
    const join = (arr, note) => [...arr, note].filter(Boolean).join(', ') || '없음';
    const rows = [
      ['연락처', p.phone], ['인스타', `@${p.insta}`], ['입금자명', p.depositName],
      ['만나고 싶은 나이', `${L.yy(p.yearFrom)}~${L.yy(p.yearTo)}년생`],
      ['흡연 · 음주', `${L.labelOf(L.SMOKE, p.smoke)} · ${L.labelOf(L.DRINK, p.drink)}`],
      ['종교', `${L.labelOf(L.RELIGIONS, p.religion)}${p.religionMatters ? ' (상대 종교 중요)' : ''}`],
      ['정치 성향', `${p.politics ? L.labelOf(L.POLITICS, p.politics) : '말 안 함'}${p.politicsMatters ? ' (다르면 불편)' : ''}`],
      ['사는 곳', [L.labelOf(L.AREAS, p.area), p.station].filter(Boolean).join(' · ')],
      ['하는 일', p.job || '안 적음'],
      ['절대 안 되는 것', join(labels(L.DEALBREAKERS, p.dealbreakers), p.dealNote)],
      ['있으면 좋은 것', join(labels(L.NICE, p.nice), p.niceNote)],
      ['피하고 싶은 사람', (p.avoid || []).join(', ') || '없음'],
      ['MBTI · 자신 있는 것', `${p.mbti || '안 적음'} · ${p.strength}`],
      ['취미', (p.hobbies || []).join(', ') || '안 적음'],
      ['최근 연애', p.lastLove ? `${p.lastLove}${p.lastLovePublic ? ' (카드에 공개)' : ' (주최자만)'}` : '안 적음'],
    ];
    return rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  function renderFlow() {
    const rows = L.timetable(state.settings.start);
    const ph = state.phase;
    const ready = Boolean(currentRounds());
    const now = ph === 0 ? '입장 전' : ph <= L.ROUND_COUNT ? `${ph}라운드 진행 중` : '파티 끝 · 선택 받는 중';
    const timer = ph >= 1 && ph <= L.ROUND_COUNT ? `<p class="timer" data-timer>${timerText()}</p>` : '';
    let next = null;
    if (ph === 0) next = { label: '1라운드 시작', disabled: !ready };
    else if (ph < L.ROUND_COUNT) next = { label: `${ph + 1}라운드로 넘기기`, disabled: false };
    else if (ph === L.ROUND_COUNT) next = { label: '파티 마치고 선택 열기', disabled: false };
    const note = ph === 0 && !ready ? '먼저 테이블을 배정해 주세요.'
      : ph < LAST_PHASE ? '누르면 참가자 화면의 테이블 번호가 바로 바뀌어요.'
        : '참가자들이 다시 보고 싶은 사람을 고르고 있어요.';
    $('#flow-body').innerHTML = `
      <div class="phase"><p class="phase-now">${esc(now)}</p>${timer}</div>
      <ol class="program flow-program">${programHtml(rows, true)}</ol>
      <div class="flow-actions">
        ${next ? `<button type="button" class="btn primary" data-action="next-phase"${next.disabled ? ' disabled' : ''}>${next.label}</button>` : ''}
        ${ph > 0 ? '<button type="button" class="btn" data-action="reset-phase">진행 처음으로</button>' : ''}
      </div>
      <p class="hint">${esc(note)}</p>`;
  }

  function timerText() {
    if (!state.phaseStartedAt) return '';
    const left = ROUND_MS - (Date.now() - state.phaseStartedAt);
    const abs = Math.abs(left);
    const t = `${String(Math.floor(abs / 60000)).padStart(2, '0')}:${String(Math.floor((abs % 60000) / 1000)).padStart(2, '0')}`;
    return left >= 0 ? `남은 시간 ${t}` : `${t} 지났어요`;
  }

  function confirmedPicks() {
    const ids = L.confirmedOf(state.people).map((p) => p.id);
    return Object.fromEntries(Object.entries(state.picks)
      .filter(([id]) => ids.includes(id))
      .map(([id, list]) => [id, list.filter((x) => ids.includes(x))]));
  }

  function renderLinks() {
    const picks = confirmedPicks();
    const mutual = L.mutualMatches(picks);
    const one = L.oneSided(picks);
    const badge = (p) => `<span class="badge-num ${gcls(p)}">${p.number}</span> ${esc(p.nick)}`;
    const pair = ([a, b]) => {
      const [w, m] = [find(a), find(b)].sort((x, y) => (x.gender === 'F' ? -1 : 1) - (y.gender === 'F' ? -1 : 1));
      return `<div class="link-row">${badge(w)} <span class="heart" aria-label="서로 선택">↔</span> ${badge(m)}</div>`;
    };
    const open = ui.openKeys.has('one-sided');
    $('#links-body').innerHTML = `
      <p><b class="num">${Object.keys(picks).length}</b> / ${TOTAL_SEATS}명이 골랐어요</p>
      <p class="label">서로 고른 사람</p>
      <div class="links">${mutual.length ? mutual.map(pair).join('') : '<p class="hint">아직 없어요.</p>'}</div>
      <p class="hint">서로 고른 두 사람에게는 상대 인스타가 자동으로 보여요. 따로 연락하지 않아도 돼요.</p>
      <div class="t-acc" data-open="${open}" data-key="one-sided">
        <button type="button" class="t-acc-head" aria-expanded="${open}" aria-controls="one-sided-panel">
          한쪽만 고른 선택 ${one.length}건 · 주최자만 봐요
          <span class="t-acc-chevron" aria-hidden="true">${CHEVRON_SVG}</span>
        </button>
        <div class="t-acc-panel" id="one-sided-panel"><div class="t-acc-panel-inner"><div class="acc-body">
          ${one.length ? `<ul>${one.map(([a, b]) => `<li>${esc(tagOf(find(a)))} → ${esc(tagOf(find(b)))}</li>`).join('')}</ul>` : '<p>없어요.</p>'}
          <p>고른 사람에게도, 받은 사람에게도 알려지지 않아요.</p>
        </div></div></div>
      </div>`;
  }

  /* ---------- 당일 ---------- */
  function viewers() {
    return L.confirmedOf(state.people).sort((a, b) => a.number - b.number);
  }

  function currentViewer() {
    const list = viewers();
    return list.find((p) => p.id === state.viewerId) || list[0] || null;
  }

  function fillViewerSelects(me) {
    const list = viewers();
    const sig = list.map((p) => `${p.id}:${p.number}:${p.nick}`).join('|');
    $$('[data-viewer]').forEach((sel) => {
      if (sel.dataset.sig !== sig) {
        sel.innerHTML = list.map((p) => `<option value="${esc(p.id)}">${p.number}번 ${esc(p.nick)} (${gshort(p)})</option>`).join('');
        sel.dataset.sig = sig;
      }
      sel.value = me ? me.id : '';
    });
  }

  function renderDay() {
    const me = currentViewer();
    const body = $('#day-body');
    if (!me) {
      body.innerHTML = '<div class="empty"><p>확정된 참가자가 없어요.</p></div>';
      return;
    }
    const rows = L.timetable(state.settings.start);
    const ticket = `<div class="ticket-wrap"><div class="ticket">
      <div class="stub ${gcls(me)}"><small>번호표</small><span class="big">${me.number}</span><small>${gshort(me)}</small></div>
      <div class="ticket-body"><p class="eyebrow">${esc(state.settings.name)}</p><h3>${esc(me.nick)}</h3>
        <p class="hint">${esc(state.settings.date)} · ${rows[0].start} 입장</p>
        <p class="hint">입구에서 이 번호가 적힌 이름표를 받아요.</p></div></div></div>`;
    const rs = currentRounds();
    if (!rs) {
      body.innerHTML = `${ticket}<section class="card"><p>아직 테이블이 정해지지 않았어요. 정해지면 여기에 떠요.</p></section>`;
      return;
    }
    const ph = state.phase;
    const rIdx = ph === 0 ? 0 : Math.min(ph, L.ROUND_COUNT) - 1;
    const route = rs.map((tables) => L.tableIndex(tables, me.id) + 1);
    const table = rs[rIdx][route[rIdx] - 1];
    const key = `${me.id}|${ph}|${route[rIdx]}`;
    const animate = view === 'day' && ui.shownTable !== null && ui.shownTable !== key;
    if (view === 'day') setUi({ shownTable: key });
    body.innerHTML = ticket + nowCard(me, ph, rIdx, route, rows, animate) + matesHtml(me, table);
  }

  function nowCard(me, ph, rIdx, route, rows, animate) {
    const status = ph === 0 ? `<p class="eyebrow">입장 전 · ${rows[1].start}에 1라운드 시작</p>`
      : ph <= L.ROUND_COUNT ? `<p class="eyebrow">${ph}라운드 진행 중</p><p class="timer" data-timer>${timerText()}</p>`
        : '<p class="eyebrow">파티가 끝났어요</p>';
    const label = ph === 0 ? '첫 테이블' : ph <= L.ROUND_COUNT ? '지금 앉을 테이블' : '마지막 테이블';
    const step = (i) => {
      if (ph === 0 || ph > L.ROUND_COUNT) return ph > L.ROUND_COUNT ? 'is-done' : '';
      return i + 1 === ph ? 'is-now' : i + 1 < ph ? 'is-done' : '';
    };
    const routeHtml = `<ol class="route" aria-label="내 동선">${route.map((n, i) =>
      `<li class="${step(i)}"><span>${i + 1}라운드</span><b>테이블 ${n}</b></li>`).join('')}</ol>`;
    let next = '';
    if (ph === 0) next = `${rows[1].start}에 ${toTable(route[0])} 가서 앉아주세요.`;
    else if (ph < L.ROUND_COUNT) {
      next = me.gender === 'M'
        ? `${ph + 1}라운드엔 ${toTable(route[ph])} 옮겨요.`
        : `${ph + 1}라운드에도 이 자리 그대로예요. 남자 두 분이 새로 와요.`;
    } else if (ph === L.ROUND_COUNT) next = '마지막 라운드예요. 끝나면 다시 보고 싶은 사람을 고르는 화면이 열려요.';
    const after = ph > L.ROUND_COUNT
      ? '<button type="button" class="btn primary block" data-action="goto" data-view="after">다시 보고 싶은 사람 고르기</button>' : '';
    return `<section class="card">
      <div class="now"><div class="phase">${status}<p class="label">${label}</p></div>
        <div class="where"><small>테이블</small>${digits(route[rIdx], animate)}</div></div>
      ${routeHtml}${next ? `<p class="hint">${esc(next)}</p>` : ''}${after}</section>`;
  }

  function matesHtml(me, table) {
    const ins = L.tableInsight(table, find);
    const mine = ins.pairs.find((p) => (p.woman === me.id || p.man === me.id) && p.blocks.length === 0);
    const partner = mine ? (mine.woman === me.id ? mine.man : mine.woman) : null;
    const mates = L.seatsOf(table).filter((id) => id !== me.id).map(find)
      .sort((a, b) => Number(a.gender === me.gender) - Number(b.gender === me.gender));
    return `<section class="mates" aria-labelledby="h-mates"><h3 id="h-mates">같은 테이블</h3>
      ${mates.map((p) => mateCard(p, me, p.id === partner)).join('')}</section>`;
  }

  function mateCard(p, me, recommended) {
    const opposite = p.gender !== me.gender;
    const shared = (p.hobbies || []).filter((h) => (me.hobbies || []).includes(h));
    const rows = [
      ['자신 있는 것', p.strength], ['여행지', p.travel], ['음식 취향', p.diet],
      p.lastLovePublic ? ['최근 연애', p.lastLove] : null,
    ].filter((r) => r && r[1]);
    const tags = (p.hobbies || []).length
      ? `<ul class="tags" aria-label="취미">${p.hobbies.map((h) => `<li class="${shared.includes(h) ? 'shared' : ''}">${esc(h)}</li>`).join('')}</ul>` : '';
    return `<article class="mate">
      <header><span class="badge-num ${gcls(p)}">${p.number}</span>
        <div><h4>${esc(p.nick)}</h4><p class="sub">${esc(p.mbti || 'MBTI 안 적음')}${opposite ? '' : ' · 오늘 내내 같이 앉아요'}</p></div>
        ${recommended ? '<span class="pill accent">오늘의 추천 짝</span>' : ''}</header>
      <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${tags}${opposite && shared.length ? `<p class="common">겹치는 취미: ${esc(shared.join(', '))}</p>` : ''}
    </article>`;
  }

  /* ---------- 파티 후 ---------- */
  function mutualFor(id) {
    const mine = state.picks[id] || [];
    return mine.filter((x) => (find(x) || {}).status === 'confirmed' && (state.picks[x] || []).includes(id));
  }

  function renderAfter() {
    const me = currentViewer();
    const body = $('#after-body');
    if (!me) {
      body.innerHTML = '<div class="empty"><p>확정된 참가자가 없어요.</p></div>';
      return;
    }
    const rs = currentRounds();
    const met = rs ? L.metIn(rs, me.id) : new Map();
    const opp = L.confirmedOf(state.people, me.gender === 'F' ? 'M' : 'F').sort((a, b) => a.number - b.number);
    const pickable = (ids) => ids.filter((id) => opp.some((p) => p.id === id));
    if (ui.draft.viewerId !== me.id) setUi({ draft: { viewerId: me.id, ids: pickable(state.picks[me.id] || []) } });
    else if (pickable(ui.draft.ids).length !== ui.draft.ids.length) setUi({ draft: { ...ui.draft, ids: pickable(ui.draft.ids) } });
    const unmet = opp.filter((p) => !met.has(p.id));
    const seen = opp.filter((p) => met.has(p.id));
    const submitted = Object.prototype.hasOwnProperty.call(state.picks, me.id);
    const intro = `<section class="card"><h3>다시 얘기해보고 싶은 사람</h3>
      <p>${L.MAX_PICKS}명까지 골라주세요. 상대도 나를 골랐을 때만 서로의 인스타가 열려요. 한쪽만 고른 건 상대에게 알려지지 않아요.</p>
      ${state.phase < LAST_PHASE ? '<p class="hint">실제로는 파티가 끝나야 열려요. 시안이라 지금도 눌러볼 수 있어요.</p>' : ''}</section>`;
    const group = (title, hint, list) => (list.length ? `<div class="pick-group"><h4>${esc(title)}</h4>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<div class="picks">${list.map((p) => pickButton(p, met)).join('')}</div></div>` : '');
    const groups = rs
      ? group(`오늘 못 만난 분 ${unmet.length}명`, `3라운드라 이성 ${L.SEATS_PER_GENDER}명 중 ${unmet.length}명과는 같은 테이블에 앉지 못했어요.`, unmet)
        + group(`같은 테이블이었던 분 ${seen.length}명`, '', seen)
      : group('참가자', '', opp);
    body.innerHTML = intro + (submitted ? resultHtml(me) : '') + `
      <section class="card t-input-wrap">
        <div class="t-input pick-area">${groups}</div>
        <p class="err t-error-msg"></p>
        <div class="after-foot"><span id="pick-count" class="num">${ui.draft.ids.length} / ${L.MAX_PICKS}명 골랐어요</span>
          <button type="button" class="btn primary" data-action="submit-picks">${submitted ? '선택 고치기' : '선택 보내기'}</button></div>
      </section>`;
  }

  function pickButton(p, met) {
    const on = ui.draft.ids.includes(p.id);
    const m = met.get(p.id);
    const when = m ? `${m.round}라운드 테이블 ${m.table}` : '같은 테이블이 아니었어요';
    const sub = [p.mbti, p.strength, when].filter(Boolean).join(' · ');
    return `<button type="button" class="pick t-check" role="checkbox" aria-checked="${on}" data-action="pick" data-id="${esc(p.id)}">
      <span class="tick">${CHECK_SVG}</span><span class="badge-num ${gcls(p)}">${p.number}</span>
      <span class="nm">${esc(p.nick)}</span><span class="sub">${esc(sub)}</span></button>`;
  }

  function resultHtml(me) {
    const mutual = mutualFor(me.id).map(find).filter((p) => p && p.status === 'confirmed');
    const check = mutual.length
      ? `<span class="t-success-check check-icon" data-state="${ui.celebrate ? 'in' : 'done'}" aria-hidden="true">${BIG_CHECK_SVG}</span>` : '';
    const rows = mutual.map((p) => `<div class="match"><span><span class="badge-num ${gcls(p)}">${p.number}</span> ${esc(p.nick)}</span>
      <span class="insta">@${esc(p.insta)}</span>
      <button type="button" class="btn small" data-action="copy" data-copy="@${esc(p.insta)}">복사</button></div>`).join('');
    return `<section class="card result" aria-live="polite">
      <div class="result-head">${check}<div>
        <h3>${mutual.length ? `서로 고른 분이 ${mutual.length}명 있어요` : '아직 서로 고른 분이 없어요'}</h3>
        <p class="hint">${mutual.length ? '인스타로 먼저 인사해 보세요.' : '상대가 나를 고르면 여기에 떠요.'}</p></div></div>
      ${rows}</section>`;
  }

  /* ---------- 그리기 ---------- */
  function render() {
    $('#hdr-name').textContent = state.settings.name;
    $('#hdr-date').textContent = `${state.settings.date} · ${L.timetable(state.settings.start)[1].start} 시작`;
    fillViewerSelects(currentViewer());
    renderApply();
    renderHost();
    renderDay();
    renderAfter();
  }

  function fillSettings() {
    $$('[data-setting]').forEach((el) => { el.value = state.settings[el.dataset.setting]; });
  }

  function updateSetting(el) {
    const key = el.dataset.setting;
    let value = el.value;
    if (key === 'deposit') value = Math.max(0, Number(value) || 0);
    if (key === 'start' && !/^\d{2}:\d{2}$/.test(value)) return;
    setState({ settings: { ...state.settings, [key]: value } });
  }

  /* ---------- 버튼 ---------- */
  const ACTIONS = {
    reset() {
      state = freshState();
      ui = freshUi();
      $('#apply-form').hidden = false;
      $('#apply-done').hidden = true;
      resetForm();
      fillSettings();
      ['#round-tabs', '#people-tabs'].forEach((sel) => selectTab($(sel), $(`${sel} .t-tab`)));
      render();
      toast('예시 상태로 되돌렸어요');
    },
    'apply-again'() {
      resetForm();
      $('#apply-done').hidden = true;
      $('#apply-form').hidden = false;
      syncPills($('#apply-form'));
      $('#apply-form').scrollIntoView({ block: 'start' });
    },
    copy: copyText,
    goto(btn) { showView(btn.dataset.view); },
    replan() {
      const plan = L.planRounds(state.people);
      if (!plan.ok) return toast(`8 대 8이 되어야 배정할 수 있어요. 지금 여 ${plan.women} · 남 ${plan.men}`);
      setState({ round1: plan.round1, swapPick: null });
      return toast('설문 기준으로 1라운드 자리를 새로 짰어요');
    },
    swap(btn) {
      const id = btn.dataset.id;
      const pick = state.swapPick;
      if (!pick || pick === id) return setState({ swapPick: pick === id ? null : id });
      const a = find(pick);
      const b = find(id);
      if (a.gender !== b.gender) {
        toast('같은 성별끼리만 자리를 바꿀 수 있어요');
        return setState({ swapPick: id });
      }
      setState({ round1: L.swapSeats(state.round1, pick, id), swapPick: null });
      return toast(`${tagOf(a)}님과 ${tagOf(b)}님 자리를 바꿨어요`);
    },
    confirm(btn) {
      const p = find(btn.dataset.id);
      const number = L.nextNumber(state.people, p.gender);
      if (!number) return toast('남은 번호가 없어요');
      setUi({ justNumbered: p.id });
      setState({ people: state.people.map((x) => (x.id === p.id ? { ...x, status: 'confirmed', number } : x)) });
      setUi({ justNumbered: null });
      return toast(`${p.name}님 입금 확인, ${number}번을 드렸어요`);
    },
    cancel(btn) {
      const id = btn.dataset.id;
      // 두 번 눌러야 취소된다. 빠른 더블 탭은 두 번째 누름으로 치지 않는다.
      if (ui.armedCancel === id && Date.now() - ui.armedAt < ARM_GUARD_MS) return;
      clearTimeout(disarmTimer);
      if (ui.armedCancel !== id) {
        setUi({ armedCancel: id, armedAt: Date.now() });
        renderPeople();
        disarmTimer = setTimeout(() => {
          if (ui.armedCancel === id) { setUi({ armedCancel: null }); renderPeople(); }
        }, DISARM_MS);
        return;
      }
      const p = find(id);
      const people = state.people.map((x) => (x.id === id ? { ...x, status: 'cancelled', number: null } : x));
      setUi({ armedCancel: null });
      setState({ people, round1: L.round1Valid(state.round1, people) ? state.round1 : null, swapPick: null });
      const waiting = people.some((x) => x.status === 'waitlist' && x.gender === p.gender);
      toast(`${p.name}님을 취소했어요.${waiting ? ' 대기자를 자리로 올릴 수 있어요' : ''}`);
    },
    promote(btn) {
      const p = find(btn.dataset.id);
      if (L.seatsTaken(state.people, p.gender) >= L.SEATS_PER_GENDER) return toast('빈자리가 없어요');
      setState({ people: state.people.map((x) => (x.id === p.id ? { ...x, status: 'pending' } : x)) });
      return toast(`${p.name}님을 자리로 올렸어요. 예약금 안내를 보내주세요`);
    },
    'next-phase'() {
      const ph = state.phase + 1;
      setState({ phase: ph, phaseStartedAt: ph <= L.ROUND_COUNT ? Date.now() : null, swapPick: null });
      toast(ph <= L.ROUND_COUNT ? `${ph}라운드를 시작했어요. 참가자 화면에 새 테이블이 떠요` : '파티를 마쳤어요. 이제 다시 보고 싶은 사람을 고를 수 있어요');
    },
    'reset-phase'() {
      setState({ phase: 0, phaseStartedAt: null });
      toast('진행을 처음으로 돌렸어요');
    },
    pick(btn) {
      const id = btn.dataset.id;
      const ids = ui.draft.ids;
      const on = ids.includes(id);
      const wrap = btn.closest('.t-input-wrap');
      if (!on && ids.length >= L.MAX_PICKS) {
        showError(wrap, `${L.MAX_PICKS}명까지 고를 수 있어요. 다른 분을 먼저 빼주세요`, true);
        return;
      }
      const next = on ? ids.filter((x) => x !== id) : [...ids, id];
      setUi({ draft: { ...ui.draft, ids: next } });
      btn.setAttribute('aria-checked', String(!on));
      $('#pick-count').textContent = `${next.length} / ${L.MAX_PICKS}명 골랐어요`;
      clearError(wrap);
    },
    'submit-picks'() {
      const me = currentViewer();
      const before = mutualFor(me.id).length;
      setUi({ celebrate: true });
      setState({ picks: { ...state.picks, [me.id]: [...ui.draft.ids] } });
      setUi({ celebrate: false });
      const after = mutualFor(me.id).length;
      toast(after > before ? '서로 고른 분이 생겼어요' : '선택을 보냈어요');
      window.scrollTo(0, 0);
    },
  };

  function onClick(e) {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.matches('#main-tabs .t-tab')) return showView(t.dataset.view);
    if (t.matches('.t-tab[role="radio"]')) {
      selectTab(t.parentElement, t);
      return clearError(t.closest('.t-input-wrap'));
    }
    if (t.matches('#round-tabs .t-tab')) {
      selectTab(t.parentElement, t);
      return setState({ hostRound: Number(t.dataset.round), swapPick: null });
    }
    if (t.matches('#people-tabs .t-tab')) {
      selectTab(t.parentElement, t);
      return setState({ hostFilter: t.dataset.filter });
    }
    if (t.matches('.chip')) return toggleChip(t);
    if (t.matches('.box')) {
      t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true'));
      return clearError(t.closest('.t-input-wrap'));
    }
    if (t.matches('.t-acc-head')) return toggleAcc(t);
    const action = ACTIONS[t.dataset.action];
    return action ? action(t) : undefined;
  }

  function toggleChip(chip) {
    const group = chip.parentElement;
    const on = chip.getAttribute('aria-checked') === 'true';
    const max = Number(group.dataset.max) || Infinity;
    if (!on && $$('[aria-checked="true"]', group).length >= max) {
      showError(group.closest('.t-input-wrap'), `${max}개까지 고를 수 있어요`, true);
      return;
    }
    chip.setAttribute('aria-checked', String(!on));
    clearError(group.closest('.t-input-wrap'));
  }

  function onInput(e) {
    const el = e.target;
    if (el.closest('#apply-form')) clearError(el.closest('.t-input-wrap'));
    if (el.id === 'f-name' && !ui.depositorTouched) $('#f-depositor').value = el.value;
    if (el.id === 'f-depositor') setUi({ depositorTouched: true });
    if (el.dataset.setting) updateSetting(el);
  }

  function onChange(e) {
    const el = e.target;
    if (el.closest('#apply-form')) clearError(el.closest('.t-input-wrap'));
    if (el.matches('[data-viewer]')) setState({ viewerId: el.value });
  }

  function init() {
    initApplyForm();
    resetForm();
    fillSettings();
    render();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    $('#apply-form').addEventListener('submit', onSubmit);
    window.addEventListener('resize', () => syncPills());
    window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
    setInterval(() => $$('[data-timer]').forEach((el) => { el.textContent = timerText(); }), 1000);
    const first = location.hash.slice(1);
    showView(VIEWS.includes(first) ? first : 'apply');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => syncPills());
  }

  init();
}());
