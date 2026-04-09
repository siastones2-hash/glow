const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DB 초기화 ──
const db = new Database('glow.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    pw TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    balance REAL DEFAULT 0,
    joined TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pl TEXT DEFAULT 'other',
    rate REAL DEFAULT 0,
    min INTEGER DEFAULT 100,
    max INTEGER DEFAULT 1000000,
    desc TEXT DEFAULT '',
    api_id TEXT DEFAULT NULL,
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    uname TEXT NOT NULL,
    sid TEXT NOT NULL,
    sname TEXT NOT NULL,
    pl TEXT DEFAULT 'other',
    api_order_id TEXT DEFAULT NULL,
    link TEXT NOT NULL,
    qty INTEGER NOT NULL,
    charge REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS charges (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    uname TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// 기본 설정값
const defaultSettings = {
  margin: '50',
  exrate: '1380',
  kakao: 'https://open.kakao.com/o/sphCuRed',
  bank: '우리은행 1002-160-164625 (예금주: 조인호)',
  apikey: '',
  tg_token: '',
  tg_chat: ''
};
for (const [k, v] of Object.entries(defaultSettings)) {
  const exists = db.prepare('SELECT key FROM settings WHERE key=?').get(k);
  if (!exists) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(k, v);
}

// 기본 관리자 계정
const adminExists = db.prepare('SELECT id FROM users WHERE role=?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('6933', 10);
  db.prepare('INSERT INTO users(id,name,email,pw,role,balance) VALUES(?,?,?,?,?,?)')
    .run('admin', '관리자', 'leestones@naver.com', hash, 'admin', 0);
}

// 기본 서비스 데이터
const svcCount = db.prepare('SELECT COUNT(*) as c FROM services').get().c;
if (svcCount === 0) {
  const svcs = [
    {id:'yt1',name:'YouTube 조회수 — 일반',pl:'youtube',rate:0.50,min:1000,max:1000000,desc:'실제 사용자 기반의 자연스러운 조회수. 빠른 시작과 안전한 처리로 영상 노출을 높여드립니다.',active:1},
    {id:'yt2',name:'YouTube 조회수 — 고유지율',pl:'youtube',rate:1.20,min:500,max:500000,desc:'평균 시청 시간 30초 이상의 고품질 조회수. 유튜브 알고리즘이 선호하는 시청 패턴.',active:1},
    {id:'yt4',name:'YouTube 좋아요',pl:'youtube',rate:0.80,min:50,max:100000,desc:'영상의 좋아요 수를 빠르게 증가. 추천 알고리즘에 유리하게 작용합니다.',active:1},
    {id:'yt5',name:'YouTube 시청시간 (시간)',pl:'youtube',rate:5.00,min:100,max:10000,desc:'수익화 조건인 4,000시간 달성을 도와드립니다.',active:1},
    {id:'ig1',name:'Instagram 팔로워 — 실계정',pl:'instagram',rate:1.50,min:100,max:100000,desc:'실제 활성 계정 팔로워. 드롭 발생 시 자동 보충됩니다.',active:1},
    {id:'ig2',name:'Instagram 팔로워 — 한국인',pl:'instagram',rate:5.00,min:50,max:10000,desc:'국내 타겟 마케팅에 최적화된 한국인 팔로워.',active:1},
    {id:'ig3',name:'Instagram 좋아요',pl:'instagram',rate:0.30,min:50,max:500000,desc:'게시물 좋아요 수를 빠르게 높여드립니다.',active:1},
    {id:'ig4',name:'Instagram 릴스 조회수',pl:'instagram',rate:0.25,min:1000,max:10000000,desc:'릴스 영상 조회수 대량 증가. 알고리즘 노출 극대화.',active:1},
    {id:'ig5',name:'Instagram 스토리 조회수',pl:'instagram',rate:0.35,min:100,max:1000000,desc:'스토리 조회수를 높여드립니다.',active:1},
    {id:'ig6',name:'Instagram 저장수',pl:'instagram',rate:0.50,min:100,max:100000,desc:'게시물 저장 수 증가. 탐색 탭 노출 빈도 향상.',active:1},
    {id:'tt1',name:'TikTok 팔로워 — 실계정',pl:'tiktok',rate:1.80,min:100,max:100000,desc:'실제 틱톡 사용자 팔로워. 포유 탭 노출 가능성 향상.',active:1},
    {id:'tt2',name:'TikTok 조회수 — 빠른',pl:'tiktok',rate:0.20,min:1000,max:5000000,desc:'틱톡 영상 조회수 빠르게 대량 증가.',active:1},
    {id:'tt3',name:'TikTok 좋아요',pl:'tiktok',rate:0.40,min:100,max:500000,desc:'영상 좋아요 빠르게 증가. 바이럴 가능성 향상.',active:1},
    {id:'tw1',name:'Twitter/X 팔로워',pl:'twitter',rate:2.00,min:100,max:100000,desc:'X 계정 팔로워 증가. 수익화 프로그램 조건 달성.',active:1},
    {id:'tw2',name:'Twitter/X 좋아요',pl:'twitter',rate:0.80,min:50,max:100000,desc:'X 게시물 좋아요 증가.',active:1},
    {id:'tw4',name:'Twitter/X 조회수',pl:'twitter',rate:0.30,min:1000,max:1000000,desc:'X 수익화는 조회수 기반. 직접적인 수익 창출.',active:1},
    {id:'tg1',name:'Telegram 채널 멤버',pl:'telegram',rate:1.50,min:100,max:100000,desc:'텔레그램 채널 멤버 증가. 신뢰도와 광고 수익 향상.',active:1},
    {id:'tg2',name:'Telegram 포스트 뷰',pl:'telegram',rate:0.30,min:1000,max:5000000,desc:'채널 게시물 조회수 증가. 채널 활성도 지표.',active:1},
    {id:'sp1',name:'Spotify 재생수',pl:'spotify',rate:0.40,min:1000,max:1000000,desc:'트랙 재생수 증가. 추천 플레이리스트 포함 확률 상승.',active:1},
  ];
  const ins = db.prepare('INSERT INTO services(id,name,pl,rate,min,max,desc,active) VALUES(?,?,?,?,?,?,?,?)');
  for (const s of svcs) ins.run(s.id, s.name, s.pl, s.rate, s.min, s.max, s.desc, s.active);
}

// ── 미들웨어 ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'glow-secret-2024-xk9p',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── 유틸 ──
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : '';
}
function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(key, value);
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '로그인 필요' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin')
    return res.status(403).json({ error: '관리자 권한 필요' });
  next();
}
async function tgAlert(msg) {
  const token = getSetting('tg_token');
  const chat = getSetting('tg_chat');
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: 'HTML' })
    });
  } catch (e) { console.log('TG 오류:', e.message); }
}

// ══════════════════════════════
//  AUTH API
// ══════════════════════════════
app.post('/api/login', (req, res) => {
  const { email, pw } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(pw, user.pw))
    return res.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance } });
});

app.post('/api/register', (req, res) => {
  const { name, email, pw } = req.body;
  if (!name || !email || !pw) return res.json({ error: '모든 항목을 입력하세요' });
  if (pw.length < 6) return res.json({ error: '비밀번호는 6자 이상이어야 합니다' });
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (exists) return res.json({ error: '이미 사용 중인 이메일입니다' });
  const hash = bcrypt.hashSync(pw, 10);
  const id = 'u' + Date.now();
  db.prepare('INSERT INTO users(id,name,email,pw,role,balance) VALUES(?,?,?,?,?,?)')
    .run(id, name, email, hash, 'user', 0);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, balance: user.balance } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,balance FROM users WHERE id=?').get(req.session.userId);
  res.json(user);
});

// ══════════════════════════════
//  SERVICES API
// ══════════════════════════════
app.get('/api/services', (req, res) => {
  const svcs = db.prepare('SELECT * FROM services WHERE active=1 ORDER BY rowid').all();
  const mg = parseFloat(getSetting('margin') || 50);
  const ex = parseFloat(getSetting('exrate') || 1380);
  const result = svcs.map(s => ({
    ...s,
    sell: Math.round(s.rate / 1000 * 1000 * ex * (1 + mg / 100))
  }));
  res.json(result);
});

// ══════════════════════════════
//  ORDERS API
// ══════════════════════════════
app.post('/api/orders', requireAuth, async (req, res) => {
  const { sid, link, qty } = req.body;
  const svc = db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(sid);
  if (!svc) return res.json({ error: '서비스를 찾을 수 없습니다' });

  const qtyNum = parseInt(qty);
  if (qtyNum < svc.min || qtyNum > svc.max)
    return res.json({ error: `수량은 ${svc.min.toLocaleString()} ~ ${svc.max.toLocaleString()} 사이여야 합니다` });

  const mg = parseFloat(getSetting('margin') || 50);
  const ex = parseFloat(getSetting('exrate') || 1380);
  const charge = svc.rate / 1000 * qtyNum * ex * (1 + mg / 100);

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (user.balance < charge)
    return res.json({ error: `잔액 부족. 현재 ₩${Math.round(user.balance).toLocaleString()}` });

  // 잔액 차감
  db.prepare('UPDATE users SET balance=balance-? WHERE id=?').run(charge, user.id);

  // Peakerr API 주문
  let apiOrderId = null;
  const apiKey = getSetting('apikey');
  if (apiKey && svc.api_id) {
    try {
      const resp = await fetch('https://peakerr.com/api/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: apiKey, action: 'add', service: svc.api_id, link, quantity: qty })
      });
      const data = await resp.json();
      if (data.order) apiOrderId = String(data.order);
      else if (data.error) console.log('Peakerr 오류:', data.error);
    } catch (e) { console.log('API 오류:', e.message); }
  }

  const orderId = 'O' + Date.now();
  db.prepare('INSERT INTO orders(id,uid,uname,sid,sname,pl,api_order_id,link,qty,charge,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(orderId, user.id, user.name, svc.id, svc.name, svc.pl, apiOrderId, link, qtyNum, charge, apiOrderId ? 'processing' : 'pending');

  // 텔레그램 알림
  const updatedUser = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  tgAlert(`📦 <b>새 주문</b>\n👤 ${user.name}\n✦ ${svc.name}\n🔢 ${qtyNum.toLocaleString()}개\n💰 ₩${Math.round(charge).toLocaleString()}\n🔗 ${link}${apiOrderId ? '\n✅ API #' + apiOrderId : ''}`);

  res.json({ ok: true, orderId, apiOrderId, balance: updatedUser.balance });
});

app.get('/api/orders/my', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE uid=? ORDER BY created DESC').all(req.session.userId);
  res.json(orders);
});

// ══════════════════════════════
//  CHARGES API
// ══════════════════════════════
app.post('/api/charges', requireAuth, async (req, res) => {
  const { amount, note } = req.body;
  const amt = parseFloat(amount);
  if (!amt || amt < 5000) return res.json({ error: '최소 ₩5,000 이상' });
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  const id = 'C' + Date.now();
  db.prepare('INSERT INTO charges(id,uid,uname,amount,note,status) VALUES(?,?,?,?,?,?)')
    .run(id, user.id, user.name, amt, note || '', 'pending');

  tgAlert(`💳 <b>충전 요청</b>\n👤 ${user.name}\n💰 ₩${Math.round(amt).toLocaleString()}\n📝 ${note || '-'}\n⏰ ${new Date().toLocaleString('ko-KR')}`);

  res.json({ ok: true });
});

app.get('/api/charges/my', requireAuth, (req, res) => {
  const charges = db.prepare('SELECT * FROM charges WHERE uid=? ORDER BY created DESC').all(req.session.userId);
  res.json(charges);
});

// ══════════════════════════════
//  SETTINGS API
// ══════════════════════════════
app.get('/api/settings/public', (req, res) => {
  res.json({
    bank: getSetting('bank'),
    kakao: getSetting('kakao'),
    margin: getSetting('margin'),
    exrate: getSetting('exrate')
  });
});

// ══════════════════════════════
//  ADMIN API
// ══════════════════════════════
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) as c FROM users WHERE role!=?').get('admin').c;
  const orders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const revenue = db.prepare('SELECT SUM(charge) as s FROM orders').get().s || 0;
  const pendingCharges = db.prepare("SELECT COUNT(*) as c FROM charges WHERE status='pending'").get().c;
  res.json({ users, orders, revenue, pendingCharges });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id,name,email,role,balance,joined FROM users ORDER BY joined DESC').all();
  res.json(users);
});

app.post('/api/admin/users/balance', requireAdmin, (req, res) => {
  const { uid, delta } = req.body;
  db.prepare('UPDATE users SET balance=MAX(0,balance+?) WHERE id=?').run(parseFloat(delta), uid);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  res.json({ ok: true, balance: user.balance });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created DESC').all();
  res.json(orders);
});

app.post('/api/admin/orders/status', requireAdmin, (req, res) => {
  const { id, status } = req.body;
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(status, id);
  res.json({ ok: true });
});

app.get('/api/admin/charges', requireAdmin, (req, res) => {
  const charges = db.prepare('SELECT * FROM charges ORDER BY created DESC').all();
  res.json(charges);
});

app.post('/api/admin/charges/process', requireAdmin, (req, res) => {
  const { id, action } = req.body;
  const charge = db.prepare('SELECT * FROM charges WHERE id=?').get(id);
  if (!charge) return res.json({ error: '충전 요청을 찾을 수 없습니다' });
  const status = action === 'approve' ? 'approved' : 'rejected';
  db.prepare('UPDATE charges SET status=? WHERE id=?').run(status, id);
  if (action === 'approve') {
    db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(charge.amount, charge.uid);
    tgAlert(`✅ 충전 승인\n👤 ${charge.uname}\n💰 ₩${Math.round(charge.amount).toLocaleString()}`);
  }
  res.json({ ok: true });
});

app.get('/api/admin/services', requireAdmin, (req, res) => {
  const svcs = db.prepare('SELECT * FROM services ORDER BY rowid').all();
  res.json(svcs);
});

app.post('/api/admin/services/save', requireAdmin, (req, res) => {
  const { id, name, pl, rate, min, max, desc, api_id, active } = req.body;
  const exists = db.prepare('SELECT id FROM services WHERE id=?').get(id);
  if (exists) {
    db.prepare('UPDATE services SET name=?,pl=?,rate=?,min=?,max=?,desc=?,api_id=?,active=? WHERE id=?')
      .run(name, pl, parseFloat(rate), parseInt(min), parseInt(max), desc, api_id||null, active?1:0, id);
  } else {
    db.prepare('INSERT INTO services(id,name,pl,rate,min,max,desc,api_id,active) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id||('s'+Date.now()), name, pl, parseFloat(rate), parseInt(min), parseInt(max), desc, api_id||null, active?1:0);
  }
  res.json({ ok: true });
});

app.post('/api/admin/services/toggle', requireAdmin, (req, res) => {
  const { id } = req.body;
  db.prepare('UPDATE services SET active=1-active WHERE id=?').run(id);
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({
    margin: getSetting('margin'),
    exrate: getSetting('exrate'),
    kakao: getSetting('kakao'),
    bank: getSetting('bank'),
    apikey: getSetting('apikey') ? '••••(설정됨)' : '',
    tg_token: getSetting('tg_token') ? '••••(설정됨)' : '',
    tg_chat: getSetting('tg_chat')
  });
});

app.post('/api/admin/settings/save', requireAdmin, (req, res) => {
  const { key, value } = req.body;
  const allowed = ['margin', 'exrate', 'kakao', 'bank', 'apikey', 'tg_token', 'tg_chat'];
  if (!allowed.includes(key)) return res.json({ error: '잘못된 키' });
  setSetting(key, value);
  res.json({ ok: true });
});

// Peakerr API 연결 테스트
app.get('/api/admin/api-test', requireAdmin, async (req, res) => {
  const apiKey = getSetting('apikey');
  if (!apiKey) return res.json({ error: 'API 키가 설정되지 않았습니다' });
  try {
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'balance' })
    });
    const data = await resp.json();
    if (data.balance !== undefined) res.json({ ok: true, balance: data.balance });
    else res.json({ error: JSON.stringify(data) });
  } catch (e) { res.json({ error: e.message }); }
});

// Peakerr 서비스 동기화
app.get('/api/admin/api-sync', requireAdmin, async (req, res) => {
  const apiKey = getSetting('apikey');
  if (!apiKey) return res.json({ error: 'API 키가 설정되지 않았습니다' });
  try {
    const resp = await fetch('https://peakerr.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: apiKey, action: 'services' })
    });
    const data = await resp.json();
    if (!Array.isArray(data)) return res.json({ error: 'API 응답 오류' });

    // 기존 서비스 삭제 후 재삽입
    db.prepare('DELETE FROM services').run();
    const ins = db.prepare('INSERT INTO services(id,name,pl,rate,min,max,desc,api_id,active) VALUES(?,?,?,?,?,?,?,?,?)');
    for (const s of data) {
      ins.run(
        'api_' + s.service, s.name,
        detectPlat(s.name + ' ' + (s.category || '')),
        parseFloat(s.rate || 0), parseInt(s.min || 100), parseInt(s.max || 1000000),
        s.type || '', String(s.service), 1
      );
    }
    res.json({ ok: true, count: data.length });
  } catch (e) { res.json({ error: e.message }); }
});

// 텔레그램 테스트
app.post('/api/admin/tg-test', requireAdmin, async (req, res) => {
  const token = getSetting('tg_token');
  const chat = getSetting('tg_chat');
  if (!token || !chat) return res.json({ error: '텔레그램 설정을 먼저 저장하세요' });
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: '✅ GLOW 알림 테스트 성공! ✨' })
    });
    const data = await resp.json();
    if (data.ok) res.json({ ok: true });
    else res.json({ error: data.description });
  } catch (e) { res.json({ error: e.message }); }
});

function detectPlat(name) {
  const n = name.toLowerCase();
  if (n.includes('youtube')) return 'youtube';
  if (n.includes('instagram')) return 'instagram';
  if (n.includes('tiktok')) return 'tiktok';
  if (n.includes('threads')) return 'threads';
  if (n.includes('twitter') || n.includes(' x ')) return 'twitter';
  if (n.includes('telegram')) return 'telegram';
  if (n.includes('facebook')) return 'facebook';
  if (n.includes('spotify')) return 'spotify';
  if (n.includes('naver')) return 'naver';
  return 'other';
}

// ── SPA 라우팅 ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✨ GLOW 서버 실행 중: http://localhost:${PORT}`);
});
