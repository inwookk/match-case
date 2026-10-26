/* 로컬 확인용: 가짜 구글 시트로 Apps Script를 돌리고, 화면은 다른 포트에서 연다(실제처럼 출처가 다르다).
   node tests/fake-backend.js [--seed]
   --seed를 주면 예시 참가자 15명을 미리 신청·확정해 두고, 김서연 한 명은 화면에서 신청하도록 남긴다. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./gas-fake');

const ROOT = path.join(__dirname, '..');
const API_PORT = Number(process.env.API_PORT || 5175);
const WEB_PORT = Number(process.env.WEB_PORT || 5176);
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const LEFT_OUT = '김서연';
const STAGE = process.env.STAGE === 'party' ? 'party' : 'signup';

const gas = createGas();
gas.setup();
[['name', '11월 친구 미팅 (로컬)'], ['date', '11월 15일 토요일'], ['place', '을지로 OO 라운지 (예시)'],
  ['account', 'OO은행 000-000-000000 · 예금주 홍길동 (예시)']].forEach(([k, v]) => gas.context.writeSetting_(k, v));
const { invite_code: code, host_key: hostKey } = gas.settings();
const tokens = {};

if (process.argv.includes('--seed')) {
  const D = require(path.join(ROOT, 'data.js'));
  const form = (p) => ({ ...p, avoid: p.avoid.join(','), consent: true });
  D.samplePeople().filter((p) => p.name !== LEFT_OUT && p.status === 'confirmed').forEach((p) => {
    const res = gas.post({ action: 'apply', code, form: form(p) });
    if (!res.ok) throw new Error(`${p.name}: ${res.error}`);
    tokens[p.name] = res.data.token;
  });
  const host = gas.post({ action: 'host', key: hostKey }).data;
  host.people.forEach((p) => gas.post({ action: 'hostAction', key: hostKey, op: 'approve', id: p.id }));
  host.people.forEach((p) => gas.post({ action: 'hostAction', key: hostKey, op: 'confirm', id: p.id }));
  const sample = D.samplePicks();
  console.log('seeded 15 guests; sample pick map has', Object.keys(sample).length, 'pickers (submit them after phase 4 if needed)');
}

// Apps Script처럼 사전 확인(OPTIONS)은 받지 않는다. 화면이 단순 요청만 보내는지 여기서 걸러진다.
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(405); res.end(); return; }
  if (req.method !== 'POST' || !req.url.startsWith('/exec')) { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const out = gas.context.doPost({ postData: { contents: body } }).text;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(out);
  });
}).listen(API_PORT, '127.0.0.1');

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  if (rel === 'config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    res.end(`window.MEET_CONFIG = { apiUrl: 'http://127.0.0.1:${API_PORT}/exec', stage: '${STAGE}' };`);
    return;
  }
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}tests${path.sep}`)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(WEB_PORT, '127.0.0.1');

const base = `http://localhost:${WEB_PORT}/`;
const links = {
  invite: `${base}#c=${code}`,
  host: `${base}#h=${hostKey}`,
  guests: Object.fromEntries(Object.entries(tokens).map(([name, t]) => [name, `${base}#t=${t}`])),
};
fs.writeFileSync(path.join(__dirname, '.fake-links.json'), JSON.stringify(links, null, 2));
console.log(`web ${base}  api http://127.0.0.1:${API_PORT}/exec`);
console.log(`invite ${links.invite}`);
console.log(`host   ${links.host}`);
