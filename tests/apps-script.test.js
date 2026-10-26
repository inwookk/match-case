const assert = require('assert');
const path = require('path');
const { createGas } = require('./gas-fake');

const L = require(path.join(__dirname, '..', 'logic.js'));
const D = require(path.join(__dirname, '..', 'data.js'));

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

const gas = createGas();
gas.setup();
const keys = gas.settings();
const code = keys.invite_code;
const hostKey = keys.host_key;
const ok = (res) => { assert.ok(res.ok, `expected ok, got: ${res.error}`); return res.data; };
const fail = (res, part) => { assert.ok(!res.ok, 'expected failure'); if (part) assert.ok(res.error.includes(part), res.error); };

const toForm = (p) => ({
  name: p.name, birthYear: p.birthYear, gender: p.gender, phone: p.phone, insta: p.insta,
  yearFrom: p.yearFrom, yearTo: p.yearTo, intent: p.intent, smoke: p.smoke, drink: p.drink,
  religion: p.religion, religionMatters: p.religionMatters, politics: p.politics, politicsMatters: p.politicsMatters,
  area: p.area, station: p.station, job: p.job, dealbreakers: p.dealbreakers, nice: p.nice, avoid: p.avoid.join(','),
  mbti: p.mbti, strength: p.strength, travel: p.travel, hobbies: p.hobbies, diet: p.diet,
  lastLove: p.lastLove, lastLovePublic: p.lastLovePublic, consent: true,
});

const sample = D.samplePeople();
const tokens = {};
const host = () => ok(gas.post({ action: 'host', key: hostKey }));
const byName = (h, name) => h.people.find((p) => p.name === name);
const op = (opName, args) => gas.post({ action: 'hostAction', key: hostKey, op: opName, ...args });

test('setup creates tabs, keys and plain-text columns', () => {
  ['설정', '참가자', '자리', '선택'].forEach((n) => assert.ok(gas.book.getSheetByName(n), n));
  assert.strictEqual(code.length, 12);
  assert.strictEqual(hostKey.length, 64);
  gas.setup();
  assert.strictEqual(gas.settings().host_key, hostKey, 'setup must not rotate keys');
  const sheet = gas.book.getSheetByName('참가자');
  const colOf = (h) => sheet.cells[0].indexOf(h) + 1;
  ['인스타', '연락처', '자신 있는 것', '여행지', 'MBTI'].forEach((h) => assert.strictEqual(sheet.formats[colOf(h)], '@', h));
  ['출생연도', '번호', '신청 시각'].forEach((h) => assert.notStrictEqual(sheet.formats[colOf(h)], '@', h));
});

test('unknown or inherited action names are rejected', () => {
  fail(gas.post({ action: 'constructor' }), '알 수 없는');
  fail(gas.post({ action: 'toString' }), '알 수 없는');
  fail(gas.post({ action: 'hostAction', key: hostKey, op: 'constructor' }), '알 수 없는');
});

test('event needs the invite code and hides keys', () => {
  fail(gas.post({ action: 'event', code: 'wrong' }), '초대 링크');
  const data = ok(gas.post({ action: 'event', code }));
  assert.strictEqual(data.seats.F.taken, 0);
  assert.ok(!JSON.stringify(data).includes(hostKey));
  assert.ok(!('invite_code' in data.event));
});

const ACCOUNT = '테스트은행 000-111-222222 · 예금주 테스트';

test('apply puts everyone in 승인 대기 and never returns the account', () => {
  gas.context.writeSetting_('account', ACCOUNT);
  sample.filter((p) => p.name !== '서지호').forEach((p) => {
    const data = ok(gas.post({ action: 'apply', code, form: toForm(p) }));
    tokens[p.name] = data.token;
    assert.strictEqual(data.status, 'applied', p.name);
    assert.ok(!JSON.stringify(data).includes(ACCOUNT), 'apply response leaked the account');
  });
  assert.strictEqual(tokens['오소희'].length, 64);
  assert.ok(!JSON.stringify(ok(gas.post({ action: 'event', code }))).includes(ACCOUNT), 'event leaked the account');
  const m = ok(gas.post({ action: 'me', token: tokens['김서연'] }));
  assert.strictEqual(m.me.status, 'applied');
  assert.strictEqual(m.payment, null);
});

test('apply rejects bad requests', () => {
  fail(gas.post({ action: 'apply', code: 'nope', form: toForm(sample[0]) }), '초대 링크');
  fail(gas.post({ action: 'apply', code, form: toForm(sample[0]) }), '이미 신청한');
  fail(gas.post({ action: 'apply', code, form: { ...toForm(sample[0]), phone: '010-9999-0000', consent: false } }), '동의');
  fail(gas.post({ action: 'nope' }), '알 수 없는');
  assert.ok(!JSON.parse(gas.context.doPost({ postData: { contents: '{bad json' } }).text).ok);
});

test('formula-looking text is stored as plain text', () => {
  const form = { ...toForm(sample[0]), name: '=HYPERLINK("x")', phone: '010-5555-0001', strength: '+1 자신감', insta: 'formula.test' };
  ok(gas.post({ action: 'apply', code, form }));
  assert.deepStrictEqual(gas.book.getSheetByName('참가자').formulas, []);
  const p = byName(host(), '=HYPERLINK("x")');
  assert.strictEqual(p.strength, '+1 자신감');
  assert.strictEqual(p.status, 'applied');
});

test('host view needs the host key and never includes token hashes', () => {
  fail(gas.post({ action: 'host', key: 'x'.repeat(64) }), '주최자 링크');
  const h = host();
  assert.strictEqual(h.people.length, 18);
  assert.ok(h.people.every((p) => !('tokenHash' in p)));
  assert.strictEqual(h.settings.invite_code, code);
  assert.ok(!('host_key' in h.settings));
});

test('approve takes a seat and only then shows the account', () => {
  const extraWomen = ['오소희', '=HYPERLINK("x")'];
  host().people.filter((p) => p.status === 'applied').forEach((p) => {
    const res = op('approve', { id: p.id });
    if (extraWomen.includes(p.name)) fail(res, '빈자리가 없어요');
    else ok(res);
  });
  extraWomen.forEach((name) => ok(op('waitlist', { id: byName(host(), name).id })));
  fail(op('waitlist', { id: byName(host(), '김서연').id }), '승인 대기인');
  const m = ok(gas.post({ action: 'me', token: tokens['김서연'] }));
  assert.strictEqual(m.me.status, 'pending');
  assert.strictEqual(m.payment.account, ACCOUNT);
  const w = ok(gas.post({ action: 'me', token: tokens['오소희'] }));
  assert.ok(!JSON.stringify(w).includes(ACCOUNT), 'waitlisted guest sees the account');
  assert.strictEqual(host().settings.account, ACCOUNT, 'host sees the account');
});

test('confirm gives numbers 1-8 to women and 9-16 to men', () => {
  host().people.filter((p) => p.status === 'pending').forEach((p) => ok(op('confirm', { id: p.id })));
  assert.strictEqual(ok(gas.post({ action: 'me', token: tokens['김서연'] })).payment, null);
  const h = host();
  const nums = (g) => h.people.filter((p) => p.gender === g && p.status === 'confirmed').map((p) => p.number).sort((a, b) => a - b);
  assert.deepStrictEqual(nums('F'), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepStrictEqual(nums('M'), [9, 10, 11, 12, 13, 14, 15, 16]);
  fail(op('confirm', { id: byName(h, '오소희').id }), '입금 대기인');
});

test('guest sees status but no table before seating', () => {
  const m = ok(gas.post({ action: 'me', token: tokens['김서연'] }));
  assert.strictEqual(m.me.status, 'confirmed');
  assert.strictEqual(m.table, null);
  const w = ok(gas.post({ action: 'me', token: tokens['오소희'] }));
  assert.strictEqual(w.me.waitPosition, 1);
  fail(gas.post({ action: 'me', token: 'short' }), '링크');
});

test('seating is validated and saved readably', () => {
  const h = host();
  const plan = L.planRounds(h.people);
  assert.ok(plan.ok);
  fail(op('seating', { round1: plan.round1.slice(0, 3) }), '자리 배정');
  ok(op('seating', { round1: plan.round1 }));
  assert.deepStrictEqual(host().round1, plan.round1);
  const seats = gas.book.getSheetByName('자리');
  assert.strictEqual(seats.getLastRow(), 13);
  assert.ok(/번 /.test(seats.cells[1][2]));
});

test('guest table view has only public fields', () => {
  const m = ok(gas.post({ action: 'me', token: tokens['김서연'] }));
  assert.strictEqual(m.table.mates.length, 3);
  const text = JSON.stringify(m);
  ['010-0000', 'religion', 'politics', 'avoid', '"job"', 'tokenHash', 'minjun.run'].forEach((s) => assert.ok(!text.includes(s), `leaks ${s}`));
});

test('picks open only after the party; results only after the host reveals them', () => {
  const h = host();
  const id = (name) => byName(h, name).id;
  fail(gas.post({ action: 'pick', token: tokens['김서연'], ids: [id('김민준')] }), '파티가 끝나면');
  [1, 2, 3, 4].forEach((phase) => ok(op('phase', { phase })));
  assert.strictEqual(host().phase, 4);
  fail(gas.post({ action: 'pick', token: tokens['김서연'], ids: [id('이지민')] }), '고를 수 없는');
  fail(gas.post({ action: 'pick', token: tokens['김서연'], ids: [id('김민준'), id('이도윤'), id('박현우'), id('최지훈')] }), '3명까지');
  ok(gas.post({ action: 'pick', token: tokens['김민준'], ids: [id('김서연')] }));
  // 여러 번 바꿔 내도 공개 전에는 누가 나를 골랐는지 알 수 없어야 한다.
  [['김민준', '최지훈'], ['이도윤', '박현우'], ['정준호', '강태민', '한우진']].forEach((names) => {
    const res = ok(gas.post({ action: 'pick', token: tokens['김서연'], ids: names.map(id) }));
    assert.deepStrictEqual(res.picks.mutual, [], `probe ${names} leaked`);
    assert.strictEqual(res.picks.revealed, false);
  });
  ok(gas.post({ action: 'pick', token: tokens['김서연'], ids: [id('김민준'), id('최지훈')] }));
  assert.deepStrictEqual(ok(gas.post({ action: 'me', token: tokens['김서연'] })).picks.mutual, []);
  ok(op('phase', { phase: 5 }));
  fail(gas.post({ action: 'pick', token: tokens['김서연'], ids: [id('김민준')] }), '결과가 공개돼서');
  const after = ok(gas.post({ action: 'me', token: tokens['김서연'] }));
  assert.deepStrictEqual(after.picks.mutual.map((x) => x.insta), ['minjun.run']);
  const other = ok(gas.post({ action: 'me', token: tokens['최지훈'] }));
  assert.ok(!JSON.stringify(other).includes('seoyeon.days'), 'one-sided pick leaked');
  assert.strictEqual(gas.book.getSheetByName('선택').getLastRow(), 3);
});

test('reissue replaces the personal link', () => {
  const h = host();
  const res = ok(op('reissue', { id: byName(h, '김서연').id }));
  fail(gas.post({ action: 'me', token: tokens['김서연'] }), '링크');
  ok(gas.post({ action: 'me', token: res.result.token }));
  tokens['김서연'] = res.result.token;
});

test('cancel rules and seating reset', () => {
  const h = host();
  fail(op('cancel', { id: byName(h, '박하은').id }), '파티가 시작된');
  ok(op('phase', { phase: 0 }));
  ok(op('cancel', { id: byName(h, '박하은').id }));
  const after = host();
  assert.strictEqual(after.round1, null);
  assert.strictEqual(byName(after, '박하은').number, null);
  fail(op('phase', { phase: 1 }), '테이블을 배정');
});

test('approve from the waitlist then a manual status edit assigns a number', () => {
  const h = host();
  ok(op('approve', { id: byName(h, '오소희').id }));
  const sheet = gas.book.getSheetByName('참가자');
  const row = sheet.cells.findIndex((line) => line.includes('오소희')) + 1;
  const range = sheet.setCell(row, '상태', '확정');
  gas.onEdit({ range });
  const p = byName(host(), '오소희');
  assert.strictEqual(p.status, 'confirmed');
  assert.strictEqual(p.number, 3);
});

test('a manual confirm past 8 seats is undone with a note', () => {
  const sheet = gas.book.getSheetByName('참가자');
  const row = sheet.cells.findIndex((line) => line.includes('=HYPERLINK("x")')) + 1;
  const range = sheet.setCell(row, '상태', '확정');
  gas.onEdit({ range, oldValue: '대기자' });
  const p = byName(host(), '=HYPERLINK("x")');
  assert.strictEqual(p.status, 'waitlist');
  assert.strictEqual(p.number, null);
  assert.ok(Object.values(sheet.notes).some((n) => n.includes('자리 8개')));
});

test('bursts of applications are throttled', () => {
  const extra = (n) => ({ ...toForm(sample[8]), name: `추가${n}`, phone: `010-7777-000${n}`, insta: `extra${n}` });
  const results = [1, 2, 3].map((n) => gas.post({ action: 'apply', code, form: extra(n) }));
  assert.ok(results[0].ok && results[1].ok, 'first two fit under the limit');
  fail(results[2], '몰렸어요');
});

console.log(`\n${passed} passed`);
