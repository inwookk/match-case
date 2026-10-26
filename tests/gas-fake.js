/* Apps Script를 Node에서 돌리기 위한 최소한의 가짜 구글 환경. 테스트와 로컬 확인용이다. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

class FakeRange {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }

  getValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (__, c) => {
      const line = this.sheet.cells[this.row - 1 + r] || [];
      const v = line[this.col - 1 + c];
      return v === undefined ? '' : v;
    }));
  }

  setValues(values) {
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.put(this.row + r, this.col + c, v)));
    return this;
  }

  setValue(v) {
    this.sheet.put(this.row, this.col, v);
    return this;
  }

  clearContent() {
    for (let r = 0; r < this.rows; r += 1) for (let c = 0; c < this.cols; c += 1) this.sheet.put(this.row + r, this.col + c, '');
    return this;
  }

  setNumberFormat(fmt) {
    for (let c = 0; c < this.cols; c += 1) this.sheet.formats[this.col + c] = fmt;
    return this;
  }

  setDataValidation() { return this; }

  setNote(note) {
    this.sheet.notes[`${this.row}:${this.col}`] = note;
    return this;
  }

  getNumRows() { return this.rows; }

  getNumColumns() { return this.cols; }

  getSheet() { return this.sheet; }

  getRow() { return this.row; }

  getLastRow() { return this.row + this.rows - 1; }

  getColumn() { return this.col; }

  getLastColumn() { return this.col + this.cols - 1; }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.cells = [];
    this.formulas = [];
    this.formats = {};
    this.notes = {};
  }

  // 시트처럼 '로 시작하는 글자는 그대로 저장하고 앞의 '는 떼어낸다. =로 시작하면 수식으로 기록해 둔다.
  put(row, col, v) {
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) this.formulas.push(v);
    while (this.cells.length < row) this.cells.push([]);
    const value = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
    this.cells[row - 1][col - 1] = value;
  }

  getName() { return this.name; }

  getLastRow() {
    for (let r = this.cells.length; r > 0; r -= 1) if ((this.cells[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r;
    return 0;
  }

  getLastColumn() {
    return this.cells.reduce((max, line) => {
      for (let c = line.length; c > 0; c -= 1) if (line[c - 1] !== '' && line[c - 1] !== undefined) return Math.max(max, c);
      return max;
    }, 0);
  }

  getMaxRows() { return Math.max(1000, this.cells.length); }

  getRange(row, col, rows = 1, cols = 1) { return new FakeRange(this, row, col, rows, cols); }

  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }

  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((v, c) => this.put(row, c + 1, v));
  }

  setFrozenRows() {}

  hideColumns() {}

  // 테스트용: 머리글 이름으로 한 칸 고치기
  setCell(row, header, value) {
    const col = this.cells[0].indexOf(header) + 1;
    this.put(row, col, value);
    return new FakeRange(this, row, col, 1, 1);
  }
}

class FakeBook {
  constructor() { this.sheets = new Map(); }

  getSheetByName(name) { return this.sheets.get(name) || null; }

  insertSheet(name) {
    const sh = new FakeSheet(name);
    this.sheets.set(name, sh);
    return sh;
  }
}

function createGas() {
  const book = new FakeBook();
  const validation = { requireValueInList() { return this; }, build() { return {}; } };
  const context = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => book, newDataValidation: () => validation },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => [...crypto.createHash(alg).update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d) => d.toISOString(),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'logic.js'), 'utf8'), context, { filename: 'logic.gs' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8'), context, { filename: 'Code.gs' });

  const post = (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const settings = () => {
    const sh = book.getSheetByName('설정');
    return Object.fromEntries(sh.cells.slice(1).map(([k, v]) => [k, v]));
  };
  return { context, book, post, settings, setup: () => context.setup(), onEdit: (e) => context.onEdit(e) };
}

module.exports = { createGas };
