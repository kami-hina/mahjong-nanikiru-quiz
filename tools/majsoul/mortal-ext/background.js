// 牌譜URLを1件ずつ Mortal のフォームで開き、結果ページのURLを控えて次へ進む
const FORM = 'https://mjai.ekyu.moe/ja.html';
const RESULT_RE = /[?&]data=\/report\/|\/report\/[0-9a-z]+\.json/i;
const RESULT_WAIT_MS = 20 * 60 * 1000;   // 解析完了をこれ以上待たない

const EMPTY = { queue: [], results: {}, running: false, tabId: null, current: null, startedAt: 0, waitingHuman: false };
async function getState() { return Object.assign({}, EMPTY, (await chrome.storage.local.get('st')).st || {}); }
async function setState(st) { await chrome.storage.local.set({ st }); }

async function next() {
  const st = await getState();
  if (!st.running) return;
  const cur = st.queue.find(u => !st.results[u]);
  if (!cur) { st.running = false; st.current = null; st.waitingHuman = false; await setState(st); badge(''); return; }
  st.current = cur; st.startedAt = Date.now(); st.waitingHuman = false;
  const url = FORM + '?url=' + encodeURIComponent(cur);
  let ok = false;
  if (st.tabId != null) { try { await chrome.tabs.update(st.tabId, { url, active: true }); ok = true; } catch (e) { st.tabId = null; } }
  if (!ok) { const t = await chrome.tabs.create({ url, active: true }); st.tabId = t.id; }
  await setState(st);
  badge(`${Object.keys(st.results).length + 1}/${st.queue.length}`);
}
function badge(text) { chrome.action.setBadgeText({ text }); chrome.action.setBadgeBackgroundColor({ color: '#2a7' }); }

async function finishCurrent(st, value) {
  if (!st.current) return;
  st.results[st.current] = Object.assign({ at: Date.now() }, value);
  st.current = null; st.waitingHuman = false;
  await setState(st);
  setTimeout(next, 2500);
}

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url) return;
  const st = await getState();
  if (!st.running || tabId !== st.tabId || !st.current) return;
  if (RESULT_RE.test(info.url)) await finishCurrent(st, { result: info.url });
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const st = await getState();
  if (tabId === st.tabId) { st.tabId = null; st.running = false; st.current = null; await setState(st); badge(''); }
});

// ページ（content.js）からの連絡
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!sender.url || sender.url.startsWith('chrome-extension://')) return;   // ポップアップからのものは下で処理
  (async () => {
    const st = await getState();
    const mine = st.running && sender.tab.id === st.tabId && !!st.current;
    if (msg.type === 'should-submit') { reply({ ok: mine, index: Object.keys(st.results).length + 1, total: st.queue.length }); return; }
    if (!mine) { reply({}); return; }
    if (msg.type === 'need-human') { st.waitingHuman = true; await setState(st); badge('押す'); }
    if (msg.type === 'error') await finishCurrent(st, { error: msg.text || '不明なページ' });
    reply({});
  })();
  return true;
});

// 解析待ちが長すぎたら失敗扱いで次へ（サービスワーカーが眠るので alarms ではなく起動時と定期で確認）
chrome.alarms && chrome.alarms.create && chrome.alarms.create('tick', { periodInMinutes: 1 });
chrome.alarms && chrome.alarms.onAlarm.addListener(async () => {
  const st = await getState();
  if (st.running && st.current && Date.now() - st.startedAt > RESULT_WAIT_MS) await finishCurrent(st, { error: '解析完了を待ちきれませんでした' });
});

// ポップアップからの操作
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.url && !sender.url.startsWith('chrome-extension://')) return;   // ページからのものは上で処理
  (async () => {
    const st = await getState();
    if (msg.type === 'start') {
      const urls = (msg.urls || []).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
      for (const u of urls) if (!st.queue.includes(u)) st.queue.push(u);
      st.running = true; await setState(st); next();
    }
    if (msg.type === 'stop') { st.running = false; st.current = null; await setState(st); badge(''); }
    if (msg.type === 'retry-failed') { for (const u of Object.keys(st.results)) if (st.results[u].error) delete st.results[u]; st.running = true; await setState(st); next(); }
    if (msg.type === 'reset') { await setState(Object.assign({}, EMPTY)); badge(''); }
    reply(await getState());
  })();
  return true;
});
