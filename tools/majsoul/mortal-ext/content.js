// mjai.ekyu.moe のページで動く。フォームなら人間確認が通り次第「送信」を押し、
// 結果ページでもフォームでもないページ（エラー）ならその旨を知らせる
(async () => {
  const RESULT_RE = /[?&]data=\/report\/|\/report\/[0-9a-z]+\.json/i;
  const form = document.forms && document.forms.reviewForm;
  const send = m => chrome.runtime.sendMessage(m).catch(() => ({}));
  if (form) {
    const r = await send({ type: 'should-submit' });
    if (!r || !r.ok) return;
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#2a7;color:#fff;padding:8px 14px;font:14px sans-serif;';
    bar.textContent = `Mortal一括解析 ${r.index}/${r.total}：人間確認が通ると自動で送信します。チェックボックスが出たら押してください。`;
    document.body.appendChild(bar);
    const ts = form.querySelector('.cf-turnstile');
    if (ts) ts.scrollIntoView({ block: 'center' });
    const btn = form.submitBtn;
    let waited = 0;
    const iv = setInterval(() => {
      if (!btn.disabled) {
        clearInterval(iv);
        bar.textContent = `Mortal一括解析 ${r.index}/${r.total}：送信しました。解析が終わるまでこのタブはそのままにしてください（数十秒〜数分）`;
        form.requestSubmit(btn);
      } else {
        waited += 500;
        if (waited === 15000) send({ type: 'need-human' });
      }
    }, 500);
  } else if (!RESULT_RE.test(location.href)) {
    // 20秒たっても結果ページにもフォームにもならないならエラーページとみなす
    setTimeout(() => {
      if (RESULT_RE.test(location.href) || document.forms.reviewForm) return;
      const text = (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      send({ type: 'error', text });
    }, 20000);
  }
})();
