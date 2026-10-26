/* 손님 화면 — logic.guestModel이 만든 손님용 데이터만으로 당일 화면과 파티 후 화면을 그린다.
   실제 운영에서는 이 데이터를 서버가 만들어 보내므로, 남의 비공개 정보는 애초에 브라우저에 오지 않는다. */
(function (root) {
  'use strict';

  const L = root.MeetLogic;
  const { esc, digits, won, gcls, gshort, toTable, ICONS } = root.MeetKit;

  function tableKey(model) {
    return model && model.table ? `${model.me.id}|${model.phase}|${model.table.number}` : null;
  }

  function ticketHtml(model) {
    const { me, event } = model;
    const rows = L.timetable(event.start);
    return `<div class="ticket-wrap"><div class="ticket">
      <div class="stub ${gcls(me)}"><small>번호표</small><span class="big">${me.number}</span><small>${gshort(me)}</small></div>
      <div class="ticket-body"><p class="eyebrow">${esc(event.name)}</p><h3>${esc(me.nick)}</h3>
        <p class="hint">${esc(event.date)} · ${rows[0].start} 입장</p>
        <p class="hint">입구에서 이 번호가 적힌 이름표를 받아요.</p></div></div></div>`;
  }

  function statusHtml(model) {
    const { me, event } = model;
    if (me.status === 'applied') {
      return `<section class="card"><p class="eyebrow">${esc(event.name)}</p><h3>${esc(me.nick)}님, 신청서를 확인하고 있어요</h3>
        <p class="hint">주최자가 확인하면 이 화면에 예약금 계좌가 떠요. 이 링크를 저장해 두고 나중에 다시 열어주세요.</p></section>`;
    }
    if (me.status === 'pending') {
      const account = model.payment && model.payment.account;
      return `<section class="card"><p class="eyebrow">${esc(event.name)}</p><h3>${esc(me.nick)}님, 승인됐어요. 예약금을 보내주세요</h3>
        <div class="bank">
          <div class="bank-row"><span class="label">예약금</span><span class="bank-amount">${esc(won(event.deposit))}</span></div>
          <div class="bank-row"><span class="copyable">${esc(account || '주최자에게 계좌를 물어봐 주세요')}</span>
            ${account ? `<button type="button" class="btn small" data-action="copy" data-copy="${esc(account)}">계좌 복사</button>` : ''}</div>
          <p class="hint">입금자명은 <b>${esc(me.depositName)}</b>(으)로 해주세요. ${esc(event.refund)}</p>
        </div>
        <p class="hint">주최자가 입금을 확인하면 이 화면에 번호표가 떠요.</p></section>`;
    }
    if (me.status === 'waitlist') {
      return `<section class="card"><p class="eyebrow">${esc(event.name)}</p><h3>대기 ${me.waitPosition}번째예요</h3>
        <p class="hint">자리가 나면 주최자가 연락드려요. 그때 예약금을 보내주시면 돼요.</p></section>`;
    }
    return `<section class="card"><h3>신청이 취소됐어요</h3><p class="hint">궁금한 건 주최자에게 물어봐 주세요.</p></section>`;
  }

  // ctx.signupOnly: 아직 신청 받는 기간이라 테이블 대신 확정 안내만 보여준다.
  function dayHtml(model, ctx) {
    if (model.me.status !== 'confirmed') return statusHtml(model);
    if (ctx.signupOnly) {
      return `${ticketHtml(model)}<section class="card"><h3>참가가 확정됐어요</h3>
        <p class="hint">파티 당일에 이 링크를 다시 열면 앉을 테이블과 같은 테이블 사람들의 대화 카드가 떠요.</p></section>`;
    }
    if (!model.table) {
      return `${ticketHtml(model)}<section class="card"><p>아직 테이블이 정해지지 않았어요. 정해지면 여기에 떠요.</p></section>`;
    }
    return ticketHtml(model) + nowHtml(model, ctx) + matesHtml(model);
  }

  function nowHtml(model, ctx) {
    const { me, phase, route, table } = model;
    const rows = L.timetable(model.event.start);
    const status = phase === 0 ? `<p class="eyebrow">입장 전 · ${rows[1].start}에 1라운드 시작</p>`
      : phase <= L.ROUND_COUNT ? `<p class="eyebrow">${phase}라운드 진행 중</p><p class="timer" data-timer>${esc(ctx.clock)}</p>`
        : '<p class="eyebrow">파티가 끝났어요</p>';
    const label = phase === 0 ? '첫 테이블' : phase <= L.ROUND_COUNT ? '지금 앉을 테이블' : '마지막 테이블';
    const step = (i) => {
      if (phase === 0) return '';
      if (phase > L.ROUND_COUNT) return 'is-done';
      return i + 1 === phase ? 'is-now' : i + 1 < phase ? 'is-done' : '';
    };
    const routeHtml = `<ol class="route" aria-label="내 동선">${route.map((n, i) =>
      `<li class="${step(i)}"><span>${i + 1}라운드</span><b>테이블 ${n}</b></li>`).join('')}</ol>`;
    let next = '';
    if (phase === 0) next = `${rows[1].start}에 ${toTable(route[0])} 가서 앉아주세요.`;
    else if (phase < L.ROUND_COUNT) {
      next = me.gender === 'M'
        ? `${phase + 1}라운드엔 ${toTable(route[phase])} 옮겨요.`
        : `${phase + 1}라운드에도 이 자리 그대로예요. 남자 두 분이 새로 와요.`;
    } else if (phase === L.ROUND_COUNT) next = '마지막 라운드예요. 끝나면 다시 보고 싶은 사람을 고르는 화면이 열려요.';
    const afterLabel = phase >= L.PHASE_RESULTS ? '결과 보기' : '다시 보고 싶은 사람 고르기';
    const after = phase > L.ROUND_COUNT
      ? `<button type="button" class="btn primary block" data-action="goto" data-view="after">${afterLabel}</button>` : '';
    return `<section class="card">
      <div class="now"><div class="phase">${status}<p class="label">${label}</p></div>
        <div class="where"><small>테이블</small>${digits(table.number, ctx.animate)}</div></div>
      ${routeHtml}${next ? `<p class="hint">${esc(next)}</p>` : ''}${after}</section>`;
  }

  function matesHtml(model) {
    return `<section class="mates" aria-labelledby="h-mates"><h3 id="h-mates">같은 테이블</h3>
      ${model.table.mates.map(mateCard).join('')}</section>`;
  }

  function mateCard(p) {
    const rows = [['자신 있는 것', p.strength], ['여행지', p.travel], ['음식 취향', p.diet], ['최근 연애', p.lastLove]]
      .filter((r) => r[1]);
    const tags = p.hobbies.length
      ? `<ul class="tags" aria-label="취미">${p.hobbies.map((h) => `<li class="${p.shared.includes(h) ? 'shared' : ''}">${esc(h)}</li>`).join('')}</ul>` : '';
    return `<article class="mate">
      <header><span class="badge-num ${gcls(p)}">${p.number}</span>
        <div><h4>${esc(p.nick)}</h4><p class="sub">${esc(p.mbti || 'MBTI 안 적음')}${p.sameSex ? ' · 오늘 내내 같이 앉아요' : ''}</p></div>
        ${p.recommended ? '<span class="pill accent">오늘의 추천 짝</span>' : ''}</header>
      <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${tags}${!p.sameSex && p.shared.length ? `<p class="common">겹치는 취미: ${esc(p.shared.join(', '))}</p>` : ''}
    </article>`;
  }

  function pickNote(model, live) {
    if (!live) {
      return model.phase < L.PHASE_PICKS ? '실제로는 파티가 끝나야 열리고, 주최자가 결과를 공개해야 서로 고른 분이 떠요. 시안이라 바로 보여드려요.' : '';
    }
    if (model.phase < L.PHASE_PICKS) return '파티가 끝나면 고를 수 있어요. 지금은 미리 보기만 돼요.';
    if (model.phase === L.PHASE_PICKS) return '주최자가 결과를 공개하기 전까지는 몇 번이든 고칠 수 있어요.';
    return '결과가 공개됐어요. 이제는 고칠 수 없어요.';
  }

  // ctx: { draft: 지금 고른 id 목록, celebrate: 방금 보냈는지, live: 실제 운영인지 }
  function afterHtml(model, ctx) {
    if (model.me.status !== 'confirmed') return statusHtml(model);
    const { options, submitted, revealed } = model.picks;
    const locked = ctx.live && model.phase !== L.PHASE_PICKS;
    const noteText = pickNote(model, ctx.live);
    const note = noteText ? `<p class="hint">${esc(noteText)}</p>` : '';
    const intro = `<section class="card"><h3>다시 얘기해보고 싶은 사람</h3>
      <p>${L.MAX_PICKS}명까지 골라주세요. 상대도 나를 골랐을 때만 서로의 인스타가 열려요. 한쪽만 고른 건 상대에게 알려지지 않아요.</p>${note}</section>`;
    const button = (p) => pickButton(p, ctx.draft.includes(p.id), locked);
    const group = (title, hint, list) => (list.length ? `<div class="pick-group"><h4>${esc(title)}</h4>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<div class="picks">${list.map(button).join('')}</div></div>` : '');
    const unmet = options.filter((p) => !p.met);
    const seen = options.filter((p) => p.met);
    const groups = model.route
      ? group(`오늘 못 만난 분 ${unmet.length}명`, `3라운드라 이성 ${L.SEATS_PER_GENDER}명 중 ${unmet.length}명과는 같은 테이블에 앉지 못했어요.`, unmet)
        + group(`같은 테이블이었던 분 ${seen.length}명`, '', seen)
      : group('참가자', '', options);
    return intro + (submitted || revealed ? resultHtml(model, ctx) : '') + `
      <section class="card t-input-wrap">
        <div class="t-input pick-area">${groups}</div>
        <p class="err t-error-msg"></p>
        <div class="after-foot"><span id="pick-count" class="num">${ctx.draft.length} / ${L.MAX_PICKS}명 골랐어요</span>
          <button type="button" class="btn primary" data-action="submit-picks"${locked ? ' disabled' : ''}>${submitted ? '선택 고치기' : '선택 보내기'}</button></div>
      </section>`;
  }

  function pickButton(p, on, locked) {
    const when = p.met ? `${p.met.round}라운드 테이블 ${p.met.table}` : '같은 테이블이 아니었어요';
    const sub = [p.mbti, p.strength, when].filter(Boolean).join(' · ');
    return `<button type="button" class="pick t-check" role="checkbox" aria-checked="${on}" data-action="pick" data-id="${esc(p.id)}"${locked ? ' disabled' : ''}>
      <span class="tick">${ICONS.check}</span><span class="badge-num ${gcls(p)}">${p.number}</span>
      <span class="nm">${esc(p.nick)}</span><span class="sub">${esc(sub)}</span></button>`;
  }

  function resultHtml(model, ctx) {
    const { mutual, revealed, submitted } = model.picks;
    if (!revealed) {
      return `<section class="card result" aria-live="polite"><h3>선택을 보냈어요</h3>
        <p class="hint">주최자가 결과를 공개하면 서로 고른 분이 여기에 떠요. 한쪽만 고른 건 누구에게도 보이지 않아요.</p></section>`;
    }
    if (!submitted) {
      return '<section class="card result"><h3>고른 분이 없어서 결과가 없어요</h3></section>';
    }
    const check = mutual.length
      ? `<span class="t-success-check check-icon" data-state="${ctx.celebrate ? 'in' : 'done'}" aria-hidden="true">${ICONS.bigCheck}</span>` : '';
    const rows = mutual.map((p) => `<div class="match"><span><span class="badge-num ${gcls(p)}">${p.number}</span> ${esc(p.nick)}</span>
      <span class="insta">@${esc(p.insta)}</span>
      <button type="button" class="btn small" data-action="copy" data-copy="@${esc(p.insta)}">복사</button></div>`).join('');
    return `<section class="card result" aria-live="polite">
      <div class="result-head">${check}<div>
        <h3>${mutual.length ? `서로 고른 분이 ${mutual.length}명 있어요` : '아직 서로 고른 분이 없어요'}</h3>
        <p class="hint">${mutual.length ? '인스타로 먼저 인사해 보세요.' : '상대가 나를 고르면 여기에 떠요.'}</p></div></div>
      ${rows}</section>`;
  }

  root.MeetGuest = { dayHtml, afterHtml, tableKey };
}(window));
