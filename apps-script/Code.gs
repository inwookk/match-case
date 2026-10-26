/* 8:8 미팅 파티 — 구글 시트를 저장소로 쓰는 웹 앱 API.
   같은 Apps Script 프로젝트에 저장소의 logic.js를 logic.gs라는 파일로 함께 넣어야 한다.
   처음 한 번 setup을 실행하면 탭과 열쇠가 만들어진다. */

const SHEETS = { settings: '설정', people: '참가자', seats: '자리', picks: '선택' };
// 신청하면 승인 대기 → 주최자가 승인하면 입금 대기(이때부터 계좌가 보임) → 입금 확인하면 확정(번호)
const STATUS_LABELS = { applied: '승인 대기', pending: '입금 대기', confirmed: '확정', waitlist: '대기자', cancelled: '취소' };
const TOKEN_COLUMN = '개인 링크 (암호화)';
const MAX_BODY_CHARS = 20000;
const MAX_APPLICANTS = 60;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const MAX_APPLIES_PER_WINDOW = 20;
const LOCK_WAIT_MS = 15000;
const DEFAULT_SETTINGS = [
  ['name', '우리 미팅', '행사 이름'],
  ['date', '', '날짜. 예: 11월 15일 토요일'],
  ['start', '19:00', '1라운드 시작 시각 (24시간제, 예: 19:00)'],
  ['place', '', '장소'],
  ['deposit', '30000', '예약금 (원)'],
  ['account', '', '예약금 받을 계좌. 주최자가 승인한 사람의 개인 화면에만 보여요'],
  ['refund', '파티 3일 전까지 취소하면 전액 돌려드려요. 그 뒤로는 돌려드리지 않아요.', '환불 규칙'],
  ['invite_code', '', '초대 링크 열쇠 (자동). 바꾸면 이전 초대 링크는 막혀요'],
  ['host_key', '', '주최자 링크 열쇠 (자동). 남에게 보여주지 마세요'],
  ['phase', '0', '진행 단계 (자동). 0 입장 전, 1~3 라운드, 4 파티 끝'],
  ['phase_started_at', '', '라운드 시작 시각 (자동)'],
  ['round1_json', '', '1라운드 자리 (자동). 손대지 마세요'],
];

const Logic = () => globalThis.MeetLogic;

class UserError extends Error {}

const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

/* ---------- 웹 앱 입구 ---------- */
function doGet() {
  return json_({ ok: true, data: { service: 'match-case' } });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    if (!own(ACTIONS, body.action)) throw new UserError('알 수 없는 요청이에요');
    const handler = ACTIONS[body.action];
    return json_({ ok: true, data: handler(body) });
  } catch (err) {
    if (err instanceof UserError) return json_({ ok: false, error: err.message });
    console.error(err && err.stack ? err.stack : String(err));
    return json_({ ok: false, error: '잠시 후 다시 시도해 주세요' });
  }
}

const ACTIONS = {
  event(body) {
    const st = loadState_();
    requireInvite_(st.settings, body.code);
    return { event: Logic().publicEvent(st.settings), seats: seatSummary_(st.people) };
  },

  apply(body) {
    return withLock_(() => {
      const st = loadState_();
      requireInvite_(st.settings, body.code);
      const L = Logic();
      const v = L.normalizeApplication(body.form || {});
      const errors = L.validateApplication(v);
      if (errors.length) throw new UserError(errors[0].msg);
      const active = st.people.filter((p) => p.status !== 'cancelled');
      if (active.length >= MAX_APPLICANTS) throw new UserError('신청을 더 받을 수 없어요. 주최자에게 문의해 주세요');
      const recent = st.people.filter((p) => Date.now() - p.appliedAt < BURST_WINDOW_MS);
      if (recent.length >= MAX_APPLIES_PER_WINDOW) throw new UserError('신청이 한꺼번에 몰렸어요. 10분 뒤에 다시 해 주세요');
      if (active.some((p) => p.phone === v.phone)) {
        throw new UserError('이미 신청한 연락처예요. 개인 링크를 못 받았다면 주최자에게 받아 주세요');
      }
      const token = newSecret_();
      const { consent, ...fields } = v;
      const person = {
        ...fields,
        id: `p${compactUuid_().slice(0, 10)}`,
        nick: nickOf_(v.name),
        status: 'applied',
        number: null,
        appliedAt: Date.now(),
        tokenHash: hash_(token),
      };
      writePerson_({ row: null, person });
      return { token, status: person.status, event: L.publicEvent(st.settings) };
    });
  },

  me(body) {
    const st = loadState_();
    const { person } = findByToken_(st.entries, body.token);
    return Logic().guestModel(st, person.id);
  },

  pick(body) {
    return withLock_(() => {
      const st = loadState_();
      const { person } = findByToken_(st.entries, body.token);
      const L = Logic();
      if (person.status !== 'confirmed') throw new UserError('확정된 참가자만 고를 수 있어요');
      if (st.phase < L.PHASE_PICKS) throw new UserError('파티가 끝나면 고를 수 있어요');
      if (st.phase > L.PHASE_PICKS) throw new UserError('결과가 공개돼서 더 고를 수 없어요');
      const err = L.validatePicks(st.people, person, body.ids);
      if (err) throw new UserError(err);
      writePicks_(st.people, person.id, body.ids);
      return L.guestModel({ ...st, picks: { ...st.picks, [person.id]: body.ids } }, person.id);
    });
  },

  host(body) {
    const st = loadState_();
    requireHost_(st.settings, body.key);
    return hostView_(st);
  },

  hostAction(body) {
    return withLock_(() => {
      const st = loadState_();
      requireHost_(st.settings, body.key);
      if (!own(HOST_OPS, body.op)) throw new UserError('알 수 없는 작업이에요');
      const op = HOST_OPS[body.op];
      const result = op(st, body) || {};
      return { result, host: hostView_(loadState_()) };
    });
  },
};

const HOST_OPS = {
  confirm(st, { id }) {
    const e = entryById_(st, id);
    if (e.person.status !== 'pending') throw new UserError('입금 대기인 사람만 확정할 수 있어요');
    const number = Logic().nextNumber(st.people, e.person.gender);
    if (!number) throw new UserError('남은 번호가 없어요');
    writePerson_({ row: e.row, person: { ...e.person, status: 'confirmed', number } });
    return { number };
  },

  cancel(st, { id }) {
    const e = entryById_(st, id);
    if (e.person.status === 'cancelled') return {};
    if (e.person.status === 'confirmed' && st.phase > 0) {
      throw new UserError('파티가 시작된 뒤에는 확정된 사람을 취소할 수 없어요');
    }
    writePerson_({ row: e.row, person: { ...e.person, status: 'cancelled', number: null } });
    const seated = (st.round1 || []).some((t) => [...(t.women || []), ...(t.men || [])].includes(id));
    if (seated) clearSeating_();
    return {};
  },

  // 승인하면 자리를 잡고(입금 대기) 그 사람 개인 화면에 계좌가 보인다.
  approve(st, { id }) {
    const e = entryById_(st, id);
    if (e.person.status !== 'applied' && e.person.status !== 'waitlist') throw new UserError('승인 대기나 대기자만 승인할 수 있어요');
    if (!Logic().canApprove(st.people, e.person)) throw new UserError('빈자리가 없어요. 대기자로 두거나 다른 사람을 먼저 취소해 주세요');
    writePerson_({ row: e.row, person: { ...e.person, status: 'pending' } });
    return {};
  },

  waitlist(st, { id }) {
    const e = entryById_(st, id);
    if (e.person.status !== 'applied') throw new UserError('승인 대기인 사람만 대기자로 둘 수 있어요');
    writePerson_({ row: e.row, person: { ...e.person, status: 'waitlist' } });
    return {};
  },

  seating(st, { round1 }) {
    if (st.phase > 0) throw new UserError('파티가 시작된 뒤에는 자리를 바꿀 수 없어요');
    if (!Logic().validateRound1(round1, st.people)) throw new UserError('자리 배정이 올바르지 않아요. 새로 고쳐 주세요');
    saveSeating_(st.people, round1);
    return {};
  },

  phase(st, { phase }) {
    const L = Logic();
    const next = Number(phase);
    if (!Number.isInteger(next) || next < 0 || next > L.PHASE_RESULTS) throw new UserError('진행 단계가 올바르지 않아요');
    if (next > 0 && !L.round1Valid(st.round1, st.people)) throw new UserError('먼저 테이블을 배정해 주세요');
    writeSetting_('phase', String(next));
    writeSetting_('phase_started_at', next >= 1 && next <= L.ROUND_COUNT ? String(Date.now()) : '');
    return {};
  },

  reissue(st, { id }) {
    const e = entryById_(st, id);
    const token = newSecret_();
    writePerson_({ row: e.row, person: { ...e.person, tokenHash: hash_(token) } });
    return { token };
  },
};

/* ---------- 시트를 손으로 고칠 때: 상태를 확정으로 바꾸면 번호를 붙인다 ----------
   다른 요청과 겹치지 않게 잠그고, 행 전체가 아니라 번호 칸(필요하면 상태 칸)만 고친다. */
function onEdit(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== SHEETS.people || e.range.getLastRow() < 2) return;
    const header = headerOf_(sh);
    const statusCol = header.indexOf('상태') + 1;
    const numberCol = header.indexOf('번호') + 1;
    if (statusCol < 1 || numberCol < 1 || e.range.getColumn() > statusCol || e.range.getLastColumn() < statusCol) return;
    const st = loadState_();
    const first = Math.max(2, e.range.getRow());
    const single = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    const replace = (people, next) => people.map((x) => (x.id === next.id ? next : x));
    st.entries
      .filter((entry) => entry.row >= first && entry.row <= e.range.getLastRow())
      .reduce((people, entry) => {
        const p = people.find((x) => x.id === entry.person.id);
        if (p.status === 'confirmed' && !p.number) {
          const number = Logic().nextNumber(people, p.gender);
          if (!number) {
            const cell = sh.getRange(entry.row, statusCol);
            cell.setValue(single && e.oldValue ? e.oldValue : STATUS_LABELS.pending);
            cell.setNote('자리 8개가 다 차서 확정할 수 없어요. 먼저 다른 사람을 취소해 주세요.');
            return replace(people, { ...p, status: 'pending' });
          }
          sh.getRange(entry.row, numberCol).setValue(number);
          return replace(people, { ...p, number });
        }
        if (p.status !== 'confirmed' && p.number) {
          sh.getRange(entry.row, numberCol).setValue('');
          return replace(people, { ...p, number: null });
        }
        return people;
      }, st.people);
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 처음 한 번 실행 ---------- */
function setup() {
  ensureSheet_(SHEETS.settings, ['항목', '값', '설명']);
  ensureSheet_(SHEETS.people, columns_().map((c) => c.header));
  ensureSheet_(SHEETS.seats, ['라운드', '테이블', '여자', '남자']);
  ensureSheet_(SHEETS.picks, ['고른 사람 id', '고른 사람', '고른 상대 id', '고른 상대', '시각']);

  const settings = sheet_(SHEETS.settings);
  settings.getRange(1, 2, settings.getMaxRows(), 1).setNumberFormat('@');
  const existing = readSettings_();
  DEFAULT_SETTINGS.filter(([key]) => !(key in existing)).forEach((row) => settings.appendRow(row));
  if (!String(readSettings_().invite_code || '').trim()) writeSetting_('invite_code', newSecret_().slice(0, 12));
  if (!String(readSettings_().host_key || '').trim()) writeSetting_('host_key', newSecret_());

  const people = sheet_(SHEETS.people);
  const header = headerOf_(people);
  const rows = people.getMaxRows() - 1;
  people.setFrozenRows(1);
  // 글자 칸은 모두 '일반 텍스트'로 둔다. 안 그러면 0123 같은 인스타 ID나 12/25 같은 글이 숫자·날짜로 바뀐다.
  columns_().filter((c) => c.kind === 'text').forEach((c) => {
    const col = header.indexOf(c.header) + 1;
    if (col > 0) people.getRange(2, col, rows, 1).setNumberFormat('@');
  });
  people.getRange(2, header.indexOf('상태') + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(Object.values(STATUS_LABELS), true).build());
  people.hideColumns(header.indexOf(TOKEN_COLUMN) + 1);
  console.log("준비됐어요. '설정' 탭의 invite_code와 host_key로 링크를 만들어요.");
}

/* ---------- 상태 읽기 ---------- */
function loadState_() {
  const settings = normalizeSettings_(readSettings_());
  const entries = readPeople_();
  return {
    settings,
    entries,
    people: entries.map((e) => e.person),
    round1: settings.round1,
    phase: settings.phase,
    phaseStartedAt: settings.phaseStartedAt,
    picks: readPicks_(),
  };
}

function hostView_(st) {
  return {
    settings: { ...Logic().publicEvent(st.settings), account: st.settings.account, invite_code: st.settings.invite_code },
    people: st.people.map(({ tokenHash, ...p }) => p),
    round1: st.round1,
    phase: st.phase,
    phaseStartedAt: st.phaseStartedAt,
    picks: st.picks,
  };
}

function seatSummary_(people) {
  const L = Logic();
  const of = (g) => ({
    taken: L.seatsTaken(people, g),
    wait: people.filter((p) => p.gender === g && p.status === 'waitlist').length,
  });
  return { F: of('F'), M: of('M') };
}

function normalizeSettings_(raw) {
  const tz = Session.getScriptTimeZone();
  const str = (v) => String(v == null ? '' : v).trim();
  const start = raw.start instanceof Date ? Utilities.formatDate(raw.start, tz, 'HH:mm') : str(raw.start);
  const date = raw.date instanceof Date ? Utilities.formatDate(raw.date, tz, 'M월 d일') : str(raw.date);
  let round1 = null;
  try {
    round1 = raw.round1_json ? JSON.parse(String(raw.round1_json)) : null;
  } catch (err) {
    round1 = null;
  }
  return {
    name: str(raw.name), date, start, place: str(raw.place), deposit: Number(raw.deposit) || 0,
    account: str(raw.account), refund: str(raw.refund),
    invite_code: str(raw.invite_code), host_key: str(raw.host_key),
    phase: Math.max(0, Math.min(Logic().PHASE_RESULTS, Number(raw.phase) || 0)),
    phaseStartedAt: Number(raw.phase_started_at) || null,
    round1,
  };
}

/* ---------- 열쇠와 링크 ---------- */
function requireInvite_(settings, code) {
  if (!settings.invite_code || !safeEqual_(String(code || ''), settings.invite_code)) {
    throw new UserError('초대 링크가 올바르지 않아요. 주최자에게 다시 받아 주세요');
  }
}

function requireHost_(settings, key) {
  if (!settings.host_key || !safeEqual_(String(key || ''), settings.host_key)) {
    throw new UserError('주최자 링크가 올바르지 않아요');
  }
}

function findByToken_(entries, token) {
  const bad = new UserError('링크가 올바르지 않거나 새 링크로 바뀌었어요. 주최자에게 문의해 주세요');
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw bad;
  const h = hash_(token);
  const entry = entries.find((x) => x.person.tokenHash === h);
  if (!entry) throw bad;
  return entry;
}

function entryById_(st, id) {
  const entry = st.entries.find((x) => x.person.id === id);
  if (!entry) throw new UserError('참가자를 찾을 수 없어요. 새로 고쳐 주세요');
  return entry;
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function compactUuid_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function newSecret_() {
  return compactUuid_() + compactUuid_();
}

function hash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function nickOf_(name) {
  return /^[가-힣]{3}$/.test(name) ? name.slice(1) : name;
}

/* ---------- 시트 열 정의: 사람이 읽기 쉬운 글자로 저장한다 ---------- */
function columns_() {
  const L = Logic();
  const text = { kind: 'text', to: (v) => safeText_(v), from: (c) => String(c == null ? '' : c).trim() };
  const num = { kind: 'number', to: (v) => (v || v === 0 ? v : ''), from: (c) => (c === '' || c == null ? null : Number(c)) };
  const bool = { kind: 'text', to: (v) => (v ? '예' : ''), from: (c) => c === true || String(c).trim() === '예' };
  const oneOf = (list, field) => ({
    kind: 'text',
    to: (id) => (list.find((x) => x.id === id) || { [field]: '' })[field],
    from: (c) => (list.find((x) => x[field] === String(c).trim()) || { id: '' }).id,
  });
  const manyOf = (list) => ({
    kind: 'text',
    to: (ids) => (ids || []).map((id) => (list.find((x) => x.id === id) || {}).label).filter(Boolean).join(', '),
    from: (c) => splitList_(c).map((label) => (list.find((x) => x.label === label) || {}).id).filter(Boolean),
  });
  const words = { kind: 'text', to: (arr) => safeText_((arr || []).join(', ')), from: (c) => splitList_(c) };
  const status = {
    kind: 'text',
    to: (s) => STATUS_LABELS[s] || '',
    from: (c) => Object.keys(STATUS_LABELS).find((k) => STATUS_LABELS[k] === String(c).trim()) || 'applied',
  };
  const time = { kind: 'date', to: (ms) => (ms ? new Date(ms) : ''), from: (c) => (c instanceof Date ? c.getTime() : Number(c) || 0) };
  const col = (key, header, conv) => ({ key, header, ...(conv || text) });
  return [
    col('id', 'id'), col('appliedAt', '신청 시각', time), col('status', '상태', status), col('number', '번호', num),
    col('name', '이름'), col('nick', '부를 이름'), col('gender', '성별', oneOf(L.GENDERS, 'short')),
    col('birthYear', '출생연도', num), col('phone', '연락처'), col('insta', '인스타'), col('depositName', '입금자명'),
    col('yearFrom', '원하는 나이 (부터)', num), col('yearTo', '원하는 나이 (까지)', num),
    col('intent', '만남 목적', oneOf(L.INTENTS, 'label')), col('smoke', '흡연', oneOf(L.SMOKE, 'label')),
    col('drink', '음주', oneOf(L.DRINK, 'label')), col('religion', '종교', oneOf(L.RELIGIONS, 'label')),
    col('religionMatters', '상대 종교 중요', bool), col('politics', '정치 성향', oneOf(L.POLITICS, 'label')),
    col('politicsMatters', '성향 다르면 불편', bool), col('area', '사는 곳', oneOf(L.AREAS, 'label')),
    col('station', '가까운 역'), col('job', '하는 일'),
    col('dealbreakers', '절대 안 되는 것', manyOf(L.DEALBREAKERS)), col('dealNote', '절대 안 되는 것 (기타)'),
    col('nice', '있으면 좋은 것', manyOf(L.NICE)), col('niceNote', '있으면 좋은 것 (기타)'),
    col('avoid', '피하고 싶은 사람', words), col('mbti', 'MBTI'), col('strength', '자신 있는 것'),
    col('travel', '여행지'), col('hobbies', '취미', words), col('diet', '음식 취향'),
    col('lastLove', '최근 연애'), col('lastLovePublic', '최근 연애 카드 공개', bool),
    col('tokenHash', TOKEN_COLUMN),
  ];
}

// 수식으로 해석될 수 있는 글자(=, +, -, @로 시작)는 글자 그대로 저장한다.
function safeText_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

function splitList_(c) {
  return String(c == null ? '' : c).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
}

/* ---------- 시트 읽고 쓰기 ---------- */
function book_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = book_().getSheetByName(name);
  if (!sh) throw new Error(`'${name}' 탭이 없어요. setup을 먼저 실행해 주세요`);
  return sh;
}

function headerOf_(sh) {
  const width = Math.max(1, sh.getLastColumn());
  return sh.getRange(1, 1, 1, width).getValues()[0].map((h) => String(h).trim());
}

function ensureSheet_(name, headers) {
  const sh = book_().getSheetByName(name) || book_().insertSheet(name);
  const current = sh.getLastColumn() > 0 ? headerOf_(sh) : [];
  const missing = headers.filter((h) => !current.includes(h));
  if (missing.length) sh.getRange(1, current.filter(Boolean).length + 1, 1, missing.length).setValues([missing]);
  return sh;
}

function readSettings_() {
  const sh = sheet_(SHEETS.settings);
  if (sh.getLastRow() < 2) return {};
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .filter(([key]) => String(key).trim())
    .reduce((acc, [key, value]) => ({ ...acc, [String(key).trim()]: value }), {});
}

function writeSetting_(key, value) {
  const sh = sheet_(SHEETS.settings);
  const keys = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues().map((r) => String(r[0]).trim());
  const idx = keys.indexOf(key);
  if (idx >= 0) sh.getRange(idx + 1, 2).setValue(value);
  else sh.appendRow([key, value, '']);
}

function readPeople_() {
  const sh = sheet_(SHEETS.people);
  if (sh.getLastRow() < 2) return [];
  const header = headerOf_(sh);
  const cols = columns_();
  const at = cols.map((c) => header.indexOf(c.header));
  if (at[0] < 0) throw new Error("'참가자' 탭에 id 열이 없어요");
  return sh.getRange(2, 1, sh.getLastRow() - 1, header.length).getValues()
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter(({ cells }) => String(cells[at[0]]).trim())
    .map(({ row, cells }) => ({
      row,
      person: cols.reduce((p, c, j) => ({ ...p, [c.key]: c.from(at[j] >= 0 ? cells[at[j]] : '') }), {}),
    }));
}

// 아는 열만 고치고, 주최자가 직접 추가한 열은 그대로 둔다.
function writePerson_(entry) {
  const sh = sheet_(SHEETS.people);
  const header = headerOf_(sh);
  const row = entry.row || sh.getLastRow() + 1;
  const current = entry.row ? sh.getRange(row, 1, 1, header.length).getValues()[0] : header.map(() => '');
  const cols = columns_();
  const next = header.map((h, i) => {
    const c = cols.find((x) => x.header === h);
    return c ? c.to(entry.person[c.key]) : current[i];
  });
  sh.getRange(row, 1, 1, header.length).setValues([next]);
  return row;
}

function readPicks_() {
  const sh = sheet_(SHEETS.picks);
  if (sh.getLastRow() < 2) return {};
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(([picker]) => String(picker).trim())
    .reduce((acc, [picker, , ids]) => ({ ...acc, [String(picker).trim()]: splitList_(ids) }), {});
}

function writePicks_(people, pickerId, ids) {
  const sh = sheet_(SHEETS.picks);
  const label = (id) => {
    const p = people.find((x) => x.id === id);
    return p ? `${p.number}번 ${p.nick}` : id;
  };
  const values = [pickerId, label(pickerId), ids.join(', '), ids.map(label).join(', '), new Date()];
  const pickers = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues().map((r) => String(r[0]).trim());
  const idx = pickers.indexOf(pickerId);
  if (idx >= 1) sh.getRange(idx + 1, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);
}

function saveSeating_(people, round1) {
  writeSetting_('round1_json', JSON.stringify(round1));
  const label = (id) => {
    const p = people.find((x) => x.id === id);
    return `${p.number}번 ${p.nick}`;
  };
  const rows = Logic().deriveRounds(round1).flatMap((tables, r) => tables.map((t, i) =>
    [r + 1, i + 1, t.women.map(label).join(', '), t.men.map(label).join(', ')]));
  clearSeatSheet_();
  sheet_(SHEETS.seats).getRange(2, 1, rows.length, 4).setValues(rows);
}

function clearSeating_() {
  writeSetting_('round1_json', '');
  clearSeatSheet_();
}

function clearSeatSheet_() {
  const sh = sheet_(SHEETS.seats);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
}

/* ---------- 요청과 응답 ---------- */
function parseBody_(e) {
  const text = e && e.postData ? String(e.postData.contents || '') : '';
  if (!text || text.length > MAX_BODY_CHARS) throw new UserError('요청이 올바르지 않아요');
  let body = null;
  try {
    body = JSON.parse(text);
  } catch (err) {
    throw new UserError('요청이 올바르지 않아요');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('요청이 올바르지 않아요');
  return body;
}

// 동시에 신청이 몰려도 자리와 번호가 겹치지 않게 쓰기는 한 번에 하나씩 한다.
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new UserError('사람이 몰려서 잠시 막혔어요. 다시 눌러 주세요');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
