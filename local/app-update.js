/* 版の確認と強制更新（何切るクイズ index.html・ローカル麻雀 play.html で共通）
   公開中の版は version.json に書く（index.html の APP_VERSION・local/play.js の VERSION・sw.js の CACHE と同じ版にする）。
   起動時に version.json と自分の版を比べ、違えば保存済みのファイル（Service Worker のキャッシュ）を消して読み直す。 */
(function(root){
"use strict";
const U={
  // 保存済みのファイルと Service Worker を消して、ネットから読み直す（次の読み込みで Service Worker は登録し直される）
  async hardReload(){
    try{ if(navigator.serviceWorker){ const rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r=>r.unregister())); } }catch(e){}
    try{ if(root.caches){ const ks=await caches.keys(); await Promise.all(ks.filter(k=>k.indexOf('mahjong-app-')===0).map(k=>caches.delete(k))); } }catch(e){}
    location.replace(location.pathname+'?v='+Date.now()+location.hash);
  },
  // 公開中の版が自分と違えば読み直す（オフラインのときと、同じ版で一度読み直したあとは何もしない）
  async check(current){
    if(navigator.onLine===false) return;
    try{
      const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'}); if(!r.ok) return;
      const v=(await r.json()).v;
      if(!v||v===current) return;
      const k='ml.update.'+v;
      if(sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k,'1');
      await U.hardReload();
    }catch(e){}
  }
};
root.MLUpdate=U;
})(window);
