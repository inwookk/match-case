/* 주최자 화면 — 참가자 전체, 테이블 배정, 진행, 파티 후 연결을 그린다. 상태를 바꾸지 않고 그리기만 한다. */
(function (root) {
  'use strict';

  const L = root.MeetLogic;
  const { $, esc, digits, won, gcls, gshort, ICONS } = root.MeetKit;
  const TOTAL_SEATS = L.SEATS_PER_GENDER * 2;
  const STATUS = {
    confirmed: { label: '확정', cls: 'good', order: 0 },
    applied: { label: '승인 대기', cls: 'accent', order: 1 },
    pending: { label: '입금 대기', cls: 'warn', order: 2 },
    waitlist: { label: '대기자', cls: '', order: 3 },
    cancelled: { label: '취소', cls: '', order: 4 },
  };

  // ctx: { state, ui, live, busy, clock, inviteLink, signupOnly }
  // signupOnly: 신청 받는 기간이라 테이블·진행·파티 후 연결 카드는 숨긴다.
  function render(ctx) {
    const { state } = ctx;
    const count = (status, gender) => state.people.filter((p) => p.status === status && (!gender || p.gender === gender)).length;
    $('#host-stats').innerHTML = [
      [`${count('confirmed', 'F')}/${L.SEATS_PER_GENDER}`, '여 확정'],
      [`${count('confirmed', 'M')}/${L.SEATS_PER_GENDER}`, '남 확정'],
      [count('applied'), '승인 대기'],
      [count('pending'), '입금 대기'],
      [count('waitlist'), '대기자'],
    ].map(([n, label]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join('');
    ['#card-tables', '#card-flow', '#card-links'].forEach((sel) => { $(sel).hidden = Boolean(ctx.signupOnly); });
    renderPeople(ctx);
    renderSettings(ctx);
    if (ctx.signupOnly) return;
    renderTables(ctx);
    renderFlow(ctx);
    renderLinks(ctx);
  }

  const finder = (state) => (id) => state.people.find((p) => p.id === id);
  const roundsOf = (state) => (L.round1Valid(state.round1, state.people) ? L.deriveRounds(state.round1) : null);
  const tagOf = (p) => (p.number ? `${p.number}번 ${p.nick}` : p.nick);

  function renderTables(ctx) {
    const { state } = ctx;
    const rs = roundsOf(state);
    const r = state.hostRound;
    const locked = state.phase > 0;
    const women = L.confirmedOf(state.people, 'F').length;
    const men = L.confirmedOf(state.people, 'M').length;
    const full = women === L.SEATS_PER_GENDER && men === L.SEATS_PER_GENDER;
    $('#btn-replan').disabled = locked || !full || ctx.busy;
    if (!rs) {
      $('#tables-hint').textContent = '';
      const again = Array.isArray(state.round1) && state.round1.length > 0;
      const msg = !full ? `확정 인원이 여 ${women} · 남 ${men}이에요. 8 대 8이 되면 배정할 수 있어요.`
        : again ? '참가자가 바뀌어서 테이블을 다시 짜야 해요.' : '8 대 8이 모였어요. 설문으로 첫 테이블을 짜 주세요.';
      $('#tables-body').innerHTML = `<div class="empty"><p>${esc(msg)}</p>${full ? '<button type="button" class="btn primary small" data-action="replan">설문으로 배정하기</button>' : ''}</div>`;
      return;
    }
    $('#tables-hint').textContent = r > 0
      ? '라운드마다 남자 2명이 옆 테이블로 한 칸씩 옮기고, 여자는 자리를 지켜요. 1라운드 자리를 바꾸면 여기도 따라 바뀌어요.'
      : locked
        ? '파티가 시작돼서 자리를 바꿀 수 없어요.'
        : '이름을 누르고 같은 성별인 다른 사람을 누르면 두 사람 자리가 바뀌어요.';
    const swappable = r === 0 && !locked && !ctx.busy;
    $('#tables-body').innerHTML = `<div class="tables">${rs[r].map((t, i) => tableCard(state, t, i, swappable)).join('')}</div>`;
  }

  function tableCard(state, table, i, swappable) {
    const find = finder(state);
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

  function renderPeople(ctx) {
    const { state } = ctx;
    const filter = state.hostFilter;
    const list = state.people
      .filter((p) => filter === 'all' || p.status === filter)
      .sort((a, b) => STATUS[a.status].order - STATUS[b.status].order
        || (a.number || 99) - (b.number || 99) || a.appliedAt - b.appliedAt);
    $('#people-body').innerHTML = list.length ? list.map((p) => personRow(ctx, p)).join('') : '<p class="hint">해당하는 사람이 없어요.</p>';
  }

  function personRow(ctx, p) {
    const { state, ui } = ctx;
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
          <span class="t-acc-chevron" aria-hidden="true">${ICONS.chevron}</span>
        </button>
        <div class="person-act">${personActions(ctx, p)}</div>
      </div>
      <div class="t-acc-panel" id="pd-${esc(p.id)}"><div class="t-acc-panel-inner">
        <dl class="detail">${personDetail(p)}</dl>${ctx.live ? linkTools(ctx, p) : ''}
      </div></div>
    </div>`;
  }

  function personActions(ctx, p) {
    const { state, ui } = ctx;
    const id = esc(p.id);
    const dis = ctx.busy ? ' disabled' : '';
    const word = p.status === 'applied' ? '거절' : '취소';
    const cancel = ui.armedCancel === p.id
      ? `<button type="button" class="btn small danger-armed" data-action="cancel" data-id="${id}"${dis}>한 번 더 누르면 ${word}</button>`
      : `<button type="button" class="btn small" data-action="cancel" data-id="${id}"${dis}>${word}</button>`;
    const open = L.canApprove(state.people, p);
    const approve = (label) => `<button type="button" class="btn small primary" data-action="approve" data-id="${id}"${open && !ctx.busy ? '' : ' disabled'}${open ? '' : ' title="빈자리가 없어요. 다른 사람을 먼저 취소해야 해요"'}>${label}</button>`;
    if (p.status === 'applied') {
      return `${approve('승인')}<button type="button" class="btn small" data-action="to-waitlist" data-id="${id}"${dis}>대기자로</button>${cancel}`;
    }
    if (p.status === 'pending') return `<button type="button" class="btn small primary" data-action="confirm" data-id="${id}"${dis}>입금 확인</button>${cancel}`;
    if (p.status === 'confirmed') return state.phase > 0 ? '' : cancel;
    if (p.status === 'waitlist') return `${approve('자리로 올리기')}${cancel}`;
    return '';
  }

  // 개인 링크는 시트에 암호화해 두므로 다시 볼 수 없다. 잃어버리면 새로 만들어 보내준다.
  function linkTools(ctx, p) {
    const link = ctx.ui.issued[p.id];
    if (link) {
      return `<div class="bank link-box"><p class="label">${esc(p.nick)}님 새 개인 링크</p>
        <div class="bank-row"><span class="copyable">${esc(link)}</span><button type="button" class="btn small" data-action="copy" data-copy="${esc(link)}">복사</button></div>
        <p class="hint">이전 링크는 이제 열리지 않아요. 카톡으로 보내주세요.</p></div>`;
    }
    return `<div class="flow-actions"><button type="button" class="btn small" data-action="reissue" data-id="${esc(p.id)}"${ctx.busy ? ' disabled' : ''}>개인 링크 새로 만들기</button></div>`;
  }

  function personDetail(p) {
    const labels = (list, ids) => (ids || []).map((x) => L.labelOf(list, x)).filter(Boolean);
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

  // 신청 화면은 일정 안내라 설명을 붙이고, 주최자 진행판은 지금 단계를 표시한다.
  function programHtml(rows, phase, live) {
    const note = (r) => {
      if (live) return '';
      if (r.phase === 1) return '<small>설문으로 정한 첫 테이블</small>';
      if (r.phase > 1 && r.phase <= L.ROUND_COUNT) return '<small>남자 2명이 옆 테이블로 옮겨요</small>';
      return '';
    };
    return rows.map((r) => `<li class="${live && r.phase === phase ? 'is-now' : ''}">
      <span class="when">${r.end ? `${r.start}–${r.end}` : r.start}</span>
      <span class="what">${esc(r.label)}${note(r)}</span></li>`).join('');
  }

  function renderFlow(ctx) {
    const { state } = ctx;
    const rows = L.timetable(state.settings.start);
    const ph = state.phase;
    const ready = Boolean(roundsOf(state));
    const NOW = { [L.PHASE_PICKS]: '파티 끝 · 선택 받는 중', [L.PHASE_RESULTS]: '결과 공개됨' };
    const now = ph === 0 ? '입장 전' : ph <= L.ROUND_COUNT ? `${ph}라운드 진행 중` : NOW[ph];
    const timer = ph >= 1 && ph <= L.ROUND_COUNT ? `<p class="timer" data-timer>${esc(ctx.clock)}</p>` : '';
    let next = null;
    if (ph === 0) next = { label: '1라운드 시작', disabled: !ready };
    else if (ph < L.ROUND_COUNT) next = { label: `${ph + 1}라운드로 넘기기`, disabled: false };
    else if (ph === L.ROUND_COUNT) next = { label: '파티 마치고 선택 열기', disabled: false };
    else if (ph === L.PHASE_PICKS) next = { label: '결과 공개하기', disabled: false };
    let note = '누르면 참가자 화면의 테이블 번호가 바뀌어요.';
    if (ph === 0 && !ready) note = '먼저 테이블을 배정해 주세요.';
    else if (ph === L.PHASE_PICKS) note = '다들 고르면 결과를 공개해 주세요. 공개하면 아무도 더 고칠 수 없고, 서로 고른 사람에게만 인스타가 보여요.';
    else if (ph === L.PHASE_RESULTS) note = '서로 고른 사람에게 인스타가 보이고 있어요.';
    const dis = (d) => (d || ctx.busy ? ' disabled' : '');
    $('#flow-body').innerHTML = `
      <div class="phase"><p class="phase-now">${esc(now)}</p>${timer}</div>
      <ol class="program flow-program">${programHtml(rows, ph, true)}</ol>
      <div class="flow-actions">
        ${next ? `<button type="button" class="btn primary" data-action="next-phase"${dis(next.disabled)}>${next.label}</button>` : ''}
        ${ph > 0 ? `<button type="button" class="btn" data-action="reset-phase"${dis(false)}>진행 처음으로</button>` : ''}
        ${ctx.live ? `<button type="button" class="btn" data-action="refresh"${dis(false)}>새로 불러오기</button>` : ''}
      </div>
      <p class="hint">${esc(note)}</p>`;
  }

  function confirmedPicks(state) {
    const ids = L.confirmedOf(state.people).map((p) => p.id);
    return Object.fromEntries(Object.entries(state.picks)
      .filter(([id]) => ids.includes(id))
      .map(([id, list]) => [id, list.filter((x) => ids.includes(x))]));
  }

  function renderLinks(ctx) {
    const { state, ui } = ctx;
    const find = finder(state);
    const picks = confirmedPicks(state);
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
          <span class="t-acc-chevron" aria-hidden="true">${ICONS.chevron}</span>
        </button>
        <div class="t-acc-panel" id="one-sided-panel"><div class="t-acc-panel-inner"><div class="acc-body">
          ${one.length ? `<ul>${one.map(([a, b]) => `<li>${esc(tagOf(find(a)))} → ${esc(tagOf(find(b)))}</li>`).join('')}</ul>` : '<p>없어요.</p>'}
          <p>고른 사람에게도, 받은 사람에게도 알려지지 않아요.</p>
        </div></div></div>
      </div>`;
  }

  // 실제 운영에서는 행사 정보를 시트의 '설정' 탭에서 고친다. 여기서는 확인과 초대 링크만 보여준다.
  function renderSettings(ctx) {
    $('#settings-demo').hidden = ctx.live;
    $('#settings-live').hidden = !ctx.live;
    $('#settings-hint').textContent = ctx.live
      ? "고칠 게 있으면 구글 시트의 '설정' 탭에서 바꾸고 새로 불러오기를 눌러주세요."
      : '여기서 고치면 신청 화면에 바로 반영돼요.';
    if (!ctx.live) return;
    const s = ctx.state.settings;
    const rows = [['행사 이름', s.name], ['날짜', s.date], ['1라운드 시작', s.start], ['장소', s.place],
      ['예약금', won(s.deposit)], ['입금 계좌', s.account || '비어 있어요']];
    $('#settings-live').innerHTML = `
      <dl class="detail">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="bank"><p class="label">초대 링크</p>
        <div class="bank-row"><span class="copyable">${esc(ctx.inviteLink)}</span><button type="button" class="btn small" data-action="copy" data-copy="${esc(ctx.inviteLink)}">복사</button></div>
        <p class="hint">단톡방에 이 링크를 올리면 돼요. 이 링크가 있어야 신청할 수 있어요.</p></div>`;
  }

  root.MeetHost = { render, renderPeople, programHtml };
}(window));
