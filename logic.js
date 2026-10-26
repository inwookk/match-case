/* 8:8 미팅 파티 — 매칭·로테이션·연결 규칙. 화면과 무관한 순수 함수만 둔다. */
(function (root) {
  'use strict';

  const SEATS_PER_GENDER = 8;
  const TABLE_COUNT = 4;
  const ROUND_COUNT = 3;
  // 진행 단계: 0 입장 전, 1~3 라운드, 4 선택 받는 중, 5 결과 공개(더 못 고침)
  const PHASE_PICKS = ROUND_COUNT + 1;
  const PHASE_RESULTS = ROUND_COUNT + 2;
  const ROUND_MINUTES = 60;
  const MOVE_MINUTES = 5;
  const ARRIVE_MINUTES = 20;
  const MAX_PICKS = 3;
  const MAX_DEALBREAKERS = 2;
  const MAX_NICE = 3;
  const MAX_HOBBIES = 5;
  const BLOCK_PENALTY = -50;
  const AVOID_PENALTY = -1000;
  const ROUND_WEIGHTS = [3, 1, 1];
  const NUMBER_START = { F: 1, M: 9 };
  const DEFAULT_START = '19:00';

  const AREAS = [
    { id: 'seoul-se', label: '서울 동남권 (강남·서초·송파)', near: ['seoul-c', 'seoul-ne', 'seoul-sw', 'gg-s'] },
    { id: 'seoul-sw', label: '서울 서남권 (영등포·구로·관악)', near: ['seoul-c', 'seoul-nw', 'seoul-se', 'incheon', 'gg-s'] },
    { id: 'seoul-c', label: '서울 도심권 (종로·중구·용산)', near: ['seoul-se', 'seoul-sw', 'seoul-ne', 'seoul-nw'] },
    { id: 'seoul-ne', label: '서울 동북권 (성동·광진·노원)', near: ['seoul-c', 'seoul-se', 'gg-n'] },
    { id: 'seoul-nw', label: '서울 서북권 (마포·서대문·은평)', near: ['seoul-c', 'seoul-sw', 'gg-n'] },
    { id: 'gg-s', label: '경기 남부 (성남·수원·용인)', near: ['seoul-se', 'seoul-sw'] },
    { id: 'gg-n', label: '경기 북부 (고양·의정부·남양주)', near: ['seoul-ne', 'seoul-nw'] },
    { id: 'incheon', label: '인천·부천', near: ['seoul-sw'] },
  ];

  const GENDERS = [
    { id: 'F', label: '여자', short: '여' },
    { id: 'M', label: '남자', short: '남' },
  ];
  const INTENTS = [
    { id: 'casual', label: '가볍게 알아가기', short: '가볍게', level: 0 },
    { id: 'serious', label: '진지한 연애', short: '진지하게', level: 1 },
    { id: 'marriage', label: '결혼 생각 있음', short: '결혼 생각', level: 2 },
  ];
  const SMOKE = [
    { id: 'no', label: '안 피워요' },
    { id: 'sometimes', label: '가끔' },
    { id: 'yes', label: '피워요' },
  ];
  const DRINK = [
    { id: 'none', label: '안 마셔요', level: 0 },
    { id: 'sometimes', label: '가끔', level: 1 },
    { id: 'often', label: '자주', level: 2 },
  ];
  const RELIGIONS = [
    { id: 'none', label: '없음' },
    { id: 'protestant', label: '기독교' },
    { id: 'catholic', label: '천주교' },
    { id: 'buddhist', label: '불교' },
    { id: 'other', label: '기타' },
  ];
  const POLITICS = [
    { id: '', label: '말 안 할래요' },
    { id: 'progressive', label: '진보' },
    { id: 'moderate', label: '중도' },
    { id: 'conservative', label: '보수' },
  ];
  const HOBBIES = ['여행', '운동', '러닝', '등산', '클라이밍', '요리', '맛집', '카페', '독서', '영화', '전시', '음악', '게임', '사진', '와인', '반려동물'];

  const byId = (list, id) => list.find((x) => x.id === id);
  const labelOf = (list, id) => (byId(list, id) || { label: '' }).label;
  const overlap = (a, b) => (a || []).filter((x) => (b || []).includes(x));
  const yy = (year) => String(year).slice(2);
  const tag = (p) => `${p.number}번 ${p.nick}`;

  function areaDistance(a, b) {
    if (!a || !b) return 2;
    if (a === b) return 0;
    const near = (x, y) => ((byId(AREAS, x) || { near: [] }).near).includes(y);
    return near(a, b) || near(b, a) ? 1 : 2;
  }

  const DEALBREAKERS = [
    { id: 'smoker', label: '흡연자', hit: (self, o) => o.smoke !== 'no' },
    { id: 'heavy-drinker', label: '술을 자주 마시는 사람', hit: (self, o) => o.drink === 'often' },
    { id: 'non-drinker', label: '술을 전혀 안 마시는 사람', hit: (self, o) => o.drink === 'none' },
    { id: 'diff-religion', label: '종교가 다른 사람', hit: (self, o) => self.religion !== o.religion },
    { id: 'no-marriage', label: '결혼 생각이 없는 사람', hit: (self, o) => o.intent === 'casual' },
    { id: 'far', label: '너무 먼 곳에 사는 사람', hit: (self, o) => areaDistance(self.area, o.area) >= 2 },
    { id: 'diff-politics', label: '정치 성향이 다른 사람', hit: (self, o) => Boolean(self.politics && o.politics && self.politics !== o.politics) },
  ];

  const NICE = [
    { id: 'active', label: '운동을 즐기는 사람', hit: (self, o) => overlap(o.hobbies, ['운동', '러닝', '등산', '클라이밍']).length > 0 },
    { id: 'traveler', label: '여행을 좋아하는 사람', hit: (self, o) => (o.hobbies || []).includes('여행') },
    { id: 'cook', label: '요리하는 사람', hit: (self, o) => (o.hobbies || []).includes('요리') },
    { id: 'drinks', label: '술 한잔 같이 할 사람', hit: (self, o) => o.drink !== 'none' },
    { id: 'nonsmoker', label: '비흡연자', hit: (self, o) => o.smoke === 'no' },
    { id: 'near', label: '가까이 사는 사람', hit: (self, o) => areaDistance(self.area, o.area) <= 1 },
    { id: 'marriage', label: '결혼 생각이 있는 사람', hit: (self, o) => o.intent === 'marriage' },
    { id: 'pets', label: '반려동물을 좋아하는 사람', hit: (self, o) => (o.hobbies || []).includes('반려동물') },
    { id: 'culture', label: '책·영화·전시를 좋아하는 사람', hit: (self, o) => overlap(o.hobbies, ['독서', '영화', '전시']).length > 0 },
  ];

  function avoids(self, other) {
    return (self.avoid || []).some((name) => name && (name === other.name || name === other.nick));
  }

  function blocksFor(self, other) {
    const out = [];
    if (other.birthYear < self.yearFrom || other.birthYear > self.yearTo) {
      out.push(`${tag(self)}님이 원하는 나이대(${yy(self.yearFrom)}~${yy(self.yearTo)}년생)가 아니에요`);
    }
    DEALBREAKERS.forEach((d) => {
      if ((self.dealbreakers || []).includes(d.id) && d.hit(self, other)) {
        out.push(`${tag(self)}님의 '절대 안 됨: ${d.label}'에 걸려요`);
      }
    });
    return out;
  }

  // 피하고 싶은 사람은 어떤 라운드에서도 같은 테이블에 앉히지 않는다.
  function avoidBlocks(a, b) {
    return [[a, b], [b, a]].flatMap(([self, other]) =>
      (avoids(self, other) ? [`${tag(self)}님이 ${tag(other)}님을 피하고 싶다고 적었어요`] : []));
  }

  function pairInsight(a, b) {
    const soft = [...blocksFor(a, b), ...blocksFor(b, a)];
    const hard = avoidBlocks(a, b);
    const blocks = [...hard, ...soft];
    const reasons = [];
    let score = soft.length * BLOCK_PENALTY + hard.length * AVOID_PENALTY;

    const level = (list, id) => (byId(list, id) || { level: 0 }).level;
    const gap = Math.abs(level(INTENTS, a.intent) - level(INTENTS, b.intent));
    if (gap === 0) { score += 3; reasons.push(`만남 목적이 같아요 (${labelOf(INTENTS, a.intent)})`); }
    else if (gap === 1) { score += 1; }
    else { score -= 2; reasons.push('만남 목적 차이가 커요'); }

    [[a, b], [b, a]].forEach(([self, other]) => {
      const hits = NICE.filter((n) => (self.nice || []).includes(n.id) && n.hit(self, other));
      if (hits.length) {
        score += 2 * hits.length;
        reasons.push(`${self.nick}님이 바라는 것 ${hits.length}개와 맞아요`);
      }
    });

    const shared = overlap(a.hobbies, b.hobbies);
    if (shared.length) { score += 1.5 * shared.length; reasons.push(`겹치는 취미: ${shared.join(', ')}`); }

    const dist = areaDistance(a.area, b.area);
    if (dist === 0) { score += 2; reasons.push('같은 동네권에 살아요'); }
    else if (dist === 1) { score += 1; reasons.push('가까운 동네에 살아요'); }

    if (a.religionMatters || b.religionMatters) {
      if (a.religion === b.religion) { score += 2; reasons.push(`종교가 같아요 (${labelOf(RELIGIONS, a.religion)})`); }
      else { score -= 2; reasons.push('종교를 중요하게 보는데 서로 달라요'); }
    }

    if ((a.politicsMatters || b.politicsMatters) && a.politics && b.politics) {
      if (a.politics === b.politics) { score += 1.5; reasons.push('정치 성향이 비슷해요'); }
      else { score -= 1.5; }
    }

    if (level(DRINK, a.drink) === level(DRINK, b.drink)) score += 1;

    return { score, blocks, reasons, shared };
  }

  function sameSexScore(a, b) {
    return avoidBlocks(a, b).length * AVOID_PENALTY;
  }

  function pairings(items) {
    if (items.length === 0) return [[]];
    const [first, ...rest] = items;
    return rest.flatMap((partner, idx) => {
      const remaining = rest.filter((_, j) => j !== idx);
      return pairings(remaining).map((sub) => [[first, partner], ...sub]);
    });
  }

  function permutations(items) {
    if (items.length <= 1) return [items];
    return items.flatMap((x, i) => permutations(items.filter((_, j) => j !== i)).map((p) => [x, ...p]));
  }

  const confirmedOf = (people, gender) =>
    people.filter((p) => p.status === 'confirmed' && (!gender || p.gender === gender));

  // 여자 2명은 테이블에 앉아 있고 남자 2명이 한 조로 라운드마다 옆 테이블로 옮긴다.
  // 1라운드 배치가 정해지면 2·3라운드는 자동으로 결정되므로, 1라운드를 고를 때
  // 1라운드 궁합(가중치 3)과 2·3라운드 궁합(가중치 1)을 함께 본다.
  function planRounds(people) {
    const women = confirmedOf(people, 'F');
    const men = confirmedOf(people, 'M');
    if (women.length !== SEATS_PER_GENDER || men.length !== SEATS_PER_GENDER) {
      return { ok: false, women: women.length, men: men.length };
    }
    const cross = women.map((w) => men.map((m) => pairInsight(w, m).score));
    const sameW = women.map((a) => women.map((b) => sameSexScore(a, b)));
    const sameM = men.map((a) => men.map((b) => sameSexScore(a, b)));
    const idx = [...Array(SEATS_PER_GENDER).keys()];
    const pairsW = pairings(idx);
    const pairsM = pairings(idx);
    const perms = permutations([...Array(TABLE_COUNT).keys()]);
    const weightSum = ROUND_WEIGHTS.reduce((s, w) => s + w, 0);
    const penalty = (pp, same) => pp.reduce((s, [x, y]) => s + same[x][y], 0);
    const penW = pairsW.map((pp) => penalty(pp, sameW));
    const penM = pairsM.map((pp) => penalty(pp, sameM));

    let best = { value: -Infinity };
    pairsW.forEach((wp, wi) => {
      pairsM.forEach((mp, mi) => {
        const P = mp.map(([m1, m2]) => wp.map(([w1, w2]) =>
          cross[w1][m1] + cross[w1][m2] + cross[w2][m1] + cross[w2][m2]));
        const base = (penW[wi] + penM[mi]) * weightSum;
        perms.forEach((perm) => {
          let value = base;
          for (let i = 0; i < TABLE_COUNT; i += 1) {
            for (let r = 0; r < ROUND_COUNT; r += 1) {
              value += ROUND_WEIGHTS[r] * P[i][(perm[i] + r) % TABLE_COUNT];
            }
          }
          if (value > best.value) best = { value, wp, mp, perm };
        });
      });
    });

    const round1 = best.wp.map(([w1, w2], t) => {
      const [m1, m2] = best.mp[best.perm.indexOf(t)];
      return { women: [women[w1].id, women[w2].id], men: [men[m1].id, men[m2].id] };
    });
    return { ok: true, round1 };
  }

  function deriveRounds(round1) {
    return Array.from({ length: ROUND_COUNT }, (_, r) => round1.map((table, t) => ({
      women: table.women,
      men: round1[(t - r + TABLE_COUNT) % TABLE_COUNT].men,
    })));
  }

  const seatsOf = (table) => [...table.women, ...table.men];
  const tableIndex = (tables, id) => tables.findIndex((t) => seatsOf(t).includes(id));

  function round1Valid(round1, people) {
    if (!round1) return false;
    const ids = round1.flatMap(seatsOf);
    const confirmed = confirmedOf(people).map((p) => p.id);
    return ids.length === SEATS_PER_GENDER * 2
      && confirmed.length === SEATS_PER_GENDER * 2
      && ids.every((id) => confirmed.includes(id));
  }

  function tableInsight(table, find) {
    const [w1, w2] = table.women.map(find);
    const [m1, m2] = table.men.map(find);
    const ins = new Map([[w1, m1], [w1, m2], [w2, m1], [w2, m2]].map(([w, m]) => [`${w.id}|${m.id}`, pairInsight(w, m)]));
    const get = (w, m) => ins.get(`${w.id}|${m.id}`);
    const optA = [[w1, m1], [w2, m2]];
    const optB = [[w1, m2], [w2, m1]];
    const sum = (opt) => opt.reduce((s, [w, m]) => s + get(w, m).score, 0);
    const pick = sum(optA) >= sum(optB) ? optA : optB;
    const pairs = pick.map(([w, m]) => ({ woman: w.id, man: m.id, ...get(w, m) }));
    const all = [...ins.values()];
    const blocks = [...new Set([
      ...all.flatMap((x) => x.blocks),
      ...avoidBlocks(w1, w2),
      ...avoidBlocks(m1, m2),
    ])];
    return { score: all.reduce((s, x) => s + x.score, 0), blocks, pairs };
  }

  function swapSeats(round1, a, b) {
    const swap = (id) => (id === a ? b : id === b ? a : id);
    return round1.map((t) => ({ women: t.women.map(swap), men: t.men.map(swap) }));
  }

  function metIn(rounds, id) {
    const met = new Map();
    rounds.forEach((tables, r) => {
      const t = tableIndex(tables, id);
      if (t < 0) return;
      seatsOf(tables[t]).filter((x) => x !== id).forEach((x) => met.set(x, { round: r + 1, table: t + 1 }));
    });
    return met;
  }

  function mutualMatches(picks) {
    return Object.entries(picks).flatMap(([a, list]) =>
      list.filter((b) => a < b && (picks[b] || []).includes(a)).map((b) => [a, b]));
  }

  function oneSided(picks) {
    return Object.entries(picks).flatMap(([a, list]) =>
      list.filter((b) => !(picks[b] || []).includes(a)).map((b) => [a, b]));
  }

  function seatsTaken(people, gender) {
    return people.filter((p) => p.gender === gender && (p.status === 'pending' || p.status === 'confirmed')).length;
  }

  function nextNumber(people, gender) {
    const used = confirmedOf(people, gender).map((p) => p.number);
    const start = NUMBER_START[gender];
    for (let n = start; n < start + SEATS_PER_GENDER; n += 1) {
      if (!used.includes(n)) return n;
    }
    return null;
  }

  function waitlistPosition(people, person) {
    const line = people
      .filter((p) => p.status === 'waitlist' && p.gender === person.gender)
      .sort((x, y) => x.appliedAt - y.appliedAt);
    return line.findIndex((p) => p.id === person.id) + 1;
  }

  /* ---------- 신청서 정리·검사 (화면과 Apps Script가 함께 쓴다) ---------- */
  const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;
  const INSTA_RE = /^[A-Za-z0-9._]{1,30}$/;
  const MBTI_RE = /^[EI][NS][TF][JP]$/;
  const YEAR_RANGE = [1950, 2010];
  const MAX_AVOID = 5;

  const unique = (list) => [...new Set(list)];
  const isId = (list, id) => list.some((x) => x.id === id);

  function formatPhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return String(raw || '').trim().slice(0, 13);
  }

  function normalizeApplication(raw) {
    const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const list = (v) => unique((Array.isArray(v) ? v : []).map((x) => String(x)));
    const avoidText = Array.isArray(raw.avoid) ? raw.avoid.join(',') : s(raw.avoid, 60);
    return {
      name: s(raw.name, 20), birthYear: Number(raw.birthYear) || 0, gender: s(raw.gender, 1), phone: formatPhone(raw.phone),
      insta: s(raw.insta, 31).replace(/^@/, ''), yearFrom: Number(raw.yearFrom) || 0, yearTo: Number(raw.yearTo) || 0,
      intent: s(raw.intent, 20), smoke: s(raw.smoke, 20), drink: s(raw.drink, 20),
      religion: s(raw.religion, 20), religionMatters: raw.religionMatters === true,
      politics: s(raw.politics, 20), politicsMatters: raw.politicsMatters === true,
      area: s(raw.area, 20), station: s(raw.station, 20), job: s(raw.job, 30),
      dealbreakers: list(raw.dealbreakers), dealNote: s(raw.dealNote, 60),
      nice: list(raw.nice), niceNote: s(raw.niceNote, 60),
      avoid: avoidText.split(/[,，、]/).map((x) => x.trim().slice(0, 20)).filter(Boolean).slice(0, MAX_AVOID),
      mbti: s(raw.mbti, 4).toUpperCase(), strength: s(raw.strength, 30), travel: s(raw.travel, 40),
      hobbies: list(raw.hobbies), diet: s(raw.diet, 40),
      lastLove: s(raw.lastLove, 80), lastLovePublic: raw.lastLovePublic === true,
      depositName: s(raw.depositName, 20) || s(raw.name, 20), consent: raw.consent === true,
    };
  }

  // 오류는 { key, msg } 목록으로 돌려준다. key는 입력 항목 이름이다.
  function validateApplication(v) {
    const errors = [];
    const need = (ok, key, msg) => { if (!ok) errors.push({ key, msg }); };
    const yearOk = (y) => Number.isInteger(y) && y >= YEAR_RANGE[0] && y <= YEAR_RANGE[1];
    const allIn = (ids, list) => ids.every((id) => isId(list, id));
    need(v.name.length >= 2, 'name', '이름을 적어주세요');
    need(yearOk(v.birthYear), 'birthYear', '출생연도를 골라주세요');
    need(isId(GENDERS, v.gender), 'gender', '성별을 골라주세요');
    need(PHONE_RE.test(v.phone), 'phone', '010-1234-5678처럼 적어주세요');
    need(INSTA_RE.test(v.insta), 'insta', '영문, 숫자, 점(.), 밑줄(_)만 쓸 수 있어요');
    need(yearOk(v.yearFrom) && yearOk(v.yearTo) && v.yearFrom <= v.yearTo, 'yearRange',
      v.yearFrom > v.yearTo ? '앞쪽에 더 이른 해를 골라주세요' : '만나고 싶은 나이대를 골라주세요');
    need(isId(INTENTS, v.intent), 'intent', '만남 목적을 골라주세요');
    need(isId(SMOKE, v.smoke), 'smoke', '흡연 여부를 골라주세요');
    need(isId(DRINK, v.drink), 'drink', '음주 여부를 골라주세요');
    need(isId(RELIGIONS, v.religion), 'religion', '종교를 골라주세요. 없음도 있어요');
    need(isId(POLITICS, v.politics), 'politics', '정치 성향을 다시 골라주세요');
    need(isId(AREAS, v.area), 'area', '사는 곳을 골라주세요');
    need(v.dealbreakers.length <= MAX_DEALBREAKERS && allIn(v.dealbreakers, DEALBREAKERS), 'dealbreakers', `${MAX_DEALBREAKERS}개까지 고를 수 있어요`);
    need(v.nice.length <= MAX_NICE && allIn(v.nice, NICE), 'nice', `${MAX_NICE}개까지 고를 수 있어요`);
    need(v.hobbies.length <= MAX_HOBBIES && v.hobbies.every((h) => HOBBIES.includes(h)), 'hobbies', `${MAX_HOBBIES}개까지 고를 수 있어요`);
    need(!v.mbti || MBTI_RE.test(v.mbti), 'mbti', 'ENFJ처럼 네 글자로 적어주세요');
    need(v.strength, 'strength', '하나만 적어주세요. 대화 카드에 떠요');
    need(v.depositName, 'depositName', '입금자명을 적어주세요');
    need(v.consent, 'consent', '동의해야 신청할 수 있어요');
    return errors;
  }

  /* ---------- 손님 화면 데이터: 공개해도 되는 것만 담는다 ---------- */
  function publicEvent(s) {
    return {
      name: s.name || '', date: s.date || '', start: s.start || '', place: s.place || '',
      deposit: Number(s.deposit) || 0, account: s.account || '', refund: s.refund || '',
    };
  }

  function publicCard(p) {
    const card = {
      id: p.id, number: p.number, nick: p.nick, gender: p.gender,
      mbti: p.mbti || '', strength: p.strength || '', travel: p.travel || '', diet: p.diet || '',
      hobbies: [...(p.hobbies || [])],
    };
    return p.lastLovePublic && p.lastLove ? { ...card, lastLove: p.lastLove } : card;
  }

  function currentRoundIndex(phase) {
    return phase === 0 ? 0 : Math.min(phase, ROUND_COUNT) - 1;
  }

  function guestTable(rounds, people, me, phase) {
    const find = (id) => people.find((p) => p.id === id);
    const route = rounds.map((tables) => tableIndex(tables, me.id) + 1);
    const rIdx = currentRoundIndex(phase);
    const table = rounds[rIdx][route[rIdx] - 1];
    // 추천 짝은 설문으로 정한 1라운드에만, 테이블의 두 짝이 모두 조건에 안 걸릴 때만 보여준다.
    // 한쪽만 빠지면 그 사람의 비공개 조건을 짐작할 수 있어서다.
    const ins = tableInsight(table, find);
    const clean = rIdx === 0 && ins.pairs.every((p) => p.blocks.length === 0);
    const mine = clean ? ins.pairs.find((p) => p.woman === me.id || p.man === me.id) : null;
    const partner = mine ? (mine.woman === me.id ? mine.man : mine.woman) : null;
    const mates = seatsOf(table).filter((id) => id !== me.id).map(find)
      .sort((a, b) => Number(a.gender === me.gender) - Number(b.gender === me.gender))
      .map((p) => ({
        ...publicCard(p),
        shared: overlap(p.hobbies, me.hobbies),
        recommended: p.id === partner,
        sameSex: p.gender === me.gender,
      }));
    return { route, table: { index: rIdx, number: route[rIdx], mates } };
  }

  // 서로 고른 결과는 주최자가 결과를 공개한 뒤(PHASE_RESULTS)에만 담는다.
  // 고르는 동안 결과를 보여주면 여러 번 바꿔 내면서 누가 나를 골랐는지 알아낼 수 있어서다.
  // 시안은 바로 보여주도록 options.reveal을 넘긴다.
  function guestModel(state, meId, options) {
    const { people, round1, phase, phaseStartedAt, picks, settings } = state;
    const reveal = options && typeof options.reveal === 'boolean' ? options.reveal : phase >= PHASE_RESULTS;
    const me = people.find((p) => p.id === meId);
    if (!me) return null;
    const base = {
      me: {
        id: me.id, number: me.number, nick: me.nick, gender: me.gender, status: me.status,
        depositName: me.depositName, waitPosition: me.status === 'waitlist' ? waitlistPosition(people, me) : 0,
      },
      event: publicEvent(settings),
      phase,
      phaseStartedAt: phaseStartedAt || null,
    };
    if (me.status !== 'confirmed') return { ...base, route: null, table: null, picks: null };
    const rounds = round1Valid(round1, people) ? deriveRounds(round1) : null;
    const seat = rounds ? guestTable(rounds, people, me, phase) : { route: null, table: null };
    const opp = confirmedOf(people, me.gender === 'F' ? 'M' : 'F').sort((a, b) => a.number - b.number);
    const met = rounds ? metIn(rounds, me.id) : new Map();
    const mine = (picks[me.id] || []).filter((id) => opp.some((p) => p.id === id));
    const mutual = !reveal ? [] : mine.filter((id) => (picks[id] || []).includes(me.id))
      .map((id) => opp.find((p) => p.id === id))
      .map((p) => ({ id: p.id, number: p.number, nick: p.nick, gender: p.gender, insta: p.insta }));
    return {
      ...base,
      ...seat,
      picks: {
        options: opp.map((p) => ({ ...publicCard(p), met: met.get(p.id) || null })),
        mine,
        submitted: Object.prototype.hasOwnProperty.call(picks, me.id),
        revealed: reveal,
        mutual,
      },
    };
  }

  function validatePicks(people, me, ids) {
    if (!Array.isArray(ids) || ids.length > MAX_PICKS || new Set(ids).size !== ids.length) return `${MAX_PICKS}명까지 고를 수 있어요`;
    const opp = confirmedOf(people, me.gender === 'F' ? 'M' : 'F').map((p) => p.id);
    return ids.every((id) => opp.includes(id)) ? null : '고를 수 없는 사람이 섞여 있어요. 새로 고쳐 주세요';
  }

  function validateRound1(round1, people) {
    if (!Array.isArray(round1) || round1.length !== TABLE_COUNT) return false;
    const genderOf = (id) => (people.find((p) => p.id === id) || {}).gender;
    const shapeOk = round1.every((t) => Array.isArray(t.women) && Array.isArray(t.men)
      && t.women.length === 2 && t.men.length === 2
      && t.women.every((id) => genderOf(id) === 'F') && t.men.every((id) => genderOf(id) === 'M'));
    return shapeOk && round1Valid(round1, people) && new Set(round1.flatMap(seatsOf)).size === SEATS_PER_GENDER * 2;
  }

  function roundClock(startedAt, now) {
    if (!startedAt) return '';
    const left = ROUND_MINUTES * 60 * 1000 - (now - startedAt);
    const abs = Math.abs(left);
    const t = `${String(Math.floor(abs / 60000)).padStart(2, '0')}:${String(Math.floor((abs % 60000) / 1000)).padStart(2, '0')}`;
    return left >= 0 ? `남은 시간 ${t}` : `${t} 지났어요`;
  }

  function parseStart(start) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(start || '').trim());
    const valid = m && Number(m[1]) < 24 && Number(m[2]) < 60;
    const [h, mm] = (valid ? [m[1], m[2]] : DEFAULT_START.split(':')).map(Number);
    return h * 60 + mm;
  }

  function clock(min) {
    const day = 24 * 60;
    const v = ((min % day) + day) % day;
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
  }

  function timetable(start) {
    const base = parseStart(start);
    const rounds = Array.from({ length: ROUND_COUNT }, (_, r) => {
      const s = base + r * (ROUND_MINUTES + MOVE_MINUTES);
      return { phase: r + 1, label: `${r + 1}라운드`, start: clock(s), end: clock(s + ROUND_MINUTES) };
    });
    const close = base + ROUND_COUNT * ROUND_MINUTES + (ROUND_COUNT - 1) * MOVE_MINUTES;
    return [
      { phase: 0, label: '입장 · 번호표 받기', start: clock(base - ARRIVE_MINUTES) },
      ...rounds,
      { phase: ROUND_COUNT + 1, label: '마무리 · 다시 보고 싶은 사람 고르기', start: clock(close) },
    ];
  }

  const api = {
    SEATS_PER_GENDER, TABLE_COUNT, ROUND_COUNT, PHASE_PICKS, PHASE_RESULTS, ROUND_MINUTES, MAX_PICKS, MAX_DEALBREAKERS, MAX_NICE, MAX_HOBBIES,
    AREAS, GENDERS, INTENTS, SMOKE, DRINK, RELIGIONS, POLITICS, HOBBIES, DEALBREAKERS, NICE,
    byId, labelOf, yy, areaDistance, pairInsight, planRounds, deriveRounds, tableIndex, seatsOf,
    round1Valid, tableInsight, swapSeats, metIn, mutualMatches, oneSided, seatsTaken, nextNumber,
    waitlistPosition, timetable, confirmedOf, currentRoundIndex,
    normalizeApplication, validateApplication, publicEvent, publicCard, guestModel, validatePicks, validateRound1,
    roundClock,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeetLogic = api;
}(typeof window !== 'undefined' ? window : globalThis));
