/* オフライン対応（機内モードでも動くように、アプリ一式を端末に保存する）
   ・HTML・JS: 通信できればネットから最新を取り、できなければ（機内モードなど）保存済みを使う
   ・牌画像: 保存済みを使う（無ければネットから取って保存） */
const CACHE='mahjong-app-v2026-10-26e';
const ASSETS=[
  "./","index.html","play.html","isobe.html","qa.js","icon.svg","manifest.json","play-manifest.json",
  "local/mj-core.js","local/mj-ai.js","local/ai-weights.js","local/mj-game.js","local/store.js","local/ui-common.js","local/tenhou-export.js","local/review-data.js","local/play.js",
    "tiles/0m.svg",  "tiles/0p.svg",  "tiles/0s.svg",  "tiles/1m.svg",  "tiles/1p.svg",  "tiles/1s.svg",  "tiles/1z.svg",  "tiles/2m.svg",  "tiles/2p.svg",  "tiles/2s.svg",  "tiles/2z.svg",  "tiles/3m.svg",  "tiles/3p.svg",  "tiles/3s.svg",  "tiles/3z.svg",  "tiles/4m.svg",  "tiles/4p.svg",  "tiles/4s.svg",  "tiles/4z.svg",  "tiles/5m.svg",  "tiles/5p.svg",  "tiles/5s.svg",  "tiles/5z.svg",  "tiles/6m.svg",  "tiles/6p.svg",  "tiles/6s.svg",  "tiles/6z.svg",  "tiles/7m.svg",  "tiles/7p.svg",  "tiles/7s.svg",  "tiles/7z.svg",  "tiles/8m.svg",  "tiles/8p.svg",  "tiles/8s.svg",  "tiles/9m.svg",  "tiles/9p.svg",  "tiles/9s.svg",  "tiles/back.svg"
];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>null)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('mahjong-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==location.origin) return;           // Firestore など外部への通信には触らない
  const isTile=/\/tiles\/[^/]+\.svg$/.test(url.pathname);
  if(!isTile){
    e.respondWith((async()=>{
      try{
        const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),4000);
        const res=await fetch(req,{signal:ctl.signal,cache:'no-cache'}); clearTimeout(t);
        if(res&&res.ok){ const c=await caches.open(CACHE); c.put(req,res.clone()); }
        return res;
      }catch(err){
        const c=await caches.open(CACHE);
        return (await c.match(req,{ignoreSearch:true}))||(await c.match(url.pathname.endsWith('/')?'index.html':url.pathname.split('/').pop(),{ignoreSearch:true}))||Response.error();
      }
    })());
    return;
  }
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const hit=await c.match(req,{ignoreSearch:true});
    if(hit) return hit;
    const res=await fetch(req).catch(()=>null);
    if(res&&res.ok) c.put(req,res.clone());
    return res||Response.error();
  })());
});
