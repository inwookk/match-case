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
