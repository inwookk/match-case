/* 신청서 — 선택지 채우기와 입력값 읽기·검사. 앱 상태는 모른다. */
(function (root) {
  'use strict';

  const L = root.MeetLogic;
  const { $, $$, esc, ICONS } = root.MeetKit;

  const YEAR_MIN = 1984;
  const YEAR_MAX = 2004;
  const FIELD_IDS = {
    name: 'f-name', birthYear: 'f-year', gender: 'f-gender', phone: 'f-phone', insta: 'f-insta',
    yearRange: 'f-yfrom', intent: 'f-intent', smoke: 'f-smoke', drink: 'f-drink', religion: 'f-religion',
    politics: 'f-politics', area: 'f-area', dealbreakers: 'f-deal', nice: 'f-nice', hobbies: 'f-hobbies',
    mbti: 'f-mbti', strength: 'f-strength', depositName: 'f-depositor', consent: 'f-consent',
  };
  const SEG_OPTIONS = {
    gender: L.GENDERS,
    intent: L.INTENTS.map((x) => ({ id: x.id, label: x.short, title: x.label })),
    smoke: L.SMOKE,
    drink: L.DRINK,
    politics: L.POLITICS.map((x) => ({ id: x.id, label: x.id ? x.label : '말 안 함' })),
  };

  function optionsHtml(items, placeholder) {
    const first = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
    return first + items.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
  }

  function chipHtml(o) {
    return `<button type="button" class="chip t-check" role="checkbox" aria-checked="false" data-value="${esc(o.id)}"><span class="tick">${ICONS.check}</span>${esc(o.label)}</button>`;
  }

  function initApplyForm() {
    const years = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i);
    $('#f-year').innerHTML = optionsHtml(years.map((y) => ({ id: String(y), label: `${y}년` })), '선택');
    const short = years.map((y) => ({ id: String(y), label: `${L.yy(y)}년생` }));
    $('#f-yfrom').innerHTML = optionsHtml(short, '부터');
    $('#f-yto').innerHTML = optionsHtml(short, '까지');
    $('#f-religion').innerHTML = optionsHtml(L.RELIGIONS, '선택');
    $('#f-area').innerHTML = optionsHtml(L.AREAS, '선택');
    $$('[data-options]').forEach((bar) => {
      const opts = SEG_OPTIONS[bar.dataset.options];
      bar.innerHTML = '<span class="t-tabs-pill" aria-hidden="true"></span>' + opts.map((o) =>
        `<button type="button" class="t-tab" role="radio" aria-checked="false" data-value="${esc(o.id)}"${o.title ? ` title="${esc(o.title)}"` : ''}>${esc(o.label)}</button>`).join('');
    });
    $('#f-deal').innerHTML = L.DEALBREAKERS.map(chipHtml).join('');
    $('#f-nice').innerHTML = L.NICE.map(chipHtml).join('');
    $('#f-hobbies').innerHTML = L.HOBBIES.map((h) => chipHtml({ id: h, label: h })).join('');
  }

  const segValue = (id) => { const t = $(`#${id} .t-tab[aria-checked="true"]`); return t ? t.dataset.value : null; };
  const chipValues = (id) => $$(`#${id} [aria-checked="true"]`).map((b) => b.dataset.value);
  const isChecked = (id) => $(`#${id}`).getAttribute('aria-checked') === 'true';
  const val = (id) => $(`#${id}`).value.trim();

  // 서버도 같은 정리·검사(logic.js)를 한 번 더 한다. 여기서는 바로 보여주기 위해 먼저 돌린다.
  function readForm() {
    const raw = {
      name: val('f-name'), birthYear: val('f-year'), gender: segValue('f-gender') || '', phone: val('f-phone'),
      insta: val('f-insta'), yearFrom: val('f-yfrom'), yearTo: val('f-yto'),
      intent: segValue('f-intent') || '', smoke: segValue('f-smoke') || '', drink: segValue('f-drink') || '',
      religion: val('f-religion'), religionMatters: isChecked('f-relmatters'),
      politics: segValue('f-politics') || '', politicsMatters: isChecked('f-polmatters'),
      area: val('f-area'), station: val('f-station'), job: val('f-job'),
      dealbreakers: chipValues('f-deal'), dealNote: val('f-dealnote'),
      nice: chipValues('f-nice'), niceNote: val('f-nicenote'), avoid: val('f-avoid'),
      mbti: val('f-mbti'), strength: val('f-strength'), travel: val('f-travel'),
      hobbies: chipValues('f-hobbies'), diet: val('f-diet'), lastLove: val('f-love'), lastLovePublic: isChecked('f-lovepublic'),
      depositName: val('f-depositor'), consent: isChecked('f-consent'),
    };
    const values = L.normalizeApplication(raw);
    const errors = L.validateApplication(values).map((e) => ({ id: FIELD_IDS[e.key], msg: e.msg }));
    return { raw, values, errors };
  }

  root.MeetForm = { initApplyForm, readForm };
}(window));
