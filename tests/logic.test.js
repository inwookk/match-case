const assert = require('assert');
const path = require('path');

const dir = path.join(__dirname, '..');
const L = require(path.join(dir, 'logic.js'));
const D = require(path.join(dir, 'data.js'));

const people = D.samplePeople();
const find = (id) => people.find((p) => p.id === id);
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

const t0 = Date.now();
const plan = L.planRounds(people);
const planMs = Date.now() - t0;
const rounds = plan.ok ? L.deriveRounds(plan.round1) : [];

test('plan succeeds for 8:8 and runs fast', () => {
  assert.ok(plan.ok);
  assert.ok(planMs < 2000, `took ${planMs}ms`);
});

test('every round seats 2 women + 2 men per table, everyone exactly once', () => {
  const ids = L.confirmedOf(people).map((p) => p.id).sort();
  assert.strictEqual(rounds.length, 3);
  rounds.forEach((tables) => {
    assert.strictEqual(tables.length, 4);
    tables.forEach((t) => {
      assert.deepStrictEqual(t.women.map((id) => find(id).gender), ['F', 'F']);
      assert.deepStrictEqual(t.men.map((id) => find(id).gender), ['M', 'M']);
    });
    assert.deepStrictEqual(tables.flatMap(L.seatsOf).sort(), ids);
  });
});

test('each person meets 6 different opposite-gender people with no repeats', () => {
  L.confirmedOf(people).forEach((p) => {
    const seen = [];
    rounds.forEach((tables) => {
      const t = tables[L.tableIndex(tables, p.id)];
      seen.push(...(p.gender === 'F' ? t.men : t.women));
    });
    assert.strictEqual(seen.length, 6);
    assert.strictEqual(new Set(seen).size, 6, `${p.id} repeats`);
  });
});

test('avoid lists are respected in every round', () => {
  const together = (a, b) => rounds.some((tables) => tables.some((t) => L.seatsOf(t).includes(a) && L.seatsOf(t).includes(b)));
  assert.ok(!together('p3', 'p13'), '하은-준호 seated together');
  assert.ok(!together('p4', 'p6'), '수빈-다은 seated together');
});

test('round 1 has no blocked pairs in recommended pairs', () => {
  rounds[0].forEach((t) => {
    const ins = L.tableInsight(t, find);
    ins.pairs.forEach((pair) => assert.strictEqual(pair.blocks.length, 0, `${pair.woman}-${pair.man}: ${pair.blocks}`));
  });
});

test('dealbreakers fire', () => {
  const ins = L.pairInsight(find('p1'), find('p10'));
  assert.ok(ins.blocks.some((b) => b.includes('흡연자')));
  const rel = L.pairInsight(find('p11'), find('p1'));
  assert.ok(rel.blocks.some((b) => b.includes('종교')));
});

test('swapSeats keeps structure and is immutable', () => {
  const before = JSON.stringify(plan.round1);
  const a = plan.round1[0].men[0];
  const b = plan.round1[1].men[0];
  const next = L.swapSeats(plan.round1, a, b);
  assert.strictEqual(JSON.stringify(plan.round1), before);
  assert.strictEqual(next[0].men[0], b);
  assert.strictEqual(next[1].men[0], a);
});

test('mutual matches and one-sided picks', () => {
  const picks = D.samplePicks();
  const mutual = L.mutualMatches(picks).map((p) => p.slice().sort().join('-')).sort();
  assert.deepStrictEqual(mutual, ['p10-p2', 'p11-p3', 'p12-p4', 'p16-p7']);
  const one = L.oneSided(picks).map((p) => p.join('>'));
  assert.ok(one.includes('p9>p1'));
  assert.ok(!one.includes('p2>p10'));
});

test('numbers and seats', () => {
  assert.strictEqual(L.nextNumber(people, 'F'), null);
  const freed = people.map((p) => (p.id === 'p3' ? { ...p, status: 'cancelled', number: null } : p));
  assert.strictEqual(L.nextNumber(freed, 'F'), 3);
  assert.strictEqual(L.seatsTaken(people, 'F'), 8);
  assert.strictEqual(L.waitlistPosition(people, find('p17')), 1);
  assert.ok(!L.planRounds(freed).ok);
  assert.ok(!L.round1Valid(plan.round1, freed));
  assert.ok(L.round1Valid(plan.round1, people));
});

test('timetable', () => {
  const rows = L.timetable('19:00');
  assert.deepStrictEqual(rows.map((r) => r.start), ['18:40', '19:00', '20:05', '21:10', '22:10']);
  assert.strictEqual(rows[3].end, '22:10');
  assert.strictEqual(L.timetable('bad')[1].start, '19:00');
  assert.strictEqual(L.timetable('23:30')[4].start, '02:40');
});

const validForm = () => ({
  name: ' 김테스트 ', birthYear: '1995', gender: 'M', phone: '01012345678', insta: '@test.kim',
  yearFrom: '1993', yearTo: '1998', intent: 'serious', smoke: 'no', drink: 'sometimes', religion: 'none',
  politics: '', area: 'seoul-c', dealbreakers: ['smoker'], nice: ['traveler'], hobbies: ['여행'],
  avoid: '전애인, 회사 동료', strength: '라면', consent: true,
});

test('normalizeApplication cleans input', () => {
  const v = L.normalizeApplication(validForm());
  assert.strictEqual(v.name, '김테스트');
  assert.strictEqual(v.phone, '010-1234-5678');
  assert.strictEqual(v.insta, 'test.kim');
  assert.strictEqual(v.depositName, '김테스트');
  assert.deepStrictEqual(v.avoid, ['전애인', '회사 동료']);
  assert.strictEqual(v.religionMatters, false);
  assert.deepStrictEqual(L.validateApplication(v), []);
});

test('validateApplication rejects bad or forged values', () => {
  const keys = (form) => L.validateApplication(L.normalizeApplication(form)).map((e) => e.key);
  assert.deepStrictEqual(keys({ ...validForm(), gender: 'X' }), ['gender']);
  assert.deepStrictEqual(keys({ ...validForm(), dealbreakers: ['smoker', 'far', 'non-drinker'] }), ['dealbreakers']);
  assert.deepStrictEqual(keys({ ...validForm(), hobbies: ['=HYPERLINK()'] }), ['hobbies']);
  assert.deepStrictEqual(keys({ ...validForm(), yearFrom: '1999', yearTo: '1993' }), ['yearRange']);
  assert.deepStrictEqual(keys({ ...validForm(), consent: 'true' }), ['consent']);
  assert.ok(keys({}).length > 10);
});

const stateOf = (overrides = {}) => ({
  people, round1: plan.round1, phase: 1, phaseStartedAt: 123, picks: D.samplePicks(), settings: D.sampleSettings(), ...overrides,
});
const PRIVATE_KEYS = ['phone', 'religion', 'politics', 'avoid', 'job', 'dealbreakers', 'nice', 'yearFrom', 'birthYear', 'area', 'station', 'tokenHash', 'depositName'];

test('guestModel shows mates without private fields', () => {
  const m = L.guestModel(stateOf(), 'p1');
  assert.strictEqual(m.me.number, 1);
  assert.strictEqual(m.route.length, 3);
  assert.strictEqual(m.table.mates.length, 3);
  m.table.mates.forEach((mate) => {
    PRIVATE_KEYS.forEach((k) => assert.ok(!(k in mate), `mate leaks ${k}`));
    assert.ok(!('insta' in mate), 'mate leaks insta');
  });
  m.picks.options.forEach((o) => assert.ok(!('insta' in o) && !('phone' in o), 'option leaks'));
  assert.strictEqual(m.picks.options.length, 8);
  assert.strictEqual(m.picks.options.filter((o) => !o.met).length, 2);
});

test('guestModel reveals insta only for mutual picks, and only after results open', () => {
  const picks = { ...D.samplePicks(), p1: ['p9', 'p11'] };
  const open = L.guestModel(stateOf({ picks, phase: L.PHASE_PICKS }), 'p1');
  assert.deepStrictEqual(open.picks.mine, ['p9', 'p11']);
  assert.deepStrictEqual(open.picks.mutual, [], 'mutual must stay hidden while picks are open');
  assert.strictEqual(open.picks.revealed, false);
  const shown = L.guestModel(stateOf({ picks, phase: L.PHASE_RESULTS }), 'p1');
  assert.deepStrictEqual(shown.picks.mutual.map((x) => x.id), ['p9']);
  assert.strictEqual(shown.picks.mutual[0].insta, 'minjun.run');
  const demo = L.guestModel(stateOf({ picks, phase: 0 }), 'p1', { reveal: true });
  assert.deepStrictEqual(demo.picks.mutual.map((x) => x.id), ['p9']);
  const none = L.guestModel(stateOf({ phase: L.PHASE_RESULTS }), 'p1');
  assert.deepStrictEqual(none.picks.mutual, []);
  assert.strictEqual(none.picks.submitted, false);
});

test('recommended partner shows only in round 1', () => {
  const r1 = L.guestModel(stateOf({ phase: 1 }), 'p1');
  assert.strictEqual(r1.table.mates.filter((m) => m.recommended).length, 1);
  [2, 3].forEach((phase) => {
    const later = L.guestModel(stateOf({ phase }), 'p1');
    assert.strictEqual(later.table.mates.filter((m) => m.recommended).length, 0, `phase ${phase}`);
  });
});

test('bad values do not crash scoring or slip through validation', () => {
  const odd = { ...find('p1'), intent: '', drink: 'unknown' };
  assert.ok(Number.isFinite(L.pairInsight(odd, find('p9')).score));
  const keys = L.validateApplication(L.normalizeApplication({ ...validForm(), birthYear: '1990.5' })).map((e) => e.key);
  assert.deepStrictEqual(keys, ['birthYear']);
});

test('guestModel for waitlisted guest has no table or picks', () => {
  const m = L.guestModel(stateOf(), 'p17');
  assert.strictEqual(m.me.status, 'waitlist');
  assert.strictEqual(m.me.waitPosition, 1);
  assert.strictEqual(m.table, null);
  assert.strictEqual(m.picks, null);
  assert.ok(!('host_key' in m.event) && !('invite_code' in m.event));
});

test('validatePicks and validateRound1', () => {
  assert.strictEqual(L.validatePicks(people, find('p1'), ['p9', 'p10']), null);
  assert.ok(L.validatePicks(people, find('p1'), ['p2']));
  assert.ok(L.validatePicks(people, find('p1'), ['p9', 'p10', 'p11', 'p12']));
  assert.ok(L.validatePicks(people, find('p1'), ['p9', 'p9']));
  assert.ok(L.validateRound1(plan.round1, people));
  const broken = plan.round1.map((t, i) => (i === 0 ? { women: t.men, men: t.women } : t));
  assert.ok(!L.validateRound1(broken, people));
  assert.ok(!L.validateRound1('nope', people));
});

console.log(`\n${passed} passed, plan ${planMs}ms`);
rounds.forEach((tables, r) => {
  console.log(`\n[${r + 1}라운드]`);
  tables.forEach((t, i) => {
    const ins = L.tableInsight(t, find);
    const names = L.seatsOf(t).map((id) => `${find(id).number}${find(id).nick}`).join(' ');
    console.log(`T${i + 1} ${names}  score=${ins.score}  blocks=${ins.blocks.length}`);
    if (r === 0) ins.pairs.forEach((p) => console.log(`   ${find(p.woman).nick}-${find(p.man).nick}: ${p.reasons.join(' / ')}`));
  });
});
