/* ローカル麻雀の保存（端末内の IndexedDB。何切るクイズ index.html からも同じDBを読む）
   DB: mahjong-local
     games : {id, createdAt, updatedAt, finished, names, seed, log, decisions, memos(id[]), result, summary}
     memos : {id, gameId, createdAt, text, checked, kyokuLabel, logIndex, st, q}
     kv    : {k, v}   … 対局中のゲーム状態（中断→再開用）など
   IndexedDB が使えない環境でも遊べるよう、localStorage に要約と対局中データの控えを置く。 */
(function(root){
"use strict";
const DBN='mahjong-local', VER=1;
let _db=null;
function open(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    let r; try{ r=indexedDB.open(DBN,VER); }catch(e){ return rej(e); }
    r.onupgradeneeded=()=>{ const d=r.result;
      if(!d.objectStoreNames.contains('games')) d.createObjectStore('games',{keyPath:'id'});
      if(!d.objectStoreNames.contains('memos')) d.createObjectStore('memos',{keyPath:'id'});
      if(!d.objectStoreNames.contains('kv')) d.createObjectStore('kv',{keyPath:'k'}); };
    r.onsuccess=()=>{ _db=r.result; _db.onversionchange=()=>{ try{_db.close()}catch(e){} _db=null; }; res(_db); };
    r.onerror=()=>rej(r.error||new Error('open failed'));
    r.onblocked=()=>rej(new Error('blocked'));
  });
}
function tx(store,mode,fn){
  return open().then(d=>new Promise((res,rej)=>{
    let t; try{ t=d.transaction(store,mode); }catch(e){ _db=null; return rej(e); }
    let out; try{ out=fn(t.objectStore(store)); }catch(e){ return rej(e); }
    t.oncomplete=()=>res(out&&typeof out==='object'&&'result' in out? out.result: out);
    t.onerror=()=>rej(t.error||new Error('tx error')); t.onabort=()=>rej(t.error||new Error('tx abort'));
  }));
}
const lsGet=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } };
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } };
const LS_INDEX='ml.games.v1', LS_CUR='ml.current.v1', LS_MEMO='ml.memos.v1';
// 一覧用の要約
function summaryOf(g){
  const dec=g.decisions||[];
  return {id:g.id,createdAt:g.createdAt,updatedAt:g.updatedAt,finished:!!g.finished,names:g.names,
    result:g.result||null,decisions:dec.length,falses:dec.filter(d=>!d.ok).length,memos:(g.memos||[]).length,
    kyokuLabel:g.kyokuLabel||''};
}
const Store={
  async saveGame(g){
    g.updatedAt=Date.now(); g.summary=summaryOf(g);
    let ok=false;
    try{ await tx('games','readwrite',s=>s.put(g)); ok=true; }catch(e){ Store.lastError=e; }
    const idx=lsGet(LS_INDEX,[]).filter(x=>x.id!==g.id); idx.unshift(g.summary); lsSet(LS_INDEX,idx.slice(0,500));
    if(!ok){ // IndexedDB が使えないときは localStorage に丸ごと（容量の許す限り）
      lsSet('ml.game.'+g.id,g); }
    return g;
  },
  async getGame(id){
    try{ const g=await tx('games','readonly',s=>s.get(id)); if(g) return g; }catch(e){}
    return lsGet('ml.game.'+id,null);
  },
  async listGames(){
    let a=[];
    try{ a=(await tx('games','readonly',s=>s.getAll()))||[]; }catch(e){}
    const m=new Map(a.map(g=>[g.id,g]));
    // localStorage にしか無いもの
    for(const x of lsGet(LS_INDEX,[])) if(!m.has(x.id)){ const g=lsGet('ml.game.'+x.id,null); if(g) m.set(g.id,g); }
    return [...m.values()].sort((x,y)=>(y.createdAt||0)-(x.createdAt||0));
  },
  async deleteGame(id){
    try{ await tx('games','readwrite',s=>s.delete(id)); }catch(e){}
    try{ localStorage.removeItem('ml.game.'+id); }catch(e){}
    lsSet(LS_INDEX,lsGet(LS_INDEX,[]).filter(x=>x.id!==id));
  },
  async saveMemo(m){
    m.updatedAt=Date.now();
    try{ await tx('memos','readwrite',s=>s.put(m)); }catch(e){}
    const l=lsGet(LS_MEMO,[]).filter(x=>x.id!==m.id); l.unshift(m); lsSet(LS_MEMO,l.slice(0,400));
    return m;
  },
  async listMemos(){
    let a=[]; try{ a=(await tx('memos','readonly',s=>s.getAll()))||[]; }catch(e){}
    const m=new Map(a.map(x=>[x.id,x]));
    for(const x of lsGet(LS_MEMO,[])){ const c=m.get(x.id); if(!c||(x.updatedAt||0)>(c.updatedAt||0)) m.set(x.id,x); }
    return [...m.values()].filter(x=>!x.deleted).sort((x,y)=>(y.createdAt||0)-(x.createdAt||0));
  },
  async deleteMemo(id){
    const l=await Store.listMemos(); const m=l.find(x=>x.id===id); if(!m) return;
    m.deleted=true; await Store.saveMemo(m);
  },
  // 対局中の状態（中断・再開）
  async saveCurrent(cur){
    lsSet(LS_CUR,cur);
    try{ await tx('kv','readwrite',s=>s.put({k:'current',v:cur})); }catch(e){}
  },
  async loadCurrent(){
    let v=null; try{ const r=await tx('kv','readonly',s=>s.get('current')); v=r&&r.v; }catch(e){}
    const l=lsGet(LS_CUR,null);
    if(!v||(l&&(l.savedAt||0)>(v.savedAt||0))) v=l;
    return v;
  },
  async clearCurrent(){
    try{ localStorage.removeItem(LS_CUR); }catch(e){}
    try{ await tx('kv','readwrite',s=>s.delete('current')); }catch(e){}
  },
  async askPersist(){ try{ if(navigator.storage&&navigator.storage.persist) await navigator.storage.persist(); }catch(e){} }
};
root.MLStore=Store;
})(typeof window!=='undefined'?window:globalThis);
