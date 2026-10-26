const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const msg = m => chrome.runtime.sendMessage(m);
async function state() { return (await chrome.storage.local.get('st')).st || { queue: [], results: {} }; }

async function draw() {
  const st = await state();
  const q = st.queue || [], res = st.results || {};
  const done = q.filter(u => res[u] && res[u].result).length, ng = q.filter(u => res[u] && res[u].error).length;
  let s = `全 ${q.length}件：成功 ${done}／失敗 ${ng}／残り ${q.length - done - ng}`;
  if (st.running) s += st.current ? `<br><span class="now">解析中: ${esc(st.current)}</span>` + (st.waitingHuman ? '<br><b>ブラウザの人間確認のチェックを押してください</b>' : '') : '<br>開始待ち…';
  else if (q.length && q.length === done + ng) s += '<br><b>完了。「結果をコピー」でどうぞ。</b>';
  $('#st').innerHTML = s;
  $('#list').innerHTML = q.map(u => {
    const r = res[u];
    const mark = !r ? '<span class="muted">…</span>' : r.result ? '<span class="ok">◯</span>' : '<span class="ng">×</span>';
    const short = u.replace(/^https?:\/\/[^/]+\//, '').slice(0, 70);
    return `<div>${mark} ${esc(short)}${r && r.error ? `<br><span class="ng">${esc(r.error.slice(0, 120))}</span>` : ''}</div>`;
  }).join('');
}
function pairs(onlyResult) {
  return state().then(st => (st.queue || []).filter(u => st.results[u] && st.results[u].result)
    .map(u => onlyResult ? st.results[u].result : `${u}\t${st.results[u].result}`).join('\n'));
}
$('#start').addEventListener('click', async () => {
  const urls = $('#urls').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  await msg({ type: 'start', urls }); $('#urls').value = ''; draw();
});
$('#stop').addEventListener('click', async () => { await msg({ type: 'stop' }); draw(); });
$('#retry').addEventListener('click', async () => { await msg({ type: 'retry-failed' }); draw(); });
$('#reset').addEventListener('click', async () => { if (confirm('一覧と結果を全部消しますか？')) { await msg({ type: 'reset' }); draw(); } });
$('#copy').addEventListener('click', async () => { const t = await pairs(false); await navigator.clipboard.writeText(t + '\n'); $('#copy').textContent = 'コピーしました'; });
$('#copy2').addEventListener('click', async () => { const t = await pairs(true); await navigator.clipboard.writeText(t + '\n'); $('#copy2').textContent = 'コピーしました'; });
chrome.storage.onChanged.addListener(draw);
draw();
