/* 8:8 미팅 파티 — 화면 상태와 동작.
   config.js에 Apps Script 주소가 있으면 실제 운영이고, 링크의 # 뒤로 화면이 정해진다(c=신청, t=손님, h=주최자).
   주소가 비어 있으면 예시 데이터로 네 화면을 모두 눌러보는 시안이다. */
(function () {
  'use strict';

  const L = window.MeetLogic;
  const D = window.MeetData;
  const Api = window.MeetApi;
  const Guest = window.MeetGuest;
  const Host = window.MeetHost;
  const { $, $$, esc, toast, movePill, selectTab, syncPills, showError, clearError, copyText, won, gshort, setBusy } = window.MeetKit;
  const { initApplyForm, readForm } = window.MeetForm;

  const DISARM_MS = 4000;
  const ARM_GUARD_MS = 400;
  const POLL_MS = { guest: 20000, host: 30000 };
  const LINK = Api.readLink();
  const MODE = !Api.live ? 'demo' : LINK.hostKey ? 'host' : LINK.token ? 'guest' : 'apply';
  const VIEWS = { demo: ['apply', 'host', 'day', 'after'], apply: ['apply'], guest: ['day', 'after'], host: ['host'] }[MODE];
  const LIVE = MODE !== 'demo';

  const freshUi = () => ({
    openKeys: new Set(),
    armedCancel: null,
    armedAt: 0,
    justNumbered: null,
    shownTable: null,
    draft: { viewerId: null, ids: [] },
    celebrate: false,
    depositorTouched: false,
    issued: {},
    busy: false,
  });

  const blankSettings = () => ({ name: '', date: '', start: '19:00', place: '', deposit: 0, account: '', refund: '' });

  function freshState() {
    const base = {
      settings: blankSettings(), people: [], round1: null, phase: 0, phaseStartedAt: null, picks: {},
      viewerId: null, hostRound: 0, hostFilter: 'all', swapPick: null,
      guest: null, seats: null, loaded: !LIVE, loadError: '',
    };
    if (LIVE) return base;
    const people = D.samplePeople();
    const plan = L.planRounds(people);
    return {
      ...base, settings: D.sampleSettings(), people, round1: plan.ok ? plan.round1 : null,
      picks: D.samplePicks(), viewerId: 'p1',
    };
  }

  let state = freshState();
  let ui = freshUi();
  let view = VIEWS[0];
  let disarmTimer = null;
  // 늦게 도착한 불러오기 응답이 그사이 저장한 내용을 덮지 않게 순번과 저장 횟수를 센다.
  let loadSeq = 0;
  let version = 0;

  function setState(patch) {
    state = { ...state, ...patch };
    render();
  }
  const setUi = (patch) => { ui = { ...ui, ...patch }; };

  const find = (id) => state.people.find((p) => p.id === id);
  const tagOf = (p) => (p.number ? `${p.number}번 ${p.nick}` : p.nick);
  const clockNow = () => L.roundClock(MODE === 'guest' && state.guest ? state.guest.phaseStartedAt : state.phaseStartedAt, Date.now());

  /* ---------- 화면 전환 ---------- */
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
    applyVisibility();
    const bar = $('#main-tabs');
    $$('.t-tab', bar).forEach((t) => t.setAttribute('aria-selected', t.dataset.view === next ? 'true' : 'false'));
    movePill(bar, true);
    if (next === 'day' || next === 'after') renderGuest();
    syncPills($(`#view-${next}`));
    window.scrollTo(0, 0);
  }

  function applyVisibility() {
    const gated = LIVE && !state.loaded;
    ['apply', 'host', 'day', 'after'].forEach((v) => { $(`#view-${v}`).hidden = gated || v !== view; });
    $('#gate').hidden = !gated;
  }

  function setupChrome() {
    $('#demo-note').hidden = LIVE;
    $$('#main-tabs .t-tab').forEach((t) => { t.hidden = !VIEWS.includes(t.dataset.view); });
    $('#main-tabs').hidden = VIEWS.length < 2;
    $$('.viewer').forEach((el) => { el.hidden = LIVE; });
    $$('[data-action="apply-again"]').forEach((el) => { el.hidden = LIVE; });
    if (MODE === 'guest') $('#tab-day').textContent = '내 화면';
  }

  /* ---------- 불러오기 (실제 운영) ---------- */
  async function fetchState() {
    if (MODE === 'apply') {
      if (!LINK.code) throw new Api.ApiError('초대 링크로 들어와 주세요. 주최자가 보낸 링크를 다시 눌러 주세요.');
      const data = await Api.call('event', { code: LINK.code });
      return { settings: { ...state.settings, ...data.event }, seats: data.seats, loaded: true, loadError: '' };
    }
    if (MODE === 'guest') {
      const model = await Api.call('me', { token: LINK.token });
      return { guest: model, settings: { ...state.settings, ...model.event }, loaded: true, loadError: '' };
    }
    return hostPatch(await Api.call('host', { key: LINK.hostKey }));
  }

  // 끊김은 조용히 넘기고 마지막 화면을 둔다. 서버가 거절하면(링크가 바뀜 등) 이유를 보여준다.
  async function load(silent) {
    const seq = ++loadSeq;
    const startVersion = version;
    try {
      const patch = await fetchState();
      if (seq !== loadSeq || startVersion !== version) return;
      setState(patch);
    } catch (err) {
      if (seq !== loadSeq) return;
      if (err.uncertain && state.loaded) {
        if (!silent) toast(err.message);
        return;
      }
      setState({ loaded: false, loadError: err.message });
    }
  }

  function hostPatch(h) {
    const keep = state.swapPick && h.people.some((p) => p.id === state.swapPick) ? state.swapPick : null;
    return {
      settings: { ...state.settings, ...h.settings }, people: h.people, round1: h.round1, phase: h.phase,
      phaseStartedAt: h.phaseStartedAt, picks: h.picks, loaded: true, loadError: '', swapPick: keep,
    };
  }

  function applyHost(h) {
    setState(hostPatch(h));
  }

  function renderGate() {
    if (!LIVE || state.loaded) return;
    const retry = MODE === 'apply' && !LINK.code ? '' : '<button type="button" class="btn" data-action="retry">다시 시도</button>';
    $('#gate').innerHTML = state.loadError
      ? `<h3>열 수 없어요</h3><p class="hint">${esc(state.loadError)}</p>${retry}`
      : '<p class="t-shimmer" data-text="불러오는 중">불러오는 중</p>';
  }

  // 서버에 쓰는 주최자 작업. 하나씩만 보내고, 성공하면 서버가 준 최신 상태로 다시 그린다.
  async function hostOp(op, args, btn, label) {
    if (ui.busy) { toast('저장하는 중이에요. 잠시만요'); return null; }
    const done = setBusy(btn, label || '저장하는 중');
    setUi({ busy: true });
    try {
      const data = await Api.call('hostAction', { key: LINK.hostKey, op, ...args });
      setUi({ busy: false });
      version += 1;
      applyHost(data.host);
      return data.result;
    } catch (err) {
      setUi({ busy: false });
      render();
      toast(err.message);
      return null;
    } finally {
      done();
    }
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

  function demoApply(values) {
    const { consent, ...rest } = values;
    const queued = state.people.some((p) => p.status === 'waitlist' && p.gender === values.gender);
    const open = !queued && L.seatsTaken(state.people, values.gender) < L.SEATS_PER_GENDER;
    const person = {
      ...rest, id: `n${Date.now().toString(36)}`, nick: /^[가-힣]{3}$/.test(values.name) ? values.name.slice(1) : values.name,
      status: open ? 'pending' : 'waitlist', number: null, appliedAt: Date.now(),
    };
    const people = [...state.people, person];
    setState({ people });
    const full = L.seatsTaken(people, person.gender) >= L.SEATS_PER_GENDER;
    showDone({
      status: person.status, waitPosition: L.waitlistPosition(people, person),
      why: full ? `${L.byId(L.GENDERS, person.gender).label} 자리 ${L.SEATS_PER_GENDER}개가 다 찼어요.` : '먼저 기다리는 분이 있어요.',
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    const { raw, values, errors } = readForm();
    if (errors.length) {
      errors.forEach(({ id, msg }) => showError($(`#${id}`).closest('.t-input-wrap'), msg, false));
      const first = $(`#${errors[0].id}`).closest('.t-input-wrap') || $(`#${errors[0].id}`);
      first.scrollIntoView({ block: 'center' });
      toast(`${errors.length}곳을 확인해 주세요`);
      return;
    }
    if (!LIVE) return demoApply(values);
    const done = setBusy($('#btn-apply'), '보내는 중');
    showNotice('');
    try {
      const data = await Api.call('apply', { code: LINK.code, form: raw });
      showDone({ status: data.status, waitPosition: data.waitPosition, token: data.token });
      load(true);
    } catch (err) {
      // 응답만 못 받았을 수 있다. 그러면 신청은 됐는데 개인 링크만 잃은 상태라 다음 할 일을 알려준다.
      showNotice(err.uncertain
        ? "신청이 들어갔는지 확인하지 못했어요. 잠시 뒤 '신청하기'를 다시 눌러 보세요. '이미 신청한 연락처예요'라고 나오면 신청은 된 거예요. 그때는 주최자에게 개인 링크를 받아 주세요."
        : err.message);
      toast(err.message);
    } finally {
      done();
    }
    return undefined;
  }

  function showNotice(text) {
    const el = $('#apply-notice');
    el.textContent = text;
    el.hidden = !text;
  }

  function showDone({ status, waitPosition, why, token }) {
    const waiting = status === 'waitlist';
    $('#done-title').textContent = waiting ? '대기자로 신청했어요' : '신청했어요';
    $('#done-text').textContent = waiting
      ? `${why ? `${why} ` : ''}지금 대기 ${waitPosition}번째예요. 자리가 나면 연락드리고, 그때 예약금을 받아요.`
      : `${won(state.settings.deposit)}을 보내주시면 주최자가 확인하고 번호를 드려요.${LIVE ? '' : " 주최자 화면의 '입금 대기'에서 이어서 볼 수 있어요."}`;
    const box = $('#done-link');
    box.hidden = !token;
    if (token) {
      const url = Api.linkFor('t', token);
      $('#done-link-text').textContent = url;
      $('#done-link-copy').dataset.copy = url;
      $('#done-link-open').href = url;
    }
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

  function seatInfo(gender) {
    if (LIVE) return state.seats ? state.seats[gender] : { taken: 0, wait: 0 };
    return {
      taken: L.seatsTaken(state.people, gender),
      wait: state.people.filter((p) => p.status === 'waitlist' && p.gender === gender).length,
    };
  }

  function seatRow(g) {
    const { taken, wait } = seatInfo(g.id);
    const dots = Array.from({ length: L.SEATS_PER_GENDER }, (_, i) => `<span class="dot${i < taken ? ' on' : ''}"></span>`).join('');
    return `<div class="seatrow ${g.id === 'F' ? 'her' : 'him'}"><span class="who-g">${g.short}</span>
      <span class="dots" aria-hidden="true">${dots}</span>
      <span class="count">${taken}/${L.SEATS_PER_GENDER}${wait ? ` · 대기 ${wait}` : ''}</span></div>`;
  }

  function renderApply() {
    const s = state.settings;
    const rows = L.timetable(s.start);
    $('#apply-title').textContent = s.name;
    $('#apply-facts').innerHTML = [
      ['날짜', s.date], ['시간', `${rows[1].start} ~ ${rows[rows.length - 1].start}`], ['장소', s.place], ['예약금', won(s.deposit)],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '곧 알려드려요')}</dd></div>`).join('');
    $('#apply-program').innerHTML = Host.programHtml(rows, state.phase, false);
    $('#apply-seats').innerHTML = `<p class="label">남은 자리</p>${L.GENDERS.map(seatRow).join('')}
      <p class="hint">자리가 차면 대기자로 받아요. 취소가 나오면 같은 성별 대기자에게 먼저 연락드려요.</p>`;
    $('#apply-bank').innerHTML = `
      <div class="bank-row"><span class="label">예약금</span><span class="bank-amount">${esc(won(s.deposit))}</span></div>
      <div class="bank-row"><span class="copyable">${esc(s.account || '주최자가 곧 알려드려요')}</span>
        ${s.account ? `<button type="button" class="btn small" data-action="copy" data-copy="${esc(s.account)}">계좌 복사</button>` : ''}</div>
      <p class="hint">${esc(s.refund)}</p>`;
  }

  /* ---------- 손님 ---------- */
  const viewers = () => L.confirmedOf(state.people).sort((a, b) => a.number - b.number);

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

  function currentModel() {
    if (LIVE) return state.guest;
    const me = currentViewer();
    return me ? L.guestModel(state, me.id, { reveal: true }) : null;
  }

  function renderGuest() {
    const model = currentModel();
    if (!model) {
      $('#day-body').innerHTML = '<div class="empty"><p>확정된 참가자가 없어요.</p></div>';
      $('#after-body').innerHTML = '';
      return;
    }
    const pickable = model.picks ? model.picks.options.map((o) => o.id) : [];
    const keepPickable = (ids) => ids.filter((id) => pickable.includes(id));
    if (ui.draft.viewerId !== model.me.id) {
      setUi({ draft: { viewerId: model.me.id, ids: keepPickable(model.picks ? model.picks.mine : []) } });
    } else if (keepPickable(ui.draft.ids).length !== ui.draft.ids.length) {
      setUi({ draft: { ...ui.draft, ids: keepPickable(ui.draft.ids) } });
    }
    const key = Guest.tableKey(model);
    const animate = view === 'day' && key !== null && ui.shownTable !== null && ui.shownTable !== key;
    if (view === 'day' && key) setUi({ shownTable: key });
    $('#day-body').innerHTML = Guest.dayHtml(model, { animate, clock: clockNow() });
    $('#after-body').innerHTML = Guest.afterHtml(model, { draft: ui.draft.ids, celebrate: ui.celebrate, live: LIVE });
  }

  /* ---------- 그리기 ---------- */
  function hostCtx() {
    return {
      state, ui, live: LIVE, busy: ui.busy, clock: clockNow(),
      inviteLink: state.settings.invite_code ? Api.linkFor('c', state.settings.invite_code) : '',
    };
  }

  function render() {
    const s = state.settings;
    $('#hdr-name').textContent = s.name || '미팅 파티';
    $('#hdr-date').textContent = [s.date, `${L.timetable(s.start)[1].start} 시작`].filter(Boolean).join(' · ');
    applyVisibility();
    renderGate();
    if (!state.loaded) return;
    if (!LIVE) fillViewerSelects(currentViewer());
    if (VIEWS.includes('apply')) renderApply();
    if (VIEWS.includes('host')) Host.render(hostCtx());
    if (VIEWS.includes('day')) renderGuest();
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
    retry() {
      setState({ loadError: '' });
      load(false);
    },
    async refresh(btn) {
      const done = setBusy(btn, '불러오는 중');
      await load(false);
      done();
      toast('새로 불러왔어요');
    },
    async replan(btn) {
      const plan = L.planRounds(state.people);
      if (!plan.ok) return toast(`8 대 8이 되어야 배정할 수 있어요. 지금 여 ${plan.women} · 남 ${plan.men}`);
      if (LIVE && !(await hostOp('seating', { round1: plan.round1 }, btn, '배정하는 중'))) return undefined;
      if (!LIVE) setState({ round1: plan.round1, swapPick: null });
      return toast('설문 기준으로 1라운드 자리를 새로 짰어요');
    },
    async swap(btn) {
      const id = btn.dataset.id;
      const pick = state.swapPick;
      if (!pick || pick === id) return setState({ swapPick: pick === id ? null : id });
      const a = find(pick);
      const b = find(id);
      if (a.gender !== b.gender) {
        toast('같은 성별끼리만 자리를 바꿀 수 있어요');
        return setState({ swapPick: id });
      }
      const before = state.round1;
      setState({ round1: L.swapSeats(state.round1, pick, id), swapPick: null });
      if (LIVE && !(await hostOp('seating', { round1: state.round1 }, null))) return setState({ round1: before });
      return toast(`${tagOf(a)}님과 ${tagOf(b)}님 자리를 바꿨어요`);
    },
    async confirm(btn) {
      const p = find(btn.dataset.id);
      setUi({ justNumbered: p.id });
      let number = null;
      if (LIVE) {
        const result = await hostOp('confirm', { id: p.id }, btn, '확인하는 중');
        number = result && result.number;
      } else {
        number = L.nextNumber(state.people, p.gender);
        if (number) setState({ people: state.people.map((x) => (x.id === p.id ? { ...x, status: 'confirmed', number } : x)) });
      }
      setUi({ justNumbered: null });
      if (number) toast(`${p.name}님 입금 확인, ${number}번을 드렸어요`);
      else if (!LIVE) toast('남은 번호가 없어요');
    },
    async cancel(btn) {
      const id = btn.dataset.id;
      // 두 번 눌러야 취소된다. 빠른 더블 탭은 두 번째 누름으로 치지 않는다.
      if (ui.armedCancel === id && Date.now() - ui.armedAt < ARM_GUARD_MS) return;
      clearTimeout(disarmTimer);
      if (ui.armedCancel !== id) {
        setUi({ armedCancel: id, armedAt: Date.now() });
        Host.renderPeople(hostCtx());
        disarmTimer = setTimeout(() => {
          if (ui.armedCancel === id) { setUi({ armedCancel: null }); Host.renderPeople(hostCtx()); }
        }, DISARM_MS);
        return;
      }
      const p = find(id);
      setUi({ armedCancel: null });
      if (LIVE) {
        if (!(await hostOp('cancel', { id }, btn, '취소하는 중'))) return;
      } else {
        const people = state.people.map((x) => (x.id === id ? { ...x, status: 'cancelled', number: null } : x));
        setState({ people, round1: L.round1Valid(state.round1, people) ? state.round1 : null, swapPick: null });
      }
      const waiting = state.people.some((x) => x.status === 'waitlist' && x.gender === p.gender);
      toast(`${p.name}님을 취소했어요.${waiting ? ' 대기자를 자리로 올릴 수 있어요' : ''}`);
    },
    async promote(btn) {
      const p = find(btn.dataset.id);
      if (LIVE) {
        if (!(await hostOp('promote', { id: p.id }, btn, '올리는 중'))) return undefined;
      } else {
        if (L.seatsTaken(state.people, p.gender) >= L.SEATS_PER_GENDER) return toast('빈자리가 없어요');
        setState({ people: state.people.map((x) => (x.id === p.id ? { ...x, status: 'pending' } : x)) });
      }
      return toast(`${p.name}님을 자리로 올렸어요. 예약금 안내를 보내주세요`);
    },
    async 'next-phase'(btn) {
      const ph = state.phase + 1;
      if (LIVE && !(await hostOp('phase', { phase: ph }, btn, '바꾸는 중'))) return;
      if (!LIVE) setState({ phase: ph, phaseStartedAt: ph <= L.ROUND_COUNT ? Date.now() : null, swapPick: null });
      if (ph <= L.ROUND_COUNT) toast(`${ph}라운드를 시작했어요. 참가자 화면에 새 테이블이 떠요`);
      else if (ph === L.PHASE_PICKS) toast('파티를 마쳤어요. 이제 다시 보고 싶은 사람을 고를 수 있어요');
      else toast('결과를 공개했어요. 서로 고른 사람에게 인스타가 보여요');
    },
    async 'reset-phase'(btn) {
      if (LIVE && !(await hostOp('phase', { phase: 0 }, btn, '바꾸는 중'))) return;
      if (!LIVE) setState({ phase: 0, phaseStartedAt: null });
      toast('진행을 처음으로 돌렸어요');
    },
    async reissue(btn) {
      const id = btn.dataset.id;
      const result = await hostOp('reissue', { id }, btn, '만드는 중');
      if (!result) return;
      setUi({ issued: { ...ui.issued, [id]: Api.linkFor('t', result.token) } });
      Host.renderPeople(hostCtx());
      toast('새 개인 링크를 만들었어요');
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
    async 'submit-picks'(btn) {
      if (ui.busy) return;
      const model = currentModel();
      const before = model.picks.mutual.length;
      let after = before;
      if (LIVE) {
        const done = setBusy(btn, '보내는 중');
        setUi({ busy: true });
        try {
          const next = await Api.call('pick', { token: LINK.token, ids: [...ui.draft.ids] });
          after = next.picks.mutual.length;
          version += 1;
          setUi({ celebrate: true, busy: false });
          setState({ guest: next });
        } catch (err) {
          setUi({ busy: false });
          toast(err.message);
          return;
        } finally {
          done();
          setUi({ celebrate: false });
        }
      } else {
        setUi({ celebrate: true });
        setState({ picks: { ...state.picks, [model.me.id]: [...ui.draft.ids] } });
        setUi({ celebrate: false });
        after = currentModel().picks.mutual.length;
      }
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
    if (el.dataset.setting && !LIVE) updateSetting(el);
  }

  function onChange(e) {
    const el = e.target;
    if (el.closest('#apply-form')) clearError(el.closest('.t-input-wrap'));
    if (el.matches('[data-viewer]')) setState({ viewerId: el.value });
  }

  // 같은 탭에서 다른 종류의 링크(예: 신청 뒤 내 화면 열기)로 바뀌면 처음부터 다시 연다.
  function onHashChange() {
    const next = Api.readLink();
    if (next.code !== LINK.code || next.token !== LINK.token || next.hostKey !== LINK.hostKey) {
      window.location.reload();
      return;
    }
    if (!LIVE) showView(window.location.hash.slice(1));
  }

  function startPolling() {
    const ms = POLL_MS[MODE];
    if (!ms) return;
    setInterval(() => { if (document.visibilityState === 'visible' && !ui.busy) load(true); }, ms);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !ui.busy) load(true); });
  }

  function init() {
    setupChrome();
    initApplyForm();
    resetForm();
    fillSettings();
    render();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    $('#apply-form').addEventListener('submit', onSubmit);
    window.addEventListener('resize', () => syncPills());
    window.addEventListener('hashchange', onHashChange);
    setInterval(() => $$('[data-timer]').forEach((el) => { el.textContent = clockNow(); }), 1000);
    const first = window.location.hash.slice(1);
    showView(VIEWS.includes(first) ? first : VIEWS[0]);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => syncPills());
    if (LIVE) load(false).then(() => { showView(view); startPolling(); });
  }

  init();
}());
