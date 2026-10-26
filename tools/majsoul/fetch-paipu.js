#!/usr/bin/env node
/* 雀魂（じゃんたま）の牌譜URLを一括取得する
 *
 *   node tools/majsoul/fetch-paipu.js            四麻・半荘だけ（Mortalで検討できるもの）
 *   node tools/majsoul/fetch-paipu.js --all      三麻・東風・一局戦も含める
 *   node tools/majsoul/fetch-paipu.js --type 2   0=全部(既定) 1=友人戦 2=段位戦 4=大会戦
 *
 * 仕組み
 *   1. Chromium で game.mahjongsoul.com を開く（ログインは手動。「次回から自動でログイン」にしておけば2回目以降は不要）
 *      ログイン状態は tools/majsoul/profile に保存される（gitには含めない）
 *   2. ゲームがサーバーと話している WebSocket に、牌譜一覧の要求（.lq.Lobby.fetchGameRecordList）を
 *      こちらから流し込んで、返ってきた一覧（protobuf）を読む
 *   3. 自分のアカウントIDから牌譜URL末尾の _a〜 を作る（雀魂牌譜屋と同じ式）
 *      https://game.mahjongsoul.com/?paipu=<uuid>_a<符号化したアカウントID>
 *   保険として、ゲーム内の牌譜画面を自分でスクロールして読み込まれた分も拾う
 *
 * 出力（tools/majsoul/out/）
 *   牌譜URL_<日時>.txt   1行1URL。クイズアプリの「取り込み」欄にそのまま貼る（クリップボードにもコピー済み）
 *   牌譜一覧_<日時>.tsv  日時・種別・卓・順位つきの一覧
 *   records.json         取得済みの全件（実行のたびに合流）
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

// ---------- 設定 ----------
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const TYPE = (() => { const i = args.indexOf('--type'); return i >= 0 ? Number(args[i + 1]) || 0 : 0; })();
const COUNT = 100;                   // 1回の要求で頼む件数（サーバー側で少なく返ることもある）
const GAME_URL = 'https://game.mahjongsoul.com/';
const PROFILE = path.join(__dirname, 'profile');
const OUT = path.join(__dirname, 'out');
const CACHE = path.join(OUT, 'records.json');

function loadPlaywright() {
  const cands = ['playwright', 'playwright-core',
    'C:/Users/hinap/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'];
  for (const c of cands) { try { return require(c); } catch (e) {} }
  throw new Error('playwright が見つかりません。 npm i -g playwright するか、fetch-paipu.js の loadPlaywright にパスを足してください');
}
function browserOpts() {
  const exe = 'C:/Users/hinap/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
  if (fs.existsSync(exe)) return { executablePath: exe };
  return { channel: 'chrome' };     // 入っている Google Chrome を使う
}

// ---------- protobuf（ワイヤ形式だけの最小実装） ----------
function readVarint(b, i) {   // 2^53 を超える値（マイナスの点数など）は BigInt で返す
  let v = 0n, shift = 0n, byte;
  do { byte = b[i++]; v |= BigInt(byte & 0x7f) << shift; shift += 7n; } while (byte & 0x80);
  return [v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v, i];
}
const i64 = v => typeof v === 'bigint' ? Number(BigInt.asIntN(64, v)) : v;   // 符号付き64bitとして読む
function encVarint(n) {
  const out = []; n = Math.floor(Number(n));
  while (n >= 0x80) { out.push((n % 128) | 0x80); n = Math.floor(n / 128); }
  out.push(n); return Buffer.from(out);
}
// fields: [[番号,'v',数値] | [番号,'b',Buffer|string]]
function enc(fields) {
  return Buffer.concat(fields.map(([f, t, v]) => {
    if (t === 'v') return Buffer.concat([encVarint(f * 8), encVarint(v)]);
    const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8');
    return Buffer.concat([encVarint(f * 8 + 2), encVarint(b.length), b]);
  }));
}
function dec(b) {
  const out = []; let i = 0;
  while (i < b.length) {
    let key; [key, i] = readVarint(b, i);
    const f = Math.floor(key / 8), wt = key & 7; let v;
    if (wt === 0) [v, i] = readVarint(b, i);
    else if (wt === 1) { v = b.subarray(i, i + 8); i += 8; }
    else if (wt === 2) { let len; [len, i] = readVarint(b, i); v = b.subarray(i, i + len); i += len; }
    else if (wt === 5) { v = b.subarray(i, i + 4); i += 4; }
    else throw new Error('wire type ' + wt);
    out.push({ f, wt, v });
  }
  return out;
}
const F = (fields, f) => { const x = fields.find(e => e.f === f); return x ? x.v : undefined; };
const FA = (fields, f) => fields.filter(e => e.f === f).map(e => e.v);
const S = b => b ? Buffer.from(b).toString('utf8') : '';
const wrap = (name, data) => enc([[1, 'b', name], [2, 'b', data]]);

// ---------- 牌譜レコード ----------
const UUID_RE = /^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const encodeAccountId = id => 1358437 + ((7 * id + 1117113) ^ 86216345);   // 雀魂牌譜屋と同じ
const paipuUrl = (uuid, me) => `${GAME_URL}?paipu=${uuid}${me ? '_a' + encodeAccountId(me) : ''}`;
const ROOM = { 1: '銅の間', 2: '銅の間', 3: '銀の間', 4: '銀の間', 5: '金の間', 6: '金の間', 8: '金の間', 9: '金の間',
  11: '玉の間', 12: '玉の間', 15: '王座の間', 16: '王座の間', 17: '銅の間', 18: '銅の間', 19: '銀の間', 20: '銀の間',
  21: '金の間', 22: '金の間', 23: '玉の間', 24: '玉の間', 25: '王座の間', 26: '王座の間' };
const RULE = { 1: '四人東', 2: '四人南', 4: '四人一局', 11: '三人東', 12: '三人南', 14: '三人一局' };
const CATEGORY = { 1: '友人戦', 2: '段位戦', 4: '大会戦' };

function parseRecord(buf) {
  try {
    const r = dec(buf);
    const uuid = S(F(r, 1));
    if (!UUID_RE.test(uuid)) return null;
    const rec = { uuid, start: i64(F(r, 2)), end: i64(F(r, 3)), accounts: [], players: [] };
    const cfg = F(r, 5) ? dec(F(r, 5)) : [];
    rec.category = F(cfg, 1);
    const mode = F(cfg, 2) ? dec(F(cfg, 2)) : [];
    rec.mode = F(mode, 1);
    const meta = F(cfg, 3) ? dec(F(cfg, 3)) : [];
    rec.modeId = F(meta, 2);
    for (const a of FA(r, 11)) { const x = dec(a); rec.accounts.push({ id: F(x, 1), seat: F(x, 2) || 0, nick: S(F(x, 3)) }); }
    if (F(r, 12)) for (const p of FA(dec(F(r, 12)), 1)) { const x = dec(p); rec.players.push({ seat: F(x, 1) || 0, total: i64(F(x, 2)), pt: i64(F(x, 3)) }); }
    return rec;
  } catch (e) { return null; }
}

// ---------- 本体 ----------
(async () => {
  const { chromium } = loadPlaywright();
  fs.mkdirSync(OUT, { recursive: true });
  const records = new Map();   // uuid -> rec
  try { for (const r of JSON.parse(fs.readFileSync(CACHE, 'utf8'))) records.set(r.uuid, r); } catch (e) {}
  const before = records.size;
  let nNew = 0;
  const addRecord = r => { if (!r) return; if (!records.has(r.uuid)) nNew++; records.set(r.uuid, r); };

  const reqName = new Map();     // 要求index -> 名前（ゲーム・自分どちらの要求も）
  const pending = new Map();     // 自分の要求index -> {resolve,reject}
  const seenNames = new Set();
  let lobbySockUrl = null, myId = null, loginResolve = null, loginDone = false, listSeen = 0;
  let idx = 60000;               // ゲーム側の index（1から順）とぶつからない所から

  const onSent = (payload, url) => {
    try {
      if (!Buffer.isBuffer(payload) || payload[0] !== 2) return;
      const i = payload[1] | (payload[2] << 8);
      const name = S(F(dec(payload.subarray(3)), 1));
      reqName.set(i, name); seenNames.add(name);
      if (/^\.lq\.Lobby\./.test(name)) lobbySockUrl = url;
    } catch (e) {}
  };
  const harvestList = data => {
    const fields = dec(data);
    const list = FA(fields, 3).map(parseRecord).filter(Boolean);
    list.forEach(addRecord);
    return { list, total: F(fields, 2), err: F(fields, 1) };
  };
  const onRecv = payload => {
    try {
      if (!Buffer.isBuffer(payload)) return;
      const kind = payload[0];
      let name, data;
      if (kind === 3) {
        const i = payload[1] | (payload[2] << 8);
        name = reqName.get(i) || '';
        data = F(dec(payload.subarray(3)), 2) || Buffer.alloc(0);
        const p = pending.get(i);
        if (p) { pending.delete(i); p.resolve(data); return; }
      } else if (kind === 1) {
        const w = dec(payload.subarray(1)); name = S(F(w, 1)); data = F(w, 2) || Buffer.alloc(0);
      } else return;
      if (/\.lq\.Lobby\.(oauth2Login|login|emailLogin)$/i.test(name)) {
        const r = dec(data);
        const id = F(r, 2);
        if (id) { myId = id; if (!loginDone) { loginDone = true; console.log(`\nログイン確認（account_id=${id}）`); loginResolve && loginResolve(); } }
      }
      if (/GameRecordList/i.test(name)) {   // ゲーム内の牌譜画面をスクロールした分（保険）
        const { list } = harvestList(data);
        if (list.length) { listSeen += list.length; process.stdout.write(`\r  牌譜画面から ${listSeen}件 拾いました`); }
      }
    } catch (e) {}
  };

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false, ...browserOpts(),
    viewport: { width: 1280, height: 720 },
    args: ['--lang=ja', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  // ゲームが作る WebSocket を捕まえて、こちらからも送れるようにする
  await ctx.addInitScript(() => {
    const Orig = window.WebSocket;
    const socks = (window.__msSocks = []);
    function WS(url, protocols) { const ws = protocols === undefined ? new Orig(url) : new Orig(url, protocols); socks.push(ws); return ws; }
    WS.prototype = Orig.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WS[k] = Orig[k];
    window.WebSocket = WS;
    window.__msSend = (b64, pref) => {
      const open = socks.filter(s => s.readyState === 1);
      const s = open.find(s => s.url === pref) || open[open.length - 1];
      if (!s) return null;
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      s.send(u.buffer);
      return s.url;
    };
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('websocket', ws => {
    ws.on('framesent', f => onSent(f.payload, ws.url()));
    ws.on('framereceived', f => onRecv(f.payload));
  });
  ctx.on('close', () => { finish('ブラウザが閉じられました'); });

  const call = (name, data, timeoutMs = 20000) => new Promise(async (resolve, reject) => {
    const i = ++idx;
    const frame = Buffer.concat([Buffer.from([2, i & 255, (i >> 8) & 255]), wrap(name, data)]);
    const t = setTimeout(() => { pending.delete(i); reject(new Error('timeout ' + name)); }, timeoutMs);
    pending.set(i, { resolve: v => { clearTimeout(t); resolve(v); }, reject });
    const sent = await page.evaluate(([b64, pref]) => window.__msSend(b64, pref), [frame.toString('base64'), lobbySockUrl]).catch(() => null);
    if (!sent) { clearTimeout(t); pending.delete(i); reject(new Error('送信できるWebSocketがありません')); }
  });

  await page.goto(GAME_URL);
  console.log('ブラウザで雀魂にログインしてください。ホーム画面が出たら自動で取得を始めます。');
  console.log('（自動で始まらないときは、このウィンドウで Enter を押してください）');
  const rl = readline.createInterface({ input: process.stdin });
  await new Promise(res => { loginResolve = res; rl.once('line', res); });
  await new Promise(r => setTimeout(r, 4000));

  // 一覧を取りに行く
  let start = 0, total = null, got = 0, failed = false;
  console.log(`牌譜一覧を取得します（type=${TYPE}）…`);
  for (let n = 0; n < 500; n++) {
    let data;
    try { data = await call('.lq.Lobby.fetchGameRecordList', enc([[1, 'v', start], [2, 'v', COUNT], [3, 'v', TYPE]])); }
    catch (e) { console.log('\n自動取得に失敗:', e.message); failed = true; break; }
    const { list, total: t, err } = harvestList(data);
    if (err && err.length) { const code = F(dec(err), 1); if (code) { console.log(`\nサーバーがエラーを返しました code=${code}`); failed = true; break; } }
    if (t != null) total = t;
    if (!list.length) break;
    got += list.length; start += list.length;
    process.stdout.write(`\r  取得中… ${got}${total != null ? ' / ' + total : ''}件`);
    if (total != null && start >= total) break;
    await new Promise(r => setTimeout(r, 700));
  }
  console.log('');
  if (failed) {
    console.log('保険モード: ゲーム内の「牌譜」画面を開いて一覧を下までスクロールしてください。読み込まれた分を拾います。');
    console.log('終わったら Enter を押してください。');
    if (seenNames.size) console.log('（参考・観測した要求名: ' + [...seenNames].filter(x => /Lobby/.test(x)).slice(0, 30).join(', ') + '）');
    if (process.stdin.isTTY) await new Promise(res => rl.once('line', res));
    else {   // 端末なしで動かしているとき: 最長10分、拾えなくなって60秒たったら終わる
      const t0 = Date.now(); let last = records.size, lastAt = Date.now();
      while (Date.now() - t0 < 10 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 2000));
        if (records.size !== last) { last = records.size; lastAt = Date.now(); }
        else if (last > before && Date.now() - lastAt > 60 * 1000) break;
      }
    }
  }

  // 自分のID: ログイン応答 > 全対局に共通して出てくるID
  if (!myId) {
    const cnt = new Map();
    for (const r of records.values()) for (const a of r.accounts) cnt.set(a.id, (cnt.get(a.id) || 0) + 1);
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    myId = top ? top[0] : null;
  }
  finish();

  function finish(msg) {
    if (finish.done) return; finish.done = true;
    if (msg) console.log(msg);
    const all = [...records.values()].sort((a, b) => (b.start || 0) - (a.start || 0));
    fs.writeFileSync(CACHE, JSON.stringify(all, null, 1));
    const ok = r => ALL || r.mode === 2 || r.mode == null;      // Mortalは四麻・半荘だけ
    const use = all.filter(ok);
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
    const urls = use.map(r => paipuUrl(r.uuid, myId));
    const fmtDate = t => t ? new Date(t * 1000).toLocaleString('ja-JP', { hour12: false }) : '';
    const rankOf = r => {
      const me = r.accounts.find(a => a.id === myId); if (!me || !r.players.length) return '';
      const order = [...r.players].sort((a, b) => (b.total || 0) - (a.total || 0));
      const i = order.findIndex(p => p.seat === me.seat); return i >= 0 ? `${i + 1}位` : '';
    };
    const tsv = ['日時\t種別\t卓\tルール\t順位\t参加者\tURL'].concat(use.map(r =>
      [fmtDate(r.start), CATEGORY[r.category] || `種別${r.category == null ? '?' : r.category}`,
        ROOM[r.modeId] || (r.modeId != null ? `卓${r.modeId}` : ''),
        RULE[r.mode] || `ルール${r.mode == null ? '?' : r.mode}`, rankOf(r),
        r.accounts.map(a => a.nick).join('/'), paipuUrl(r.uuid, myId)].join('\t'))).join('\n');
    const txt = path.join(OUT, `牌譜URL_${stamp}.txt`), tsvPath = path.join(OUT, `牌譜一覧_${stamp}.tsv`);
    fs.writeFileSync(txt, urls.join('\n') + '\n');
    fs.writeFileSync(tsvPath, '\ufeff' + tsv + '\n');
    try {   // クリップボードへ（clip.exe は環境によって効かないので PowerShell で書いたファイルを読ませる）
      const r = spawnSync('powershell', ['-NoProfile', '-Command', `Get-Content -Raw -LiteralPath '${txt.replace(/'/g, "''")}' | Set-Clipboard`]);
      if (r.status !== 0) spawnSync('clip', { input: urls.join('\r\n') + '\r\n' });
    } catch (e) {}
    console.log(`\n取得済み ${all.length}件（今回新規 ${nNew}件、前回まで ${before}件）`);
    console.log(`Mortal向け（四麻・半荘）${use.length}件のURLを書き出しました:`);
    console.log('  ' + txt);
    console.log('  ' + tsvPath);
    console.log('URL一覧はクリップボードにもコピー済み。クイズアプリの「取り込み」欄に貼り付けてください。');
    if (!myId) console.log('注意: 自分のアカウントIDが分からなかったので _a なし（席は Mortal 側で指定が必要）のURLです。');
    if (all.length && !use.length) console.log('注意: 四麻・半荘の牌譜がありません。--all を付けると全件書き出します。');
    console.log('次は Chrome の拡張「Mortal一括解析」（tools/majsoul/mortal-ext）に貼って Mortal にかけてください。');
    ctx.close().catch(() => {}).finally(() => process.exit(0));
  }
})().catch(e => { console.error(e); process.exit(1); });
