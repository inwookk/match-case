/* 신청서 — 선택지 채우기와 입력값 읽기·검사. 앱 상태는 모른다. */
(function (root) {
  'use strict';

  const L = root.MeetLogic;
  const { $, $$, esc } = root.MeetKit;

  const YEAR_MIN = 1984;
  const YEAR_MAX = 2004;
  const CHECK_SVG = '<svg viewBox="0 0 10.1668 10.1668" aria-hidden="true"><path d="M1 5.52L3.92 9.17L9.17 1"/></svg>';
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
    return `<button type="button" class="chip t-check" role="checkbox" aria-checked="false" data-value="${esc(o.id)}"><span class="tick">${CHECK_SVG}</span>${esc(o.label)}</button>`;
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

  function readForm() {
    const v = {
      name: val('f-name'), birthYear: Number(val('f-year')), gender: segValue('f-gender'), phone: val('f-phone'),
      insta: val('f-insta').replace(/^@/, ''), yearFrom: Number(val('f-yfrom')), yearTo: Number(val('f-yto')),
      intent: segValue('f-intent'), smoke: segValue('f-smoke'), drink: segValue('f-drink'),
      religion: val('f-religion'), religionMatters: isChecked('f-relmatters'),
      politics: segValue('f-politics') || '', politicsMatters: isChecked('f-polmatters'),
      area: val('f-area'), station: val('f-station'), job: val('f-job'),
      dealbreakers: chipValues('f-deal'), dealNote: val('f-dealnote'),
      nice: chipValues('f-nice'), niceNote: val('f-nicenote'),
      avoid: val('f-avoid').split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      mbti: val('f-mbti').toUpperCase(), strength: val('f-strength'), travel: val('f-travel'),
      hobbies: chipValues('f-hobbies'), diet: val('f-diet'), lastLove: val('f-love'), lastLovePublic: isChecked('f-lovepublic'),
      depositName: val('f-depositor') || val('f-name'), consent: isChecked('f-consent'),
    };
    const errors = [];
    const need = (ok, id, msg) => { if (!ok) errors.push({ id, msg }); };
    need(v.name.length >= 2, 'f-name', '이름을 적어주세요');
    need(v.birthYear > 0, 'f-year', '출생연도를 골라주세요');
    need(v.gender, 'f-gender', '성별을 골라주세요');
    need(/^01[016789]-?\d{3,4}-?\d{4}$/.test(v.phone), 'f-phone', '010-1234-5678처럼 적어주세요');
    need(/^[A-Za-z0-9._]{1,30}$/.test(v.insta), 'f-insta', '영문, 숫자, 점(.), 밑줄(_)만 쓸 수 있어요');
    need(v.yearFrom > 0 && v.yearTo > 0 && v.yearFrom <= v.yearTo, 'f-yfrom',
      v.yearFrom > v.yearTo ? '앞쪽에 더 이른 해를 골라주세요' : '만나고 싶은 나이대를 골라주세요');
    need(v.intent, 'f-intent', '만남 목적을 골라주세요');
    need(v.smoke, 'f-smoke', '흡연 여부를 골라주세요');
    need(v.drink, 'f-drink', '음주 여부를 골라주세요');
    need(v.religion, 'f-religion', '종교를 골라주세요. 없음도 있어요');
    need(v.area, 'f-area', '사는 곳을 골라주세요');
    need(!v.mbti || /^[EI][NS][TF][JP]$/.test(v.mbti), 'f-mbti', 'ENFJ처럼 네 글자로 적어주세요');
    need(v.strength, 'f-strength', '하나만 적어주세요. 대화 카드에 떠요');
    need(v.depositName, 'f-depositor', '입금자명을 적어주세요');
    need(v.consent, 'f-consent', '동의해야 신청할 수 있어요');
    return { values: v, errors };
  }

  root.MeetForm = { CHECK_SVG, initApplyForm, readForm };
}(window));
