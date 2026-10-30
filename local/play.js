/* ローカル麻雀（オフライン）: 画面と対局の進行
   あなた(座席0) vs Mortal代役AI×3。AIの持ち時間は1手0.3秒、あなたは無制限。 */
(function(){
"use strict";
const MJ=window.MJ, AI=window.MJAI, UI=window.MLUI, Store=window.MLStore, {Game}=window.MJGame;
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const esc=UI.esc;
const HUMAN=0; let CPU_MS=300;
const ABORT={abort:true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const VERSION='2026-10-26j';

/* ================= 設定 ================= */
const CFG_KEY='ml.cfg.v1';
const CFG=Object.assign({tap:'two',judge:'strict',mode:'portrait',names:['あなた','下家AI','対面AI','上家AI']},
  (()=>{ try{ return JSON.parse(localStorage.getItem(CFG_KEY)||'{}'); }catch(e){ return {}; } })());
const saveCfg=()=>{ try{ localStorage.setItem(CFG_KEY,JSON.stringify(CFG)); }catch(e){} };

/* ================= 画面の向き（ボタンで切り替え。端末の傾きでは切り替えない） ================= */
let LAY={W:0,H:0,pad:{t:0,r:0,b:0,l:0},rot:0};
function insets(){
  const p=getComputedStyle($('#probe'));
  return {t:parseFloat(p.paddingTop)||0,r:parseFloat(p.paddingRight)||0,b:parseFloat(p.paddingBottom)||0,l:parseFloat(p.paddingLeft)||0};
}
function applyLayout(){
  const vw=window.innerWidth, vh=window.innerHeight;
  const osLand=vw>vh;
  let ang=0;
  try{ ang=(screen.orientation&&typeof screen.orientation.angle==='number')? screen.orientation.angle : (window.orientation||0); }catch(e){}
  ang=((ang%360)+360)%360;
  const ins=insets();
  let rot=0;
  if(CFG.mode==='landscape'&&!osLand) rot=90;
  if(CFG.mode==='portrait'&&osLand) rot=(ang===90)? -90 : 90;
  const el=$('#rot');
  let W,H,pad;
  if(rot===0){ W=vw; H=vh; el.style.transform='none'; pad=ins; }
  else if(rot===90){ W=vh; H=vw; el.style.transform=`translate(${vw}px,0) rotate(90deg)`; pad={t:ins.r,r:ins.b,b:ins.l,l:ins.t}; }
  else { W=vh; H=vw; el.style.transform=`translate(0,${vh}px) rotate(-90deg)`; pad={t:ins.l,r:ins.t,b:ins.r,l:ins.b}; }
  // 横向き表示でホームバー側の余白が大きすぎる場合は控えめに
  el.style.width=W+'px'; el.style.height=H+'px';
  LAY={W,H,pad,rot,land:CFG.mode==='landscape'};
  $$('.screen').forEach(s=>{ s.style.paddingTop=pad.t+'px'; s.style.paddingBottom=pad.b+'px'; s.style.paddingLeft=pad.l+'px'; s.style.paddingRight=pad.r+'px'; });
  layoutGame();
}
let TW=28, GL=null;
/* 対局画面の配置（天鳳のスマホ版に合わせる）
   縦: 卓（画面幅の正方形）→ その真下に画面幅いっぱいの手牌 → 操作ボタン → 情報パネル
   横: 卓を中央に置き、手牌は画面下に横幅いっぱい（卓の下端に重ねる）。メニューは右下、情報パネルは左に浮かせる */
function layoutGame(){
  const w=LAY.W-LAY.pad.l-LAY.pad.r, h=LAY.H-LAY.pad.t-LAY.pad.b;
  const wrap=$('#g-wrap'); if(!wrap) return;
  wrap.style.left=LAY.pad.l+'px'; wrap.style.top=LAY.pad.t+'px'; wrap.style.width=w+'px'; wrap.style.height=h+'px';
  wrap.className=LAY.land?'landscape':'portrait';
  let L;
  if(!LAY.land){
    TW=Math.max(20,Math.min(60,Math.floor((w-4)/14.35)));
    const handH=Math.round(TW*44/34)+24;
    const B=Math.max(220,Math.min(w,h-handH-70));
    const bx=Math.round((w-B)/2), y=B+handH;
    L={land:false,B,handH,
      board:{left:bx,top:0,width:B,height:B},
      hand:{left:0,top:B,width:w,height:handH},
      msg:{left:8,top:y+2,width:w-16,height:18},
      acts:{left:6,top:y+22,width:w-12,height:62},
      info:{left:0,top:y+88,width:w,height:Math.max(40,h-(y+88))},
      menubtn:{left:bx+B-76,top:B-52},
      menu:{left:6,top:y+4,width:w-12,height:null,maxH:h-y-8},
      ov:{left:0,top:B,width:w,height:h-B}};
  } else {
    TW=Math.max(22,Math.min(58,Math.floor((w-12)/14.8)));
    const handH=Math.round(TW*44/34)+16;
    const B=Math.max(200,Math.min(h,Math.floor((h-handH+8)/0.87),Math.floor(w*0.62)));
    const bx=Math.round((w-B)/2), side=bx;
    const ovW=Math.min(500,Math.max(330,Math.round(w*0.52)));
    const mW=Math.min(380,Math.round(w*0.46));
    L={land:true,B,handH,
      board:{left:bx,top:0,width:B,height:B},
      hand:{left:0,top:h-handH,width:w,height:handH},
      msg:{left:bx+8,top:h-handH-24,width:Math.round(B*0.5),height:20},
      acts:{left:bx+Math.round(B*0.3),top:h-handH-70,width:Math.round(B*0.7)-4,height:64},
      info:{left:4,top:4,width:Math.min(400,Math.max(side-8,300)),height:h-handH-12},
      menubtn: side>=84? {left:w-side+Math.round((side-72)/2),top:h-handH-58} : {left:bx+B-78,top:h-handH-58},
      menu:{left:w-mW-4,top:4,width:mW,height:null,maxH:h-handH-12},
      ov:{left:w-ovW,top:0,width:ovW,height:h}};
  }
  const set=(sel,r)=>{ const el=$(sel); if(!el||!r) return; ['left','top','width','height'].forEach(k=>{ el.style[k]= r[k]==null? '' : r[k]+'px'; }); };
  $('#g-menu').style.maxHeight=(L.menu.maxH||0)+'px';
  wrap.style.setProperty('--hitb',(L.land?8:42)+'px');
  set('#g-board',L.board); set('#g-hand',L.hand); set('#g-msg',L.msg); set('#g-acts',L.acts); set('#g-info',L.info); set('#g-menubtn',L.menubtn); set('#g-menu',L.menu);
  const ov=$('#ov'); if(ov) set('#ov',L.ov);
  $('#g-info').classList.toggle('float',L.land);
  document.documentElement.style.setProperty('--tw',TW+'px');
  GL=L;
}
window.addEventListener('resize',()=>{ applyLayout(); if(SCREEN==='game') renderGame(); });
window.addEventListener('orientationchange',()=>setTimeout(()=>{ applyLayout(); if(SCREEN==='game') renderGame(); },250));

/* ================= 画面遷移 ================= */
let SCREEN='home';
function show(id){
  SCREEN=id;
  $$('.screen').forEach(s=>s.classList.toggle('on',s.id===id));
  if(id!=='game'&&PEND&&PEND.resolve){ const r=PEND.resolve; PEND.resolve=null; r(ABORT); }
}
function toast(msg,ms){
  const o=$('.toast'); if(o) o.remove();
  const d=document.createElement('div'); d.className='toast'; d.textContent=msg; $('#app').appendChild(d);
  setTimeout(()=>d.remove(),ms||2200);
}

/* ================= ホーム ================= */
async function renderHome(){
  show('home');
  const cur=await Store.loadCurrent();
  const games=await Store.listGames();
  const memos=await Store.listMemos();
  const unchecked=memos.filter(m=>!m.checked).length;
  const fin=games.filter(g=>g.finished);
  const decs=games.reduce((a,g)=>a+(g.decisions||[]).length,0), falses=games.reduce((a,g)=>a+(g.decisions||[]).filter(d=>!d.ok).length,0);
  $('#home').innerHTML=`<div class="page">
    <div class="center" style="margin:10px 0 14px">
      <div style="font-size:22px;font-weight:900">ローカル麻雀</div>
      <div class="small muted">あなた vs Mortal代役AI ×3 ／ 半荘戦 ／ 通信なし（機内モード可）</div>
    </div>
    ${cur&&cur.game&&!cur.game.over?`<button class="hbtn btn-gold" id="h-cont">続きから（${esc(cur.label||'')}）</button>`:''}
    <button class="hbtn btn-p" id="h-new">新しい半荘を始める</button>
    ${rvSaved()?`<button class="hbtn btn-gold" id="h-rvc">${rvSaved().set==='v2'?'学習用牌譜（v2）':'復習半荘'}の続きから</button>`:''}
    <div class="card">
      <h2>復習半荘</h2>
      <p class="small muted" style="margin:0 0 6px">牌譜データ.json・牌譜データv3 の半荘（Mortalの解析済み）から1半荘を選び、東1局から最後の局まで、全局を全く同じ手牌・同じ進行で打ちます。あなたの判断は本物の Mortal の解析結果と照合し、違えば FALSE を表示します。<br>出題順：実戦で推奨率20%以下の手を選んだ回数が多い半荘から順に（一巡したら最初から）。</p>
      <button class="hbtn" id="h-rv">次の復習半荘を始める</button>
      <button class="hbtn btn-g" id="h-rvl">出題順の一覧から選ぶ</button>
    </div>
    <div class="card">
      <h2>学習用牌譜（v2）から出題</h2>
      <p class="small muted" style="margin:0 0 6px">牌譜データv2 は Mortal代役AIの学習用で、復習半荘には入れていません。こちらは v2 の半荘を同じ方法（同じ手牌・同じ進行・本物の Mortal と照合）で出題する別モードです。</p>
      <button class="hbtn" id="h-v2">次の半荘を始める（v2）</button>
      <button class="hbtn btn-g" id="h-v2l">出題順の一覧から選ぶ（v2）</button>
    </div>
    <div class="card">
      <h2>要チェック</h2>
      <p class="small muted" style="margin:0 0 6px">対局中に「メモ記入」した局面です。あとからまとめて確認できます。</p>
      <button class="hbtn" id="h-chk">要チェックを確認する（未チェック ${unchecked}件 / 全${memos.length}件）</button>
    </div>
    <div class="card">
      <h2>牌譜</h2>
      <p class="small muted" style="margin:0 0 6px">すべての半荘の牌譜を、全員の手牌を表示して最初から最後まで見られます。</p>
      <button class="hbtn" id="h-logs">牌譜一覧（${games.length}半荘）</button>
      <div class="small muted">これまでの判断 ${decs}回 ／ FALSE ${falses}回${decs?`（Mortal代役との一致率 ${((1-falses/decs)*100).toFixed(1)}%）`:''}</div>
    </div>
    <div class="row">
      <button class="grow" id="h-set">設定</button>
      <a class="grow" href="index.html#local" style="text-decoration:none"><button style="width:100%">何切るクイズへ</button></a>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="grow ${CFG.mode==='portrait'?'btn-p':'btn-g'}" id="h-port">縦画面モード</button>
      <button class="grow ${CFG.mode==='landscape'?'btn-p':'btn-g'}" id="h-land">横画面モード</button>
    </div>
    <p class="small muted" style="margin-top:14px">Mortal代役AIは、Mortal の解析結果（${AI_INFO()}）から学習したモデルを端末内で計算しています。
    画面の向きはボタンでだけ切り替わります（iPhoneの「画面縦向きのロック」をオンにしておくと安定します）。版 ${VERSION}</p>
  </div>`;
  const c=$('#h-cont'); if(c) c.onclick=()=>resumeGame(cur);
  $('#h-new').onclick=async()=>{ if(cur&&cur.game&&!cur.game.over&&!confirm('対局中の半荘があります。新しく始めると、対局中の半荘は途中までの牌譜として保存されます。よろしいですか？')) return; newGame(); };
  $('#h-chk').onclick=renderChecks; $('#h-logs').onclick=renderLogs; $('#h-set').onclick=renderSettings;
  const startSet=set=>{ if(rvSaved()&&!confirm('途中の復習半荘があります。新しく始めると、途中までの記録は牌譜一覧に保存されます。よろしいですか？')) return; rvStart(null,set); };
  $('#h-rv').onclick=()=>startSet('main');
  $('#h-v2').onclick=()=>startSet('v2');
  const rc=$('#h-rvc'); if(rc) rc.onclick=rvResume;
  $('#h-rvl').onclick=()=>renderReviewList('main');
  $('#h-v2l').onclick=()=>renderReviewList('v2');
  $('#h-port').onclick=()=>{ CFG.mode='portrait'; saveCfg(); applyLayout(); renderHome(); };
  $('#h-land').onclick=()=>{ CFG.mode='landscape'; saveCfg(); applyLayout(); renderHome(); };
}
function AI_INFO(){ const m=window.MJ_AI_WEIGHTS&&window.MJ_AI_WEIGHTS.meta; return m? `${m.games}半荘・${m.decisions}判断。学習に使っていない半荘での一致率 ${m.testAgree}` : '牌譜データ'; }

/* ================= 対局の開始・再開・保存 ================= */
let G=null, REC=null, PEND=null, LOOPING=false, SEL=-1, RSEL=false, PRESEL=null, SUBMENU=null;
let UIS={shanten:false,suji:false,sujiTable:false,open:false,resultOpen:false,menu:false};
let STUDY={}; // スジカウント表（局ごと・相手ごと）
function newId(){ return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7); }
async function newGame(){
  const cur=await Store.loadCurrent();
  if(cur&&cur.rec&&cur.game&&!cur.game.over){ cur.rec.log=cur.game.log; await Store.saveGame(cur.rec); }
  G=new Game({seed:(Math.random()*2147483647)|0,names:CFG.names.slice()});
  REC={id:newId(),createdAt:Date.now(),names:CFG.names.slice(),seed:G.seed,decisions:[],memos:[],finished:false,result:null,log:G.log};
  G.startKyoku();
  UIS={shanten:false,suji:false,sujiTable:false,open:false,resultOpen:false,menu:false}; STUDY={};
  await persist(true);
  startPlay();
}
async function resumeGame(cur){
  try{ G=Game.fromJSON(cur.game); }catch(e){ alert('対局データを復元できませんでした: '+e.message); return; }
  REC=cur.rec; REC.log=G.log;
  UIS={shanten:false,suji:false,sujiTable:false,open:false,resultOpen:false,menu:false}; STUDY={};
  startPlay();
}
function kyokuLabel(){ return G? UI.WIND[G.bakaze]+G.kyoku+'局 '+G.honba+'本場' : ''; }
let lastSave=0, saveTimer=null;
async function persist(force){
  if(!G||!REC||G.review) return;
  const now=Date.now();
  if(!force&&now-lastSave<1500){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>persist(true),1600); return; }
  lastSave=now; clearTimeout(saveTimer);
  REC.kyokuLabel=kyokuLabel();
  const game=G.toJSON();
  await Store.saveCurrent({savedAt:now,label:REC.kyokuLabel,rec:Object.assign({},REC,{log:undefined}),game});
}
async function saveRecord(){ if(!REC||!G||G.review) return; REC.log=G.log; REC.kyokuLabel=kyokuLabel(); await Store.saveGame(Object.assign({},REC,{log:G.log.slice()})); }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'&&SCREEN==='game') persist(true); });
window.addEventListener('pagehide',()=>{ if(SCREEN==='game') persist(true); });

/* ================= 対局の進行 ================= */
function startPlay(){
  show('game'); applyLayout(); renderGame();
  loop();
}
let LGEN=0;
async function loop(){
  const gen=++LGEN, alive=()=>gen===LGEN&&SCREEN==='game'&&G&&!G.review;
  try{
    while(alive()){
      const req=G.request();
      if(req.kind==='need_start'){ G.startKyoku(); STUDY={}; renderGame(); continue; }
      if(req.kind==='end_game'){ await endGame(); return; }
      if(req.kind==='end_kyoku'){
        await persist(true); await saveRecord();
        UIS.resultOpen=true; renderGame();
        const r=await showResult(req.result); if(r===ABORT||!alive()) return;
        UIS.resultOpen=false;
        if(!G.next()){ continue; }
        STUDY={}; await persist(true); renderGame(); continue;
      }
      if(req.kind==='self'||req.kind==='riichi_discard'){
        if(req.seat===HUMAN){
          const a=await humanSelf(req); if(!a||a===ABORT||!alive()) return;
          G.actSelf(a); persist(); renderGame(); continue;
        }
        renderGame();
        const t0=Date.now();
        const d=AI.decide(G.obsFor(req.seat),req.actions);
        const wait=CPU_MS-(Date.now()-t0); if(wait>0) await sleep(wait);
        if(!alive()) return;
        G.actSelf(d.best); persist(); renderGame(); continue;
      }
      if(req.kind==='react'){
        const mine=req.seats.find(x=>x.seat===HUMAN);
        const dec={};
        for(const x of req.seats){ if(x.seat===HUMAN) continue;
          const obs=G.obsFor(x.seat); obs.last={actor:req.from,pai:req.tile};
          dec[x.seat]=AI.decide(obs,x.actions).best; }
        if(mine){ const a=await humanReact(req,mine.actions); if(!a||a===ABORT||!alive()) return; dec[HUMAN]=a; }
        const anyCall=Object.keys(dec).some(s=>+s!==HUMAN&&dec[s].type!=='none');
        if(anyCall){ await sleep(CPU_MS); if(!alive()) return; }
        for(const x of req.seats) G.actReact(x.seat,dec[x.seat]);
        persist(); renderGame(); continue;
      }
    }
  } catch(e){ if(alive()){ console.error(e); alert('エラーが発生しました: '+(e&&e.message)); } }
}
// 評価（和了できるときは和了を最善手にする）
function evalList(obs,actions){
  let list=AI.evaluate(obs,actions);
  const h=list.findIndex(c=>c.action.type==='hora');
  if(h>0){ const x=list.splice(h,1)[0]; x.prob=Math.max(x.prob,0.995); const rest=list.reduce((a,c)=>a+c.prob,0)||1; list.forEach(c=>c.prob=c.prob/rest*(1-x.prob)); list.unshift(x); }
  return list;
}
async function humanSelf(req){
  const K=G.k;
  // リーチ後のツモ切りだけのときは自動
  if(K.riichi[HUMAN]&&req.actions.length===1&&req.actions[0].type==='dahai'){ renderGame(); await sleep(CPU_MS?450:0); return SCREEN==='game'? req.actions[0] : ABORT; }
  const obs=G.obsFor(HUMAN);
  const list=evalList(obs,req.actions);
  PEND={kind:req.kind,obs,actions:req.actions,list,i:G.log.length,memoIds:[],hinted:false};
  SEL=-1; SUBMENU=null;
  if(req.kind==='riichi_discard'&&PRESEL){
    const a=req.actions.find(x=>x.pai===PRESEL)||null; PRESEL=null;
    if(a){ return await judge(PEND,a); }
  }
  if(req.kind!=='riichi_discard') RSEL=false;
  const pr=new Promise(res=>{ PEND.resolve=res; });
  renderGame();
  const choice=await pr;
  if(choice===ABORT) return ABORT;
  return await judge(PEND,choice);
}
async function humanReact(req,actions){
  const obs=G.obsFor(HUMAN); obs.last={actor:req.from,pai:req.tile};
  const list=evalList(obs,actions);
  PEND={kind:'react',obs,actions,list,i:G.log.length,memoIds:[],hinted:false,tile:req.tile,from:req.from,chankan:req.chankan};
  SEL=-1; SUBMENU=null; RSEL=false;
  const pr=new Promise(res=>{ PEND.resolve=res; });
  renderGame();
  const choice=await pr;
  if(choice===ABORT) return ABORT;
  return await judge(PEND,choice);
}
function choose(a){ if(PEND&&PEND.resolve){ const r=PEND.resolve; PEND.resolve=null; r(a); } }
// 何切るクイズ用の問題（解説欄に推奨打牌選定理由を入れる）
function quizOf(n,P,choice,why){
  const q=UI.quizItem(REC.id,n,P.obs,P.list,choice,REC.names,REC.createdAt);
  if(why&&why.length) q.q.explanation='推奨打牌選定理由（Mortal代役AI）'+String.fromCharCode(10)+why.map(x=>'・'+x).join(String.fromCharCode(10));
  return q;
}
function whyHTML(why,title){
  if(!why||!why.length) return '';
  return `<div class="why"><div class="wt">${esc(title||'推奨打牌選定理由')}</div>${why.map(x=>`<div class="wi">・${esc(x)}</div>`).join('')}</div>`;
}
// Mortal代役の判定。違っていたら FALSE を表示して止める（再開ボタンで続行）
async function judge(P,choice){
  const best=P.list[0];
  const key=AI.actKey(choice);
  const mine=P.list.find(c=>AI.actKey(c.action)===key);
  let ok=key===AI.actKey(best.action);
  if(!ok&&mine){ const tol=CFG.judge==='tol10'?0.10:CFG.judge==='tol20'?0.20:0; if(tol&&best.prob-mine.prob<=tol) ok=true; }
  const n=REC.decisions.length;
  const why=AI.explain(P.obs,P.list,ok?null:choice);
  P.why=why;
  const d={n,i:P.i,kind:P.kind,list:P.list.slice(0,12).map(c=>({a:c.action,p:+c.prob.toFixed(5)})),chosen:choice,ok,hinted:P.hinted,at:Date.now(),
    kyoku:kyokuLabel(),memo:P.memoIds.length>0,why};
  if(!ok||d.memo) d.q=quizOf(n,P,choice,why);
  REC.decisions.push(d);
  // メモ（この判断の場面で書いたもの。中断→再開した場合も含む）にこの判断の結果を記録
  const ms=await Store.listMemos();
  for(const m of ms){
    if(m.gameId!==REC.id||m.decision) continue;
    if(P.memoIds.indexOf(m.id)<0&&m.pendingI!==P.i) continue;
    if(!d.memo){ d.memo=true; d.q=d.q||quizOf(n,P,choice,why); }
    m.decision={chosen:choice,ok,n}; m.q=d.q; m.why=why; await Store.saveMemo(m);
  }
  PEND.decided=true;
  if(!ok&&CFG.judge!=='off'){
    const r=await showFalse(P,choice);
    if(r===ABORT){ PEND=null; return ABORT; }
  }
  PEND=null;
  return choice;
}

/* ================= 描画 ================= */
function gameView(){
  const K=G.k;
  return {me:HUMAN,oya:G.oya,bakaze:G.bakaze,kyoku:G.kyoku,honba:G.honba,kyotaku:G.kyotaku,left:G.left(),scores:G.scores.slice(),
    dora:G.doraIndicators(),riichi:K.riichi.slice(),names:G.names,hands:K.hands,counts:K.hands.map(h=>h.length),drawn:K.drawn,
    melds:K.melds,rivers:K.rivers,last:{actor:K.turn}};
}
function renderGame(){
  if(SCREEN!=='game'||!G||!G.k) return;
  layoutGame();
  const K=G.k, v=gameView();
  const open=[false,UIS.open||UIS.resultOpen,UIS.open||UIS.resultOpen,UIS.open||UIS.resultOpen];
  let hl=null;
  if(K.lastDiscard){ const r=K.rivers[K.lastDiscard.actor]; if(r.length) hl={seat:K.lastDiscard.actor,idx:r.length-1,color:PEND&&PEND.kind==='react'?'#ff4d4d':'#ffd166'}; }
  $('#g-board').innerHTML=UI.boardSVG(v,{open,skipHand:[true,false,false,false],skipMelds:[true,false,false,false],hl});
  renderHand(); renderActs(); renderTools(); renderInfo();
}
function myHandOrder(){
  const K=G.k, hand=K.hands[HUMAN].slice(), dr=K.drawn[HUMAN];
  let sep=null;
  if(dr&&hand.length%3===2){ const i=hand.lastIndexOf(dr); if(i>=0){ hand.splice(i,1); sep=dr; } }
  const s=MJ.sortTiles(hand); if(sep) s.push(sep);
  return {tiles:s,sep:!!sep};
}
function allowedDiscards(){
  if(!PEND||PEND.kind==='react') return null;
  if(RSEL||PEND.kind==='riichi_discard') return new Set(G.discardable(HUMAN,true));
  return new Set(PEND.actions.filter(a=>a.type==='dahai').map(a=>a.pai));
}
function renderHand(){
  const {tiles,sep}=myHandOrder();
  const allow=allowedDiscards();
  // シャンテン数表示がオンのとき、各打牌の受け入れを牌の上に小さく出す
  let ub=null;
  if(UIS.shanten&&tiles.length%3===2){
    ub={}; const obs=G.obsFor(HUMAN), vis=AI.visibleCounts(obs), c=MJ.counts(obs.hand);
    for(const r of MJ.discardTable(c,obs.melds[HUMAN].length,vis)) ub[r.k]=r;
  }
  $('#g-hand').innerHTML=tiles.map((t,i)=>{
    const can=allow? allow.has(t):false;
    const cls=['ht']; if(sep&&i===tiles.length-1) cls.push('gap'); if(i===SEL) cls.push('sel'); if(allow&&!can) cls.push('ng');
    let lab='';
    if(ub){ const r=ub[MJ.kind(t)]; if(r) lab=`<div class="ub">${r.shanten<=0?'聴':r.shanten+'向'}<br>${r.total}</div>`; }
    return `<div class="${cls.join(' ')}" data-i="${i}">${lab}${UI.tileImg(t)}</div>`;
  }).join('')+meldsHTML();
  $$('#g-hand .ht').forEach(el=>el.onclick=()=>tapTile(+el.dataset.i));
}
// 自分の副露は手牌の右に並べる（鳴いた牌は横向き。上家から=左、対面から=真ん中、下家から=右）
function meldsHTML(){
  const ms=(G.k.melds&&G.k.melds[HUMAN])||[]; if(!ms.length) return '';
  const img=(t,side)=>`<span class="mt${side?' side':''}">${UI.tileImg(t)}</span>`;
  return `<div class="hm">`+ms.map((m,mi)=>{
    let h='';
    if(m.type==='ankan'){ h=img('back')+img(m.tiles[1])+img(m.tiles[2])+img('back'); }
    else {
      const base=m.type==='kakan'? m.tiles.slice(0,3) : m.tiles.slice();
      const called=m.pai||base[base.length-1]; const ci=base.lastIndexOf(called); const rest=base.slice(); if(ci>=0) rest.splice(ci,1);
      rest.sort((a,b)=>MJ.tkey(a)-MJ.tkey(b));
      const rel=(m.from-HUMAN+4)%4; const pos= rel===3?0 : rel===2?1 : rest.length;
      const seq=rest.map(t=>img(t,false)); seq.splice(pos,0,img(called,true)+(m.type==='kakan'?img(m.tiles[3],true):''));
      h=seq.join('');
    }
    return (mi?'<span class="gapm"></span>':'')+h; }).join('')+`</div>`;
}
function tapTile(i){
  const {tiles}=myHandOrder(); const t=tiles[i];
  const allow=allowedDiscards();
  if(!allow||!allow.has(t)){ SEL=i; renderHand(); renderInfo(); return; }
  if(CFG.tap==='one'||SEL===i){ discardTile(t); return; }
  SEL=i; renderHand(); renderInfo();
}
function discardTile(t){
  if(!PEND) return;
  if(RSEL){ RSEL=false; PRESEL=t; SEL=-1; choose(PEND.actions.find(a=>a.type==='reach')); return; }
  const a=PEND.actions.find(x=>x.type==='dahai'&&x.pai===t); if(!a) return;
  SEL=-1; choose(a);
}
function renderActs(){
  const box=$('#g-acts'); const K=G.k;
  let msg='', btns=[];
  if(PEND&&PEND.resolve&&!PEND.decided){
    const A=PEND.actions;
    if(SUBMENU){
      msg='どれで鳴きますか？';
      btns=SUBMENU.map((a,i)=>`<button class="a-call" data-sub="${i}" style="padding:4px 6px"><span style="display:flex;gap:1px">${a.consumed.map(t=>`<span style="width:20px;display:block">${UI.tileImg(t)}</span>`).join('')}</span></button>`);
      btns.push(`<button class="a-skip" data-x="back">戻る</button>`);
    } else if(PEND.kind==='react'){
      const who=UI.REL[(PEND.from-HUMAN+4)%4];
      msg=`${who}が ${MJ.tileName(PEND.tile)} ${PEND.chankan?'を加槓':'を切りました'}`;
      if(A.some(a=>a.type==='hora')) btns.push(`<button class="a-hora" data-t="hora">ロン</button>`);
      if(A.some(a=>a.type==='pon')) btns.push(`<button class="a-call" data-t="pon">ポン</button>`);
      if(A.some(a=>a.type==='chi')) btns.push(`<button class="a-call" data-t="chi">チー</button>`);
      if(A.some(a=>a.type==='daiminkan')) btns.push(`<button class="a-call" data-t="daiminkan">カン</button>`);
      btns.push(`<button class="a-skip" data-t="none">スキップ</button>`);
    } else if(RSEL){
      msg='リーチ：切る牌を選んでください';
      btns.push(`<button class="a-skip" data-x="rcancel">取消</button>`);
    } else {
      msg=PEND.kind==='riichi_discard'?'リーチ宣言牌を選んでください':(K.riichi[HUMAN]?'ツモ切り／和了を選んでください':(CFG.tap==='one'?'切る牌をタップ':'切る牌を2回タップ'));
      if(A.some(a=>a.type==='hora')) btns.push(`<button class="a-hora" data-t="hora">ツモ</button>`);
      if(A.some(a=>a.type==='reach')) btns.push(`<button class="a-reach" data-t="reach">リーチ</button>`);
      if(A.some(a=>a.type==='ankan'||a.type==='kakan')) btns.push(`<button class="a-call" data-t="kan">カン</button>`);
      if(A.some(a=>a.type==='ryukyoku')) btns.push(`<button class="a-skip" data-t="ryukyoku">九種九牌</button>`);
      if(K.riichi[HUMAN]&&A.some(a=>a.type==='hora')) btns.push(`<button class="a-skip" data-t="tsumogiri">ツモ切り</button>`);
    }
  } else {
    const t=K.turn; msg= t===HUMAN? '' : (UI.REL[(t-HUMAN+4)%4]+'の番');
  }
  $('#g-msg').textContent=msg;
  box.innerHTML=btns.join('');
  $$('#g-acts [data-t]').forEach(b=>b.onclick=()=>actButton(b.dataset.t));
  $$('#g-acts [data-sub]').forEach(b=>b.onclick=()=>{ const a=SUBMENU[+b.dataset.sub]; SUBMENU=null; choose(a); });
  $$('#g-acts [data-x]').forEach(b=>b.onclick=()=>{ if(b.dataset.x==='back'){ SUBMENU=null; } if(b.dataset.x==='rcancel'){ RSEL=false; } renderGame(); });
}
function actButton(t){
  if(!PEND) return;
  const A=PEND.actions;
  if(t==='reach'){ RSEL=true; SEL=-1; renderGame(); return; }
  if(t==='tsumogiri'){ const a=A.find(x=>x.type==='dahai'); if(a) choose(a); return; }
  if(t==='kan'){ const ks=A.filter(a=>a.type==='ankan'||a.type==='kakan'); if(ks.length===1) return choose(ks[0]);
    SUBMENU=ks.map(a=>Object.assign({},a,{consumed:a.type==='ankan'?a.consumed:[a.pai]})); renderActs(); return; }
  const list=A.filter(a=>a.type===t);
  if(list.length>1&&(t==='chi'||t==='pon')){ SUBMENU=list; renderActs(); return; }
  if(list.length) choose(list[0]);
}
// SUBMENU からカンを選んだとき、元の行動に戻す
const _choose=choose;

/* ---------- ツール ---------- */
/* 9つの機能はメニューに集約（初期は非表示。「メニュー」ボタンで開く） */
function renderTools(){
  const b=(id,label,on)=>`<button id="${id}" class="${on?'on':''}">${label}</button>`;
  $('#g-tools').innerHTML=
    b('t-hint','正解が<br>わからない',false)+b('t-memo','メモ記入',false)+b('t-sh','シャンテン数<br>＆待ち表示',UIS.shanten)+
    b('t-suji','今スジが何本<br>通っているか？',UIS.suji)+b('t-sujit','スジカウント表',UIS.sujiTable)+b('t-open','相手の手牌<br>OPEN',UIS.open)+
    b('t-port','縦画面モード',CFG.mode==='portrait')+b('t-land','横画面モード',CFG.mode==='landscape')+b('t-menu','中断・終了',false);
  const menu=$('#g-menu'), mb=$('#g-menubtn');
  menu.classList.toggle('on',!!UIS.menu); mb.classList.toggle('on',!!UIS.menu);
  mb.textContent=UIS.menu?'閉じる':'メニュー';
  mb.onclick=()=>{ UIS.menu=!UIS.menu; renderTools(); };
  $('#g-menuclose').onclick=()=>{ UIS.menu=false; renderTools(); };
  const go=fn=>()=>{ UIS.menu=false; renderTools(); fn(); };
  $('#t-hint').onclick=go(showHint);
  $('#t-memo').onclick=go(showMemo);
  $('#t-sh').onclick=go(()=>{ UIS.shanten=!UIS.shanten; renderGame(); });
  $('#t-suji').onclick=go(()=>{ UIS.suji=!UIS.suji; renderGame(); });
  $('#t-sujit').onclick=go(()=>{ UIS.sujiTable=!UIS.sujiTable; renderGame(); });
  $('#t-open').onclick=go(()=>{ UIS.open=!UIS.open; renderGame(); });
  $('#t-port').onclick=go(()=>{ CFG.mode='portrait'; saveCfg(); applyLayout(); renderGame(); });
  $('#t-land').onclick=go(()=>{ CFG.mode='landscape'; saveCfg(); applyLayout(); renderGame(); });
  $('#t-menu').onclick=go(showMenu);
}
function tilesRow(list,big){ return list.map(t=>`<span class="tw${big?' big':''}">${UI.tileImg(t)}</span>`).join(''); }
function renderInfo(){
  const box=$('#g-info'); let h='';
  const obs=G.obsFor(HUMAN);
  if(UIS.shanten) h+=shantenPanel(obs);
  if(UIS.suji) h+=sujiPanel(obs);
  if(UIS.sujiTable) h+=sujiTablePanel(obs);
  if(!h&&!(GL&&GL.land)) h=`<div class="small muted" style="padding:4px 2px">${esc(lastEventsText())}</div>`;
  box.innerHTML=h;
  $$('#g-info [data-close]').forEach(b=>b.onclick=()=>{ UIS[b.dataset.close]=false; renderGame(); });
  bindSujiTable();
}
function lastEventsText(){
  const L=G.log; const out=[];
  for(let i=L.length-1;i>=0&&out.length<3;i--){ const e=L[i]; if(e.type==='tsumo'&&e.actor!==HUMAN) continue; if(e.type==='start_kyoku'){ out.push(kyokuLabel()+' 開始'); break; }
    if(e.type==='tsumo'||e.type==='end_kyoku') continue; out.push(UI.eventText(e,G.names)); }
  return out.reverse().join(' ／ ');
}
function shantenPanel(obs){
  const c=MJ.counts(obs.hand), m=obs.melds[HUMAN].length, vis=AI.visibleCounts(obs);
  const n=obs.hand.length;
  let h=`<div class="ipanel"><h3><span>シャンテン数＆待ち（受け入れ牌）</span><button class="btn-g" data-close="shanten">×</button></h3>`;
  if(n%3===2){
    const s=MJ.shanten(c,m);
    if(s===-1) h+=`<div>和了形です</div>`;
    const rows=MJ.discardTable(c,m,vis).sort((a,b)=>a.shanten-b.shanten||b.total-a.total);
    const selT=SEL>=0? myHandOrder().tiles[SEL]:null;
    h+=`<div class="small muted">今：${s<=0?(s===-1?'和了':'テンパイ'):s+'向聴'}　打牌ごとの受け入れ（多い順）</div>`;
    rows.slice(0,8).forEach(r=>{
      const t=MJ.kname(r.k);
      const hit=selT&&MJ.kind(selT)===r.k;
      h+=`<div class="trow" style="${hit?'background:rgba(255,209,102,.12)':''}"><span class="tw big">${UI.tileImg(t)}</span><b style="width:66px">打${MJ.tileName(t)}</b>
        <span style="width:60px">${r.shanten===0?'テンパイ':r.shanten+'向聴'}</span><span style="width:52px">${r.tiles.length}種${r.total}枚</span>${tilesRow(r.tiles.map(x=>MJ.kname(x.k)))}</div>`;
    });
  } else {
    const s=MJ.shanten(c,m);
    if(s===0){
      const ws=MJ.waits(c,m), own=new Set(obs.rivers[HUMAN].map(d=>MJ.kind(d.pai)));
      const fur=ws.some(k=>own.has(k));
      h+=`<div><b>テンパイ</b>${fur?' <span class="badge b-false">フリテン</span>':''}　待ち：${ws.map(k=>MJ.tileName(MJ.kname(k))+'（残'+Math.max(0,4-vis[k])+'）').join('、')||'なし'}</div>`;
      h+=`<div class="trow">${tilesRow(ws.map(k=>MJ.kname(k)),true)}</div>`;
    } else {
      const u=MJ.ukeire(c,m,vis);
      h+=`<div><b>${s}向聴</b>　受け入れ ${u.tiles.length}種${u.total}枚</div><div class="trow">${tilesRow(u.tiles.map(x=>MJ.kname(x.k)),true)}</div>`;
    }
  }
  return h+'</div>';
}
function sujiPanel(obs){
  let h=`<div class="ipanel"><h3><span>今スジが何本通っているか？（両面待ちの筋 全18本）</span><button class="btn-g" data-close="suji">×</button></h3>`;
  for(let r=1;r<4;r++){
    const o=(HUMAN+r)%4, list=UI.passedSuji(obs,o), n=list.filter(x=>x.passed).length;
    const riichi=obs.riichiSeq[o]>=0;
    h+=`<div style="margin:4px 0"><b>${UI.REL[r]}</b>${riichi?' <span class="badge b-false">リーチ</span>':''}　通っている筋 <b style="font-size:16px;color:var(--gold)">${n}</b>／18本　残り${18-n}本</div><div>`;
    ['m','p','s'].forEach(su=>{
      h+=`<div class="small">${{m:'萬',p:'筒',s:'索'}[su]}：`+list.filter(x=>x.suit===su).map(x=>`<span class="chip ${x.passed?'on':'off'}">${x.a}-${x.b}</span>`).join('')+'</div>';
    });
    h+='</div>';
  }
  return h+`<div class="small muted">緑＝通っている（どちらかが現物またはリーチ後に通過）、赤＝まだ通っていない</div></div>`;
}
function studyState(){
  const key=G.kyokuNo; STUDY[key]=STUDY[key]||{opp:1,ans:false,data:{}};
  const S=STUDY[key]; S.data[S.opp]=S.data[S.opp]||{count:0,cells:{}}; return S;
}
function sujiTablePanel(obs){
  const S=studyState(), D=S.data[S.opp];
  const o=(HUMAN+S.opp)%4; const truth=UI.passedSuji(obs,o);
  let h=`<div class="ipanel"><h3><span>自主学習用スジカウント表</span><button class="btn-g" data-close="sujiTable">×</button></h3>
    <div class="seg" style="margin-bottom:6px">${[1,2,3].map(r=>`<button data-opp="${r}" class="${S.opp===r?'on':''}">${UI.REL[r]}${obs.riichiSeq[(HUMAN+r)%4]>=0?'★':''}</button>`).join('')}</div>
    <div class="small muted center">通ったと思う筋の本数を数えましょう</div>
    <div class="counter"><button id="st-m">−</button><span class="n">${D.count}</span><button id="st-p">＋</button><button id="st-r" style="width:auto;font-size:13px">0に戻す</button></div>
    <div class="small muted">スジ対応表（タップで ○→×→空白）</div>
    <table class="suji"><tr><th></th>${UI.SUJI.map(s=>`<th>${s[0]}-${s[1]}</th>`).join('')}</tr>`;
  ['m','p','s'].forEach((su,si)=>{
    h+=`<tr><th>${{m:'萬',p:'筒',s:'索'}[su]}</th>`+UI.SUJI.map((s,j)=>{
      const k=su+j, v=D.cells[k]||'';
      const ans=S.ans&&truth[si*6+j].passed;
      return `<td class="${ans?'ans-on':''}"><button data-cell="${k}">${v}</button></td>`; }).join('')+'</tr>';
  });
  h+=`</table><div class="row" style="margin-top:6px"><button class="grow ${S.ans?'btn-p':''}" id="st-ans">${S.ans?'答え合わせ中（緑＝正解の通過筋）':'答え合わせ'}</button><button id="st-clr">表を消す</button></div>`;
  if(S.ans){ const n=truth.filter(x=>x.passed).length; h+=`<div class="small" style="margin-top:4px">正解：${n}本（あなたのカウント ${D.count}本）</div>`; }
  return h+'</div>';
}
function bindSujiTable(){
  if(!UIS.sujiTable) return;
  const S=studyState(), D=S.data[S.opp];
  $$('[data-opp]').forEach(b=>b.onclick=()=>{ S.opp=+b.dataset.opp; renderInfo(); });
  const m=$('#st-m'), p=$('#st-p'), r=$('#st-r');
  if(m) m.onclick=()=>{ D.count=Math.max(0,D.count-1); renderInfo(); };
  if(p) p.onclick=()=>{ D.count=Math.min(18,D.count+1); renderInfo(); };
  if(r) r.onclick=()=>{ D.count=0; renderInfo(); };
  $$('[data-cell]').forEach(b=>b.onclick=()=>{ const k=b.dataset.cell, v=D.cells[k]||''; D.cells[k]= v===''?'○':v==='○'?'×':''; renderInfo(); });
  const a=$('#st-ans'); if(a) a.onclick=()=>{ S.ans=!S.ans; renderInfo(); };
  const c=$('#st-clr'); if(c) c.onclick=()=>{ D.cells={}; D.count=0; renderInfo(); };
}

/* ---------- オーバーレイ（縦は手牌から下、横は右側。卓は見えたまま） ---------- */
function overlay(html,binds){
  closeOverlay();
  UIS.menu=false; const mn=$('#g-menu'); if(mn) mn.classList.remove('on');
  const d=document.createElement('div'); d.className='ov'; d.id='ov'; d.innerHTML=html;
  $('#g-wrap').appendChild(d);
  layoutGame();
  if(binds) binds(d);
  return d;
}
function closeOverlay(){ const o=$('#ov'); if(o) o.remove(); }
function handBarsHTML(P,chosen){
  // 打牌の判断なら、手牌の上に Mortal 風の確率バーを出す
  if(!P.list.some(c=>c.action.type==='dahai')) return '';
  const hand=P.obs.hand.slice(), dr=P.obs.drawn;
  let sep=null; if(dr&&hand.length%3===2){ const i=hand.lastIndexOf(dr); if(i>=0){ hand.splice(i,1); sep=dr; } }
  const tiles=MJ.sortTiles(hand); if(sep) tiles.push(sep);
  const bestKey=AI.actKey(P.list[0].action), chKey=chosen?AI.actKey(chosen):null;
  const max=Math.max.apply(null,P.list.map(c=>c.prob));
  const used={};
  return `<div class="hbar">`+tiles.map((t,i)=>{
    const c=P.list.find(x=>x.action.type==='dahai'&&x.action.pai===t);
    const first=!used[t]; used[t]=1;
    const p=c&&first? c.prob:0;
    const k='d:'+t;
    const cls=['c']; if(first&&k===bestKey) cls.push('best'); if(first&&k===chKey&&k!==bestKey) cls.push('mine');
    return `<div class="${cls.join(' ')}"${sep&&i===tiles.length-1?' style="margin-left:6px"':''}><div class="p">${p>=0.01?Math.round(p*100)+'%':''}</div><div class="b" style="height:${p?Math.max(2,p/max*44):0}px"></div>${UI.tileImg(t)}</div>`;
  }).join('')+`</div>`;
}
function decisionTitle(P){
  if(P.kind==='react') return UI.REL[(P.from-HUMAN+4)%4]+'の '+MJ.tileName(P.tile)+' に対する判断';
  if(P.kind==='riichi_discard') return 'リーチ宣言牌';
  return P.list.some(c=>c.action.type==='reach')? 'リーチ／打牌の判断' : '打牌の判断';
}
function showFalse(P,choice){
  return new Promise(res=>{
    const best=P.list[0];
    overlay(`<div class="ovb">
      <div class="row"><span class="false">FALSE</span><span class="grow"></span><span class="small muted">${esc(decisionTitle(P))}</span></div>
      <div style="margin-top:6px">あなた：<b style="color:#ff8a8a">${esc(UI.actionText(choice,HUMAN))}</b>　${P.review&&!P.sub?'Mortal（本物）':P.sub?'Mortal代役（この半荘はMortal未解析）':'Mortal代役'}の推奨：<b style="color:var(--accent)">${esc(UI.actionText(best.action,HUMAN))}</b>（${(best.prob*100).toFixed(1)}%）</div>
      ${P.review&&P.actual?`<div class="small muted">実戦（実際の牌譜）：${esc(UI.actionText(P.actual,HUMAN))}${AI.actKey(P.actual)===AI.actKey(best.action)?'（実戦では正解していました）':''}</div>
      ${AI.actKey(P.actual)!==AI.actKey(choice)?`<div class="small" style="color:var(--gold)">この先は実戦の手（${esc(UI.actionText(P.actual,HUMAN))}）で進みます（本物の Mortal の解析と同じ状況を保つため）</div>`:''}`:''}
      ${whyHTML(P.why)}
      ${handBarsHTML(P,choice)}
      ${UI.candHTML(P.list,{chosen:choice,me:HUMAN,max:10})}
    </div>
    <div class="ovf"><button class="btn-g" id="ov-memo" style="flex:.6">メモ記入</button><button class="btn-p" id="ov-go">再開</button></div>`,d=>{
      $('#ov-go',d).onclick=()=>{ closeOverlay(); res(true); };
      $('#ov-memo',d).onclick=()=>showMemo(()=>showFalse(P,choice).then(res));
    });
  });
}
function showHint(){
  if(!PEND||!PEND.resolve){ toast('今はあなたの判断の番ではありません'); return; }
  PEND.hinted=true;
  const P=PEND;
  overlay(`<div class="ovb">
    <div class="row"><b style="font-size:16px">${P.review&&!P.sub?'Mortal（本物）の解析':P.sub?'Mortal代役の評価（この半荘はMortal未解析）':'Mortal代役の評価'}</b><span class="grow"></span><span class="small muted">${esc(decisionTitle(P))}</span></div>
    <div style="margin-top:4px">推奨：<b style="color:var(--accent)">${esc(UI.actionText(P.list[0].action,HUMAN))}</b>（${(P.list[0].prob*100).toFixed(1)}%）</div>
    ${whyHTML(AI.explain(P.obs,P.list,null),'推奨打牌選定理由（次点の '+UI.actionText((P.list[1]||P.list[0]).action,HUMAN)+' との比較）')}
    ${handBarsHTML(P,null)}
    ${UI.candHTML(P.list,{me:HUMAN,max:10})}
  </div><div class="ovf"><button class="btn-p" id="ov-close">閉じる</button></div>`,d=>{ $('#ov-close',d).onclick=()=>{ closeOverlay(); renderGame(); }; });
}
function showMemo(after){
  overlay(`<div class="ovb">
    <b style="font-size:16px">メモ記入</b>
    <p class="small muted" style="margin:4px 0">この局面を「要チェック」に登録します。ホーム画面の「要チェック」からあとでまとめて確認できます。</p>
    <textarea id="memo-t" rows="5" placeholder="気になったこと・迷った理由など"></textarea>
  </div><div class="ovf"><button class="btn-g" id="memo-c">キャンセル</button><button class="btn-p" id="memo-s">保存</button></div>`,d=>{
    const ta=$('#memo-t',d); setTimeout(()=>{ try{ ta.focus(); }catch(e){} },50);
    $('#memo-c',d).onclick=()=>{ closeOverlay(); if(typeof after==='function') after(); else renderGame(); };
    $('#memo-s',d).onclick=async()=>{ await saveMemo(ta.value.trim()); closeOverlay(); toast('要チェックに登録しました'); if(typeof after==='function') after(); else renderGame(); };
  });
}
async function saveMemo(text){
  const id=newId();
  const P=PEND;
  const view=JSON.parse(JSON.stringify(gameView()));
  const m={id,gameId:REC.id,createdAt:Date.now(),text:text||'（メモなし）',checked:false,kyokuLabel:kyokuLabel()+(G.review?'（復習半荘）':''),logIndex:G.log.length,view,
    hand:G.k.hands[HUMAN].slice(),drawn:G.k.drawn[HUMAN],
    list:P? P.list.slice(0,12).map(c=>({a:c.action,p:+c.prob.toFixed(5)})) : null, title:P? decisionTitle(P):'局面'};
  if(P&&P.decided&&REC.decisions.length){ const d=REC.decisions[REC.decisions.length-1]; m.decision={chosen:d.chosen,ok:d.ok,n:d.n};
    d.memo=true; if(!d.q) d.q=quizOf(d.n,P,d.chosen,d.why); m.q=d.q; m.why=d.why; }
  else if(P){ P.memoIds.push(id); m.pendingI=P.i; }
  REC.memos.push(id);
  await Store.saveMemo(m);
  await persist(true);
}
function showMenu(){
  if(G&&G.review) return rvMenu();
  overlay(`<div class="ovb"><b style="font-size:16px">メニュー</b>
    <p class="small muted">${esc(kyokuLabel())}</p>
    <button class="hbtn" id="m-home">中断してホームへ（続きから再開できます）</button>
    <button class="hbtn" id="m-logs">牌譜一覧を見る（対局は中断）</button>
    <button class="hbtn btn-d" id="m-end">この半荘をやめる（ここまでの牌譜は保存）</button>
  </div><div class="ovf"><button class="btn-p" id="m-close">閉じる</button></div>`,d=>{
    $('#m-close',d).onclick=()=>{ closeOverlay(); };
    $('#m-home',d).onclick=async()=>{ closeOverlay(); await persist(true); await saveRecord(); renderHome(); };
    $('#m-logs',d).onclick=async()=>{ closeOverlay(); await persist(true); await saveRecord(); renderLogs(); };
    $('#m-end',d).onclick=async()=>{ if(!confirm('この半荘をやめますか？（牌譜は保存されます）')) return; closeOverlay(); await saveRecord(); await Store.clearCurrent(); G=null; REC=null; PEND=null; renderHome(); };
  });
}
function showResult(r){
  return new Promise(res=>{
    const names=G.names;
    let h='<div class="ovb">';
    if(r.type==='hora'){
      for(const w of r.wins){
        const tsumo=w.actor===w.target;
        h+=`<div style="margin-bottom:10px"><div style="font-size:17px;font-weight:900">${esc(names[w.actor])} ${tsumo?'ツモ':'ロン'}${tsumo?'':'（'+esc(names[w.target])+'から）'}</div>
          <div class="res-hand">${w.hand.map(t=>`<span class="tw">${UI.tileImg(t)}</span>`).join('')}${tsumo?'':`<span class="tw" style="margin-left:6px">${UI.tileImg(w.pai)}</span>`}
          ${w.melds.map(m=>`<span style="margin-left:6px;display:flex;gap:1px">${m.tiles.map(t=>`<span class="tw" style="width:20px">${UI.tileImg(t)}</span>`).join('')}</span>`).join('')}</div>
          <div class="small">${w.yaku.map(y=>esc(y[0])+' '+(y[2]?'役満':y[1]+'翻')).join('　')}</div>
          <div><b>${w.yakuman?'':w.fu+'符'}${w.yakuman?'':w.han+'翻'} ${esc(w.limit||'')} ${w.points}点</b></div>
          ${w.ura_markers&&w.ura_markers.length?`<div class="small muted row">裏ドラ表示 ${w.ura_markers.map(t=>`<span class="tw" style="width:18px;display:inline-block">${UI.tileImg(t)}</span>`).join('')}</div>`:''}</div>`;
      }
    } else {
      h+=`<div style="font-size:17px;font-weight:900">流局（${esc(r.reason)}）</div>`;
      if(r.tenpai) h+=`<div class="small">テンパイ：${r.tenpai.map((t,i)=>t?esc(names[i]):null).filter(Boolean).join('、')||'なし'}</div>`;
    }
    h+=`<table style="width:100%;margin-top:8px;font-size:14px">`+[0,1,2,3].map(s=>`<tr><td>${esc(names[s])}</td><td style="text-align:right">${G.scores[s]}</td><td style="text-align:right;color:${r.deltas[s]>0?'var(--accent)':r.deltas[s]<0?'#ff8a8a':'var(--muted)'}">${r.deltas[s]>0?'+':''}${r.deltas[s]||''}</td></tr>`).join('')+`</table>`;
    h+='</div><div class="ovf"><button class="btn-g" id="r-memo" style="flex:.6">メモ記入</button><button class="btn-p" id="r-next">'+(G.over?'結果へ':'次の局へ')+'</button></div>';
    overlay(h,d=>{ $('#r-next',d).onclick=()=>{ closeOverlay(); res(true); }; $('#r-memo',d).onclick=()=>showMemo(()=>showResult(r).then(res)); });
  });
}
async function endGame(){
  REC.finished=true; REC.result=G.result; await saveRecord(); await Store.clearCurrent();
  const r=G.result, names=G.names;
  const dec=REC.decisions, f=dec.filter(d=>!d.ok).length;
  UIS.resultOpen=true; renderGame();
  overlay(`<div class="ovb"><div style="font-size:18px;font-weight:900">対局終了</div>
    <table style="width:100%;margin:8px 0;font-size:15px">${r.order.map((s,i)=>`<tr><td>${i+1}位</td><td>${esc(names[s])}</td><td style="text-align:right">${r.scores[s]}</td><td style="text-align:right">${r.final[s]>0?'+':''}${r.final[s]}</td></tr>`).join('')}</table>
    <div>あなたの判断 ${dec.length}回 ／ FALSE ${f}回（Mortal代役との一致率 ${dec.length?((1-f/dec.length)*100).toFixed(1):'-'}%）</div>
  </div><div class="ovf"><button class="btn-g" id="e-log">牌譜を見る</button><button class="btn-g" id="e-home">ホーム</button><button class="btn-p" id="e-new">もう1半荘</button></div>`,d=>{
    const id=REC.id;
    $('#e-log',d).onclick=()=>{ closeOverlay(); openViewer(id); };
    $('#e-home',d).onclick=()=>{ closeOverlay(); renderHome(); };
    $('#e-new',d).onclick=()=>{ closeOverlay(); newGame(); };
  });
}

/* ================= 復習半荘 =================
   共有された牌譜（local/review-data.js）の局を、配牌・ツモ・他家の打牌まで実際の牌譜どおりに再現する。
   あなたの判断の場面では本物の Mortal の評価と照合し、違えば FALSE。判断のあとも局は実際の牌譜どおりに進む
   （Mortal の解析と同じ状況を保つため）。局は、点数状況・順位・場・親の位置が近いものを複数の牌譜から選ぶ。 */
const RVKEY='ml.review.v1';
let RVGEN=0; // 復習半荘の世代（新しく始めたら古い進行処理は止まる）
// 復習半荘のデータ（約6MB）は使うときだけ読み込む（オフラインでも Service Worker の保存分から読める）
async function loadReviewData(){
  if(!window.ML_REVIEW&&!await new Promise(res=>{ const sc=document.createElement('script'); sc.src='local/review-data.js';
    sc.onload=()=>res(!!window.ML_REVIEW); sc.onerror=()=>res(false); document.body.appendChild(sc); })) return false;
  await rvMergeExtras();
  return true;
}
/* 何切るクイズの一覧から「復習半荘モードに追加」した半荘を、復習半荘（main）の末尾に足す。
   追加した順に後ろへ足すので、途中の復習半荘の局の番号は変わらない。すでに牌譜データにある半荘は復習半荘（main）に移すだけ */
const RVEXTRA=new Set();
async function rvMergeExtras(){
  const R=window.ML_REVIEW; let xs=[];
  try{ xs=await Store.listReviewExtras(); }catch(e){}
  const byId=new Map(R.games.map((g,i)=>[g.id,i]));
  let n=0;
  for(const x of xs){
    if(RVEXTRA.has(x.id)) continue;
    RVEXTRA.add(x.id); n++;
    const have=byId.get(x.id);
    if(have!=null){ const g=R.games[have]; if(g.src!=='main'){ g.src='main'; g.added=1; } if(x.tenhou&&!g.tenhou) g.tenhou=x.tenhou; continue; }
    if(!x.kyokus) continue; // 牌譜データにある前提で印だけ付けたもの（牌譜データから消えていれば出せない）
    const gi=R.games.length, base=R.kyokus.length;
    R.games.push({id:x.id,pid:x.pid,src:'main',tenhou:x.tenhou||undefined,added:1});
    x.kyokus.forEach(K=>R.kyokus.push(Object.assign({},K,{g:gi,nx:K.nx<0?-1:K.nx+base})));
  }
  if(n){ for(const k in RVRANK) delete RVRANK[k]; RVSIG=null; }
}
let RV=null;
const rvPool=()=>(window.ML_REVIEW&&window.ML_REVIEW.kyokus)||[];
function rvSaved(){ try{ return JSON.parse(localStorage.getItem(RVKEY)||'null'); }catch(e){ return null; } }
function rvSetSaved(v){ try{ if(v) localStorage.setItem(RVKEY,JSON.stringify(v)); else localStorage.removeItem(RVKEY); }catch(e){} }
const chunks=str=>{ const a=[]; for(let i=0;i<str.length;i+=2) a.push(str.slice(i,i+2)); return a; };
// あなた（pid）を席0にした相対の点数・順位・自風
function rvRel(K){
  const s=[0,1,2,3].map(i=>K.s[(i+K.pid)%4]);
  let rank=0; for(let i=1;i<4;i++) if(s[i]>s[0]) rank++;
  return {wind:(K.pid-K.o+4)%4,s,rank};
}
const RVDONE='ml.review.done.v1';
function rvDone(){ try{ return new Set(JSON.parse(localStorage.getItem(RVDONE)||'[]')); }catch(e){ return new Set(); } }
function rvMarkDone(g){ const d=rvDone(); d.add(g); try{ localStorage.setItem(RVDONE,JSON.stringify([...d])); }catch(e){} }
/* 出題順: 実戦で「Mortal の推奨率が20%以下の手」を選んだ回数が多い半荘から順に（一巡したら最初に戻る）
   回数が同じなら、推奨手との確率差の合計が大きい半荘を先に */
const LOWP=0.2;
const RVNEXTK=set=>set==='v2'?'ml.review.next.v2':'ml.review.next.main';
const RVRANK={};
const rvSetName=set=>set==='v2'?'学習用牌譜（v2）':'復習半荘';
function rvRanking(set){
  set=set||'main';
  if(RVRANK[set]) return RVRANK[set];
  const games=window.ML_REVIEW.games, pool=rvPool(), by=new Map();
  pool.forEach((K,i)=>{
    if((games[K.g].src||'main')!==set) return;
    let g=by.get(K.g); if(!g){ g={g:K.g,first:-1,low:0,loss:0,dec:0,kyokus:0}; by.set(K.g,g); }
    if(K.ki===0) g.first=i; g.kyokus++;
    for(const e of K.en){
      if(!e.l||e.l.indexOf(' ')<0) continue; // 選択肢が1つの場面は除く
      g.dec++;
      if(e.a===e.e) continue;
      const m=new Map(e.c.split('|').map(x=>{ const [c,p]=x.split(':'); return [c,+p]; }));
      const pa=m.has(e.a)? m.get(e.a) : 0, pe=m.has(e.e)? m.get(e.e) : 1;
      if(pa<=LOWP){ g.low++; g.loss+=pe-pa; }
    }
  });
  RVRANK[set]=[...by.values()].filter(x=>x.first>=0).sort((a,b)=>b.low-a.low||b.loss-a.loss||a.g-b.g);
  return RVRANK[set];
}
function rvNextPos(set){ try{ return +(localStorage.getItem(RVNEXTK(set))||0)||0; }catch(e){ return 0; } }
function rvPickFirst(gi,set){
  const R=rvRanking(set); if(!R.length) return -1;
  if(gi!=null){ const x=R.find(r=>r.g===gi); return x? x.first : -1; }
  const pos=rvNextPos(set)%R.length;
  try{ localStorage.setItem(RVNEXTK(set),String((pos+1)%R.length)); }catch(e){}
  return R[pos].first;
}
// 前の局の「実際の続き」の状況（場・局・本場・点数・順位・自風）に近い局を選ぶ
function rvPickNext(prev){
  const P=rvPool()[prev]; return P&&P.nx>=0? P.nx : -1;
}
// （未使用）似た状況の局を選ぶ方式
function rvPickSimilar(prev,used){
  const pool=rvPool(), P=pool[prev]; if(!P||P.nx<0) return -1;
  const T=pool[P.nx], tr=rvRel(T);
  const sc=[];
  pool.forEach((K,i)=>{
    if(used.has(i)||!K.en.length||K.b!==T.b||K.k!==T.k) return;
    const r=rvRel(K); if(r.wind!==tr.wind) return;
    const d=Math.abs(r.s[0]-tr.s[0])/1000+(Math.abs(r.s[1]-tr.s[1])+Math.abs(r.s[2]-tr.s[2])+Math.abs(r.s[3]-tr.s[3]))/3000
      +4*Math.abs(r.rank-tr.rank)+2*Math.abs(K.h-T.h)+Math.abs(K.kt-T.kt);
    sc.push([d,i]);
  });
  if(!sc.length) return used.has(P.nx)? -1 : P.nx;
  sc.sort((a,b)=>a[0]-b[0]);
  const near=sc.filter(x=>x[0]<=sc[0][0]+6).slice(0,3);
  return near[Math.floor(Math.random()*near.length)][1];
}
// 局のデータを、あなたが席0になるよう回転してローカル麻雀のログ形式に直す
function rvDecode(idx){
  const K=rvPool()[idx], pid=K.pid, r=x=>((+x-pid)%4+4)%4, rot=a=>[0,1,2,3].map(i=>a[(i+pid)%4]);
  const th=K.th.split(' ').map(chunks);
  const ev=[{type:'start_kyoku',bakaze:K.b,kyoku:K.k,honba:K.h,kyotaku:K.kt,oya:r(K.o),scores:rot(K.s),dora_marker:K.dr,tehais:rot(th)}];
  const toks=K.ev? K.ev.split(' ') : [];
  let ri=0;
  for(const t of toks){
    const c=t[0];
    if(c==='t') ev.push({type:'tsumo',actor:r(t[1]),pai:t.slice(2,4)});
    else if(c==='d') ev.push({type:'dahai',actor:r(t[1]),pai:t.slice(2,4),tsumogiri:t.endsWith('*')});
    else if(c==='r') ev.push({type:'reach',actor:r(t[1])});
    else if(c==='R') ev.push({type:'reach_accepted',actor:r(t[1])});
    else if(c==='c'||c==='p'||c==='m') ev.push({type:{c:'chi',p:'pon',m:'daiminkan'}[c],actor:r(t[1]),target:r(t[2]),pai:t.slice(3,5),consumed:chunks(t.slice(5))});
    else if(c==='a') ev.push({type:'ankan',actor:r(t[1]),consumed:chunks(t.slice(2))});
    else if(c==='k') ev.push({type:'kakan',actor:r(t[1]),pai:t.slice(2,4),consumed:chunks(t.slice(4))});
    else if(c==='D') ev.push({type:'dora',dora_marker:t.slice(1,3)});
    else if(c==='h'){ const R=K.res[ri++]||{}; const d=rot(R.d||[0,0,0,0]);
      ev.push({type:'hora',actor:r(t[1]),target:r(t[2]),pai:null,deltas:d,ura_markers:R.u||[],yaku:[],points:Math.max.apply(null,d),hand:R.hand?chunks(R.hand):[]}); }
    else if(c==='y'){ const R=K.res[ri++]||{}; ev.push({type:'ryukyoku',reason:'流局',deltas:rot(R.d||[0,0,0,0])}); }
  }
  ev.push({type:'end_kyoku'});
  return {K,ev,toks,pid};
}
function rvAction(code,ctx){
  const c=code[0];
  if(code==='r') return {type:'reach'};
  if(code==='n') return {type:'none'};
  if(code==='y') return {type:'ryukyoku'};
  if(code==='h') return ctx.react? {type:'hora',pai:ctx.tile,target:ctx.from} : {type:'hora',pai:ctx.drawn};
  if(code==='m') return {type:'daiminkan',pai:ctx.tile,consumed:ctx.hand.filter(t=>MJ.kind(t)===MJ.kind(ctx.tile)).slice(0,3),target:ctx.from};
  if(c==='d'){ const pai=code.slice(1,3); return {type:'dahai',pai,tsumogiri:pai===ctx.drawn}; }
  if(c==='c'||c==='p') return {type:c==='c'?'chi':'pon',pai:ctx.tile,consumed:chunks(code.slice(1)),target:ctx.from};
  if(c==='a'){ const k=MJ.kind(code.slice(1,3)); return {type:'ankan',consumed:ctx.hand.filter(t=>MJ.kind(t)===k)}; }
  if(c==='k') return {type:'kakan',pai:code.slice(1,3)};
  return {type:'none'};
}
function rvStartKyoku(){
  const D=rvDecode(RV.seq[RV.kpos]);
  RV.cur=D;
  RV.base=RV.log.length; // この局の start_kyoku の位置
  if(!RV.log.length) RV.log.push({type:'start_game',names:RV.names.slice()});
  RV.base=RV.log.length;
  for(const e of D.ev) RV.log.push(e);
  const ky=UI.replayLog([{type:'start_game',names:RV.names}].concat(D.ev));
  RV.frames=ky[0].frames;
  RV.entries=new Map(D.K.en.map(e=>[e.p,e]));
}
function rvApplyFrame(){
  const F=RV.frames[RV.fi], v=F.view;
  let last=null;
  if(F.hl){ const d=v.rivers[F.hl.seat][F.hl.idx]; if(d) last={actor:F.hl.seat,pai:d.pai}; }
  RV.last=last;
  const applied=RV.base+1+RV.fi;
  G={review:true,names:RV.names,log:RV.log.slice(0,applied),kyokuNo:RV.kpos+1,
    oya:v.oya,bakaze:v.bakaze,kyoku:v.kyoku,honba:v.honba,kyotaku:v.kyotaku,scores:v.scores,
    k:{hands:v.hands,drawn:v.drawn,riichi:v.riichi,melds:v.melds,rivers:v.rivers,turn:v.last?v.last.actor:v.oya,lastDiscard:last,riichiSeq:v.riichiSeq},
    left:()=>v.left, doraIndicators:()=>v.dora, isAllLast:()=>(v.bakaze===1&&v.kyoku===4)||v.bakaze>=2,
    obsFor:s=>({me:s,oya:v.oya,bakaze:v.bakaze,kyoku:v.kyoku,honba:v.honba,kyotaku:v.kyotaku,scores:v.scores.slice(),dora:v.dora.slice(),left:v.left,
      hand:v.hands[s].slice(),drawn:v.drawn[s],melds:v.melds,rivers:v.rivers,riichiSeq:v.riichiSeq,last,allLast:(v.bakaze===1&&v.kyoku===4)||v.bakaze>=2}),
    discardable:(sx,rd)=>{ if(!PEND) return []; let ts=PEND.actions.filter(a=>a.type==='dahai').map(a=>a.pai);
      if(rd) ts=ts.filter(t=>{ const h=v.hands[HUMAN].slice(); h.splice(h.indexOf(t),1); return MJ.shanten(MJ.counts(h),v.melds[HUMAN].length)===0; });
      return ts; }};
}
function rvSave(){
  if(!RV) return;
  rvSetSaved({id:RV.id,seq:RV.seq,kpos:RV.kpos,fi:RV.fi,set:RV.set,only:RV.only?[...RV.only]:null,savedAt:Date.now()});
}
async function rvSaveRecord(finished,R,Rec){
  R=R||RV; Rec=Rec||REC; if(!R||!Rec) return;
  Rec.log=R.log.slice(); Rec.finished=!!finished; if(G&&G.review) Rec.kyokuLabel=kyokuLabel();
  Rec.seq=R.seq.slice(); Rec.kpos=R.kpos;
  await Store.saveGame(Object.assign({},Rec,{log:R.log.slice()}));
}
// only: 「不正解のみプレイ」で止まる判断（'局番号:場面'）。その判断がある局だけを打ち、ほかの判断は実戦の手で早送りする
async function rvStart(gi,set,only){
  set=set||'main';
  toast('牌譜データを読み込んでいます…',1500);
  if(!await loadReviewData()){ toast('復習半荘のデータを読み込めませんでした'); return; }
  const old=rvSaved(); if(old){ rvSetSaved(null); }
  only=only&&only.length? new Set(only) : null;
  let first=rvPickFirst(gi,set);
  if(only) first=rvNextTarget(first,only);
  if(only&&first<0){ toast('不正解の場面がありません'); return; }
  if(first<0){ toast(set==='v2'?'牌譜データv2 に出題できる半荘がありません':'牌譜データ.json・v3 に出題できる半荘がありません（v3 は Mortal の解析結果の追加が必要です）',5000); return; }
  const names=['あなた','下家','対面','上家'];
  RVGEN++;
  RV={id:'rv-'+newId(),seq:[first],kpos:0,fi:0,log:[],names,set,gen:RVGEN,only};
  REC={id:RV.id,type:'review',reviewSet:set,gameId:window.ML_REVIEW.games[rvPool()[first].g].id,mode:only?'wrong':'full',
    createdAt:Date.now(),names,seed:0,decisions:[],memos:[],finished:false,result:null,log:[]};
  UIS={shanten:false,suji:false,sujiTable:false,open:false,resultOpen:false,menu:false}; STUDY={};
  rvStartKyoku(); rvSave(); await rvSaveRecord(false);
  show('game'); applyLayout(); rvLoop();
}
async function rvResume(){
  const sv=rvSaved(); if(!sv) return;
  if(!await loadReviewData()){ toast('復習半荘のデータを読み込めませんでした'); return; }
  const rec=await Store.getGame(sv.id);
  if(!rec){ rvSetSaved(null); toast('途中の記録が見つかりません'); return renderHome(); }
  REC=rec; const names=rec.names||['あなた','下家','対面','上家'];
  RVGEN++;
  RV={id:sv.id,seq:sv.seq,kpos:sv.kpos,fi:sv.fi,log:[],names,set:sv.set||rec.reviewSet||'main',gen:RVGEN,only:sv.only?new Set(sv.only):null};
  // これまでの局のログを作り直す
  for(let i=0;i<RV.kpos;i++){ const D=rvDecode(RV.seq[i]); if(!RV.log.length) RV.log.push({type:'start_game',names}); D.ev.forEach(e=>RV.log.push(e)); }
  const fi=sv.fi; rvStartKyoku(); RV.fi=Math.min(fi,RV.frames.length-1);
  UIS={shanten:false,suji:false,sujiTable:false,open:false,resultOpen:false,menu:false}; STUDY={};
  show('game'); applyLayout(); rvLoop();
}
async function rvLoop(){
  const gen=RVGEN, alive=()=>RV&&RV.gen===gen&&SCREEN==='game';
  try{
    while(alive()){
      rvApplyFrame(); renderGame();
      const F=RV.frames[RV.fi];
      // あなたの判断の場面
      const e=RV.entries.get(RV.fi);
      if(e&&!RV.done&&(!RV.only||RV.only.has(RV.cur.K.ki+':'+RV.fi))){
        const r=await rvPrompt(e,F); if(r===ABORT||!alive()) return;
      }
      if(RV.fi>=RV.frames.length-1){
        // 局の終わり
        UIS.resultOpen=true; renderGame();
        await rvSaveRecord(false); if(!alive()) return;
        const r=await rvResult(); if(r===ABORT||!alive()) return;
        UIS.resultOpen=false;
        const nx=RV.only? rvNextTarget(rvPickNext(RV.seq[RV.kpos]),RV.only) : rvPickNext(RV.seq[RV.kpos]);
        if(nx<0){ await rvFinish(); return; }
        RV.seq.push(nx); RV.kpos++; RV.fi=0; STUDY={};
        rvStartKyoku(); rvSave(); continue;
      }
      // 次のイベントへ（他家の打牌・鳴きは0.3秒）
      const nextEv=RV.frames[RV.fi+1].ev;
      RV.fi++;
      if(RV.only){ if(RV.fi%40===0) await sleep(0); if(!alive()) return; continue; } // 不正解のみプレイは、止まる場面まで早送り
      if(nextEv&&nextEv.actor!==HUMAN&&['dahai','chi','pon','daiminkan','ankan','kakan','reach'].indexOf(nextEv.type)>=0) await sleep(CPU_MS);
      else if(nextEv&&nextEv.actor===HUMAN&&nextEv.type!=='tsumo') await sleep(CPU_MS?150:0);
      if(!alive()) return;
      if(RV.fi%6===0) rvSave();
    }
  } catch(err){ if(alive()){ console.error(err); alert('エラーが発生しました: '+(err&&err.message)); } }
}
async function rvPrompt(e,F){
  const v=F.view, toks=RV.cur.toks, prevTok=toks[RV.fi-1]||'';
  const mine=((+prevTok[1]-RV.cur.pid+4)%4)===HUMAN;
  const myTurn=mine&&(prevTok[0]==='t'||prevTok[0]==='c'||prevTok[0]==='p'||prevTok[0]==='r');
  const obs=G.obsFor(HUMAN);
  const ctx={react:!myTurn,tile:RV.last&&RV.last.pai,from:RV.last&&RV.last.actor,drawn:v.drawn[HUMAN],hand:v.hands[HUMAN]};
  if(!myTurn&&prevTok[0]==='k'){ ctx.tile=prevTok.slice(2,4); ctx.from=((+prevTok[1]-RV.cur.pid+4)%4); }
  if(!myTurn) obs.last={actor:ctx.from,pai:ctx.tile};
  const legal=[...new Set(e.l.split(' '))].map(c=>rvAction(c,ctx));
  if(legal.length<=1) return true;
  let list=e.c.split('|').map(x=>{ const [c,p]=x.split(':'); return {action:rvAction(c,ctx),prob:+p}; });
  const expected=rvAction(e.e,ctx), actual=rvAction(e.a,ctx);
  // 推奨（expected）を先頭に
  const ek=AI.actKey(expected); const ei=list.findIndex(c=>AI.actKey(c.action)===ek);
  if(ei>0){ const x=list.splice(ei,1)[0]; list.unshift(x); } else if(ei<0) list.unshift({action:expected,prob:1});
  const kind=myTurn? (prevTok[0]==='r'?'riichi_discard':'self') : 'react';
  PEND={kind,obs,actions:legal,list,i:RV.base+1+RV.fi,memoIds:[],hinted:false,tile:ctx.tile,from:ctx.from,review:true,sub:!!(e.sub||RV.cur.K.sub),expected,actual};
  SEL=-1; SUBMENU=null; RSEL=false; PRESEL=null;
  const pr=new Promise(res=>{ PEND.resolve=res; });
  renderGame();
  const choice=await pr;
  if(choice===ABORT) return ABORT;
  PRESEL=null; RSEL=false;
  const P=PEND;
  const ok=AI.actKey(choice)===ek;
  const why=AI.explain(P.obs,P.list,ok?null:choice);
  P.why=why; P.decided=true;
  const n=REC.decisions.length;
  REC.decisions.push({n,i:P.i,kind,list:P.list.slice(0,10).map(c=>({a:c.action,p:+(+c.prob).toFixed(5)})),chosen:choice,ok,actual,actualOk:AI.actKey(actual)===ek,
    hinted:P.hinted,at:Date.now(),kyoku:kyokuLabel(),why,src:{g:RV.cur.K.g,ki:RV.cur.K.ki},p:RV.fi,mortal:!P.sub,sub:!!P.sub});
  for(const id of P.memoIds){ const ms=await Store.listMemos(); const m=ms.find(x=>x.id===id); if(m){ m.decision={chosen:choice,ok,n}; m.why=why; await Store.saveMemo(m); } }
  // 判断した時点で保存する（説明画面の途中で中断しても判断が消えないように。再開時はこの判断の次から）
  rvSetSaved({id:RV.id,seq:RV.seq,kpos:RV.kpos,fi:RV.fi+1,set:RV.set,only:RV.only?[...RV.only]:null,savedAt:Date.now()});
  await rvSaveRecord(false);
  if(!ok&&CFG.judge!=='off'){ const r=await showFalse(P,choice); if(r===ABORT){ PEND=null; return ABORT; } }
  // 正解でも、実戦（牌譜）と違う手を選んだときは、この先が実戦の手で進むことを知らせて止める
  else if(AI.actKey(choice)!==AI.actKey(actual)){ const r=await rvShowDiverge(P,choice,ok); if(r===ABORT){ PEND=null; return ABORT; } }
  PEND=null;
  if(!RV||SCREEN!=='game') return ABORT;
  return true;
}
function rvShowDiverge(P,choice,ok){
  return new Promise(res=>{
    overlay(`<div class="ovb">
      <div class="row">${ok?'<span class="okmark">正解</span>':'<span class="false" style="font-size:24px">FALSE</span>'}<span class="grow"></span><span class="small muted">${esc(decisionTitle(P))}</span></div>
      <div style="margin-top:8px;font-size:15px">あなた：<b>${esc(UI.actionText(choice,HUMAN))}</b>${ok?'（'+(P.sub?'Mortal代役':'本物の Mortal')+'の推奨と一致）':''}</div>
      <div style="margin-top:4px;font-size:15px">実戦（実際の牌譜）：<b style="color:var(--gold)">${esc(UI.actionText(P.actual,HUMAN))}</b></div>
      <div class="why" style="margin-top:10px"><div class="wt">この先の進み方</div><div class="wi">復習半荘は、本物の Mortal の解析と同じ状況を保つため、この先は<b>実戦の手（${esc(UI.actionText(P.actual,HUMAN))}）</b>で進みます。河や手牌が、あなたの選んだ手と違って見えるのはそのためです。</div></div>
    </div><div class="ovf"><button class="btn-p" id="ov-go">続ける</button></div>`,d=>{ $('#ov-go',d).onclick=()=>{ closeOverlay(); res(true); }; });
  });
}
function rvResult(){
  return new Promise(res=>{
    const evs=RV.cur.ev, wins=evs.filter(e=>e.type==='hora'), ry=evs.find(e=>e.type==='ryukyoku');
    const names=RV.names, F=RV.frames[RV.frames.length-1].view;
    let h='<div class="ovb">';
    const deltas=[0,0,0,0];
    for(const w of wins){ for(let i=0;i<4;i++) deltas[i]+=w.deltas[i];
      h+=`<div style="margin-bottom:8px"><div style="font-size:17px;font-weight:900">${esc(names[w.actor])} ${w.actor===w.target?'ツモ':'ロン（'+esc(names[w.target])+'から）'} ${w.deltas[w.actor]>0?'+'+w.deltas[w.actor]:''}</div>
        <div class="res-hand">${(F.hands[w.actor]||[]).map(t=>`<span class="tw">${UI.tileImg(t)}</span>`).join('')}</div></div>`; }
    if(ry){ for(let i=0;i<4;i++) deltas[i]+=ry.deltas[i]; h+=`<div style="font-size:17px;font-weight:900">流局</div>`; }
    h+=`<table style="width:100%;margin-top:8px;font-size:14px">`+[0,1,2,3].map(s=>`<tr><td>${esc(names[s])}</td><td style="text-align:right">${F.scores[s]}</td><td style="text-align:right;color:${deltas[s]>0?'var(--accent)':deltas[s]<0?'#ff8a8a':'var(--muted)'}">${deltas[s]>0?'+':''}${deltas[s]||''}</td></tr>`).join('')+`</table>`;
    const kd=REC.decisions.filter(d=>d.src&&d.src.g===RV.cur.K.g&&d.src.ki===RV.cur.K.ki);
    h+=`<div class="small muted" style="margin-top:8px">この局のあなたの判断 ${kd.length}回 ／ FALSE ${kd.filter(d=>!d.ok).length}回（実戦では ${kd.filter(d=>!d.actualOk).length}回 Mortal と不一致）</div>`;

    h+='</div><div class="ovf"><button class="btn-g" id="r-memo" style="flex:.6">メモ記入</button><button class="btn-p" id="r-next">次の局へ</button></div>';
    overlay(h,d=>{ $('#r-next',d).onclick=()=>{ closeOverlay(); res(true); }; $('#r-memo',d).onclick=()=>showMemo(()=>rvResult().then(res)); });
  });
}
async function rvFinish(){
  const dec=REC.decisions, f=dec.filter(d=>!d.ok).length, fa=dec.filter(d=>!d.actualOk).length;
  REC.result=null; REC.finished=true; await rvSaveRecord(true); rvSetSaved(null);
  if(RV.cur) rvMarkDone(RV.cur.K.g);
  const gid=RV.cur&&window.ML_REVIEW.games[RV.cur.K.g]; const fin=RV.frames[RV.frames.length-1].view.scores;
  const id=REC.id;
  overlay(`<div class="ovb"><div style="font-size:18px;font-weight:900">${esc(rvSetName(RV.set))}${RV.only?'（不正解のみプレイ）':''} 終了</div>
    <table style="width:100%;margin:8px 0;font-size:15px">
      <tr><td>${RV.only?'不正解の場面がある局':'打った局'}</td><td style="text-align:right">${RV.seq.length}局（牌譜 ${esc(gid?gid.id.slice(0,8):'')}）</td></tr>
      <tr><td>最終の点数（実際の牌譜）</td><td style="text-align:right">${fin.join(' / ')}</td></tr>
      <tr><td>あなたの判断</td><td style="text-align:right">${dec.length}回</td></tr>
      <tr><td>FALSE（本物の Mortal と不一致）</td><td style="text-align:right">${f}回</td></tr>
      <tr><td>今回の一致率</td><td style="text-align:right"><b>${dec.length?((1-f/dec.length)*100).toFixed(1):'-'}%</b></td></tr>
      <tr><td>同じ場面の実戦での一致率</td><td style="text-align:right">${dec.length?((1-fa/dec.length)*100).toFixed(1):'-'}%</td></tr>
    </table>
  </div><div class="ovf"><button class="btn-g" id="e-log">牌譜を見る</button><button class="btn-g" id="e-home">ホーム</button><button class="btn-p" id="e-new">${RV.only?'出題一覧へ':'もう1回'}</button></div>`,d=>{
    $('#e-log',d).onclick=()=>{ closeOverlay(); RV=null; openViewer(id); };
    $('#e-home',d).onclick=()=>{ closeOverlay(); RV=null; renderHome(); };
    $('#e-new',d).onclick=()=>{ const st=RV&&RV.set, only=RV&&RV.only; closeOverlay(); RV=null; if(only) renderReviewList(st); else rvStart(null,st); };
  });
}
function rvMenu(){
  overlay(`<div class="ovb"><b style="font-size:16px">メニュー（${esc(rvSetName(RV&&RV.set))}${RV&&RV.only?'・不正解のみプレイ':''}）</b>
    <p class="small muted">${esc(kyokuLabel())}</p>
    <button class="hbtn" id="m-home">中断してホームへ（続きから再開できます）</button>
    <button class="hbtn btn-d" id="m-end">この復習半荘をやめる（ここまでの記録は保存）</button>
  </div><div class="ovf"><button class="btn-p" id="m-close">閉じる</button></div>`,d=>{
    $('#m-close',d).onclick=()=>closeOverlay();
    $('#m-home',d).onclick=async()=>{ closeOverlay(); rvSave(); const R=RV, Rec=REC; RV=null; G=null; RVGEN++; await rvSaveRecord(false,R,Rec); renderHome(); };
    $('#m-end',d).onclick=async()=>{ if(!confirm('この復習半荘をやめますか？')) return; closeOverlay(); const R=RV, Rec=REC; RV=null; G=null; PEND=null; RVGEN++; rvSetSaved(null); await rvSaveRecord(false,R,Rec); renderHome(); };
  });
}

// 「不正解のみプレイ」: idx の局から、止まる判断がある局まで進める（無ければ -1）
function rvNextTarget(idx,only){
  const pool=rvPool();
  while(idx>=0){ const K=pool[idx]; if(K.en.some(e=>only.has(K.ki+':'+e.p))) return idx; idx=K.nx; }
  return -1;
}
/* 復習半荘の記録が、どの半荘のものか。新しい記録は gameId を持つ。古い記録は最初の局の配牌で見分ける
   （牌譜データを作り直して半荘の番号が変わっても分かるように） */
const rvSig=th=>th.map(h=>h.slice().sort().join('')).sort().join('|');
let RVSIG=null;
function rvGameOfRec(rec){
  const games=window.ML_REVIEW.games;
  if(rec.gameId){ const gi=games.findIndex(g=>g.id===rec.gameId); if(gi>=0) return gi; }
  if(!RVSIG){ RVSIG=new Map(); rvPool().forEach(K=>RVSIG.set(rvSig(K.th.split(' ').map(chunks)),K.g)); }
  const st=(rec.log||[]).find(e=>e.type==='start_kyoku'); if(!st) return -1;
  const g=RVSIG.get(rvSig(st.tehais)); return g==null? -1 : g;
}
// 判断の場面の印（'局番号:場面'）。古い記録は p が無いので、ログ上の位置から求める
function rvDecKey(rec,d){
  if(!d.src) return null;
  if(d.p!=null) return d.src.ki+':'+d.p;
  const log=rec.log||[]; let b=-1;
  for(let i=Math.min(d.i,log.length)-1;i>=0;i--) if(log[i].type==='start_kyoku'){ b=i; break; }
  return b<0? null : d.src.ki+':'+(d.i-b-1);
}
// 半荘ごとのプレイ状況: 通しでプレイした回数・途中・最後の一致率、場面ごとの最新の正誤（不正解のみプレイの対象）
async function rvPlayStats(){
  const by=new Map(), cur=rvSaved();
  const recs=(await Store.listGames()).filter(r=>r.type==='review').sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  const answers=[];
  for(const rec of recs){
    const g=rvGameOfRec(rec); if(g<0) continue;
    let st=by.get(g); if(!st){ st={plays:0,partial:0,playing:false,last:null,ans:new Map()}; by.set(g,st); }
    const dec=rec.decisions||[];
    if(cur&&cur.id===rec.id) st.playing=true;
    if(rec.mode!=='wrong'){
      if(rec.finished) st.plays++; else if(dec.length) st.partial++;
      if(dec.length&&(rec.finished||!st.last||!st.last.finished))
        st.last={finished:!!rec.finished,n:dec.length,ok:dec.filter(d=>d.ok).length,actualOk:dec.filter(d=>d.actualOk).length,at:rec.updatedAt||rec.createdAt};
    }
    dec.forEach(d=>{ const k=rvDecKey(rec,d); if(k) answers.push([g,k,!!d.ok,d.at||rec.createdAt||0]); });
  }
  answers.sort((a,b)=>a[3]-b[3]).forEach(([g,k,ok])=>by.get(g).ans.set(k,ok));
  for(const st of by.values()) st.wrong=[...st.ans].filter(x=>!x[1]).map(x=>x[0]);
  return by;
}
// 何切るクイズで取り込んだ牌譜の控え（同じサイトの localStorage）。取り込み日時と天鳳URLを出すのに使う
function quizSources(){
  let l=[]; try{ l=JSON.parse(localStorage.getItem('mq.src.v1')||'[]')||[]; }catch(e){}
  return new Map(l.filter(x=>x&&x.reportId).map(x=>[x.reportId,x]));
}
const tenhouDate=id=>{ const m=String(id||'').match(/^(\d{4})(\d\d)(\d\d)(\d\d)gm/); return m? `${m[1]}/${+m[2]}/${+m[3]} ${+m[4]}時` : ''; };
const pct=(a,n)=>n? (a/n*100).toFixed(1)+'%' : '-';
async function renderReviewList(set){
  set=set||'main';
  show('logs');
  $('#logs').innerHTML='<div class="page"><p class="muted center">読み込み中…</p></div>';
  if(!await loadReviewData()){ toast('復習半荘のデータを読み込めませんでした'); return renderHome(); }
  const R=rvRanking(set), pos=R.length? rvNextPos(set)%R.length : 0, games=window.ML_REVIEW.games;
  const PS=await rvPlayStats(), SRC=quizSources();
  let extras=[]; try{ extras=await Store.listReviewExtras(); }catch(e){}
  const addedAt=new Map(extras.map(x=>[x.id,x.addedAt]));
  const nPlayed=R.filter(r=>PS.has(r.g)&&PS.get(r.g).plays).length;
  const head=r=>{
    const g=games[r.g], src=SRC.get(g.id);
    const tl=(src&&src.tenhou&&(src.tenhou.match(/log=([\w-]+)/)||[])[1])||g.tenhou||'';
    const at=src&&src.tenhou? src.at : addedAt.get(g.id);
    if(tl||(src&&src.tenhou)) return `<div class="small muted">天鳳${tl?' '+esc(tenhouDate(tl)||tl.slice(0,10))+'の対局':''}${at?' ／ 取り込み '+esc(UI.fmtDT(at)):''}</div>`;
    return `<div class="small muted">牌譜 ${esc(g.id.slice(0,8))}${at?' ／ 取り込み '+esc(UI.fmtDT(at)):''}</div>`;
  };
  const status=st=>!st? '<span class="badge">未プレイ</span>'
    : st.playing? '<span class="badge b-chk">プレイ中</span>'+(st.plays?`<span class="badge b-ok">プレイ済み ${st.plays}回</span>`:'')
    : st.plays? `<span class="badge b-ok">プレイ済み${st.plays>1?' '+st.plays+'回':''}</span>`
    : st.partial? '<span class="badge b-chk">途中</span>' : '<span class="badge">未プレイ</span>';
  const result=st=>{
    if(!st||!st.last) return '';
    const L=st.last;
    return `<div class="small" style="margin-top:4px">プレイ結果${L.finished?'':'（途中まで）'}：一致率 <b style="color:var(--accent)">${pct(L.ok,L.n)}</b>（${L.ok}/${L.n}判断）
      <span class="muted">／ 同じ場面の実戦 ${pct(L.actualOk,L.n)}</span></div>`;
  };
  $('#logs').innerHTML=`<div class="page"><div class="topbar"><button id="rl-back">← ホーム</button><h1>${esc(rvSetName(set))}の出題順（${R.length}半荘）</h1></div>
    <p class="small muted">${set==='v2'?'牌譜データv2（学習用）の半荘です。':'牌譜データ.json・牌譜データv3 の半荘と、何切るクイズで取り込んだ半荘です（v3 は Mortal の解析結果が追加されたものから出題されます）。'}実戦で Mortal の推奨率が20%以下の手を選んだ回数が多い順です。「次」の印の半荘から順に出題します。<br>
    「不正解のみプレイ」は、これまでのプレイで最後に FALSE だった判断の場面だけで止まります（ほかは実戦の手で早送り）。</p>
    <p class="small">プレイ済み ${nPlayed} ／ ${R.length}半荘</p>
    ${R.length?'':'<p class="muted center">出題できる半荘がありません。</p>'}
    ${R.map((r,i)=>{ const g=games[r.g], st=PS.get(r.g), nw=st? st.wrong.length : 0;
      return `<div class="item">
      <div class="row" style="gap:6px;flex-wrap:wrap"><b>${i+1}位</b>${i===pos?'<span class="badge b-chk">次</span>':''}${status(st)}${g.sub?'<span class="badge">Mortal未解析・代役判定</span>':''}<span class="grow"></span>
        <span class="badge b-false">推奨率20%以下 ${r.low}回</span></div>
      ${head(r)}
      <div class="small muted">${r.kyokus}局 ／ あなたの判断 ${r.dec}回 ／ 推奨との確率差の合計 ${(r.loss*100).toFixed(0)}pt</div>
      ${result(st)}
      <div class="row" style="gap:6px;margin-top:6px">
        <button class="btn-p" data-rg="${r.g}" style="flex:1">${st&&st.plays?'もう一度復習する':'この半荘を復習する'}</button>
        <button class="btn-g" data-rw="${r.g}" style="flex:1" ${nw?'':'disabled'}>不正解のみプレイ${nw?`（${nw}問）`:''}</button>
      </div></div>`; }).join('')}</div>`;
  $('#rl-back').onclick=renderHome;
  const ok=()=>!rvSaved()||confirm('途中の復習半荘があります。新しく始めると、途中までの記録は牌譜一覧に保存されます。よろしいですか？');
  $$('[data-rg]').forEach(b=>b.onclick=()=>{ if(ok()) rvStart(+b.dataset.rg,set); });
  $$('[data-rw]').forEach(b=>b.onclick=()=>{ const st=PS.get(+b.dataset.rw); if(st&&st.wrong.length&&ok()) rvStart(+b.dataset.rw,set,st.wrong); });
}

/* ================= 牌譜一覧 ================= */
async function renderLogs(){
  show('logs');
  const games=await Store.listGames();
  $('#logs').innerHTML=`<div class="page"><div class="topbar"><button id="l-back">← ホーム</button><h1>牌譜一覧（${games.length}）</h1></div>
    ${games.length?'':'<p class="muted center">まだ牌譜がありません。</p>'}
    ${games.map(g=>{ const r=g.result, my=r? r.order.indexOf(0)+1 : null; const dec=g.decisions||[], f=dec.filter(d=>!d.ok).length;
      return `<div class="item" data-g="${esc(g.id)}">
        <div class="row"><b>${esc(UI.fmtDT(g.createdAt))}</b>${g.type==='review'?`<span class="badge b-chk">${g.reviewSet==='v2'?'学習用牌譜（v2）':'復習半荘'}${g.mode==='wrong'?'・不正解のみ':''}</span>`:''}<span class="grow"></span>${g.type==='review'?`<span class="badge">${g.finished?'完了':'途中'}</span>`:g.finished?`<span class="badge ${my===1?'b-ok':''}">${my}位 ${r.scores[0]}点 ${r.final[0]>0?'+':''}${r.final[0]}</span>`:`<span class="badge b-chk">途中（${esc(g.kyokuLabel||'')}）</span>`}</div>
        <div class="small muted">判断 ${dec.length}回 ／ <span style="color:#ff8a8a">FALSE ${f}回</span> ／ メモ ${(g.memos||[]).length}件</div>
        <div class="row" style="margin-top:6px"><button class="grow btn-p" data-v="${esc(g.id)}">牌譜を見る</button><button class="btn-g" data-f="${esc(g.id)}" ${f?'':'disabled'}>FALSEから見る</button></div>
        <div class="row" style="margin-top:6px"><button class="grow btn-g" data-th="${esc(g.id)}">天鳳形式で書き出す（Mortal検証用）</button><button class="btn-d" data-del="${esc(g.id)}">削除</button></div>
      </div>`; }).join('')}</div>`;
  $('#l-back').onclick=renderHome;
  $$('[data-v]').forEach(b=>b.onclick=()=>openViewer(b.dataset.v));
  $$('[data-f]').forEach(b=>b.onclick=()=>openViewer(b.dataset.f,{firstFalse:true}));
  $$('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('この牌譜を削除しますか？（何切るクイズに取り込み済みの問題は残ります）')) return; await Store.deleteGame(b.dataset.del); renderLogs(); });
  $$('[data-th]').forEach(b=>b.onclick=async()=>{ const g=await Store.getGame(b.dataset.th); if(g) exportTenhou(g); });
}
// 天鳳形式（tenhou.net/6 の JSON）で書き出す。mjai.ekyu.moe にアップロードすると本物の Mortal で解析できる
function exportTenhou(g){
  try{
    const j=window.MLTenhou.toTenhou6(g);
    const blob=new Blob([JSON.stringify(j)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    const d=new Date(g.createdAt||Date.now());
    a.download='local-mahjong-'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'-'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('書き出しました。通信できるときに mjai.ekyu.moe でこのファイルを選んで送信すると、本物のMortalで解析できます（あなたは東家スタートの席です）',6000);
  }catch(e){ toast('書き出せませんでした: '+e.message); }
}

/* ================= 牌譜ビューア（全員の手牌を表示） ================= */
let VW=null;
async function openViewer(id,opt){
  opt=opt||{};
  let g=await Store.getGame(id);
  if(!g&&REC&&REC.id===id) g=Object.assign({},REC,{log:G.log});
  if(!g){ toast('牌譜が見つかりません'); return renderLogs(); }
  const kyokus=UI.replayLog(g.log||[]);
  if(!kyokus.length){ toast('牌譜が空です'); return renderLogs(); }
  VW={g,kyokus,ki:0,fi:0};
  const decAt=new Map(); (g.decisions||[]).forEach(d=>{ if(!decAt.has(d.i)) decAt.set(d.i,[]); decAt.get(d.i).push(d); });
  VW.decAt=decAt;
  if(opt.dec!=null) gotoDecision(opt.dec);
  else if(opt.firstFalse){ const d=(g.decisions||[]).find(x=>!x.ok); if(d) gotoDecision(d.n); }
  show('viewer'); drawViewer();
}
function gotoDecision(n){
  const d=(VW.g.decisions||[])[n]; if(!d) return;
  for(let ki=0;ki<VW.kyokus.length;ki++){ const fi=VW.kyokus[ki].frames.findIndex(f=>f.i===d.i); if(fi>=0){ VW.ki=ki; VW.fi=fi; VW.focus=n; return; } }
}
function drawViewer(){
  const K=VW.kyokus[VW.ki], F=K.frames[VW.fi], v=F.view;
  const ds=VW.decAt.get(F.i)||[];
  const w=Math.min(LAY.W-LAY.pad.l-LAY.pad.r-16, LAY.land? LAY.H-LAY.pad.t-LAY.pad.b-8 : 640);
  const open=[true,true,true,true];
  const hand=v.hands[0].slice(), dr=v.drawn[0]; let sep=null;
  if(dr&&hand.length%3===2){ const i=hand.lastIndexOf(dr); if(i>=0){ hand.splice(i,1); sep=dr; } }
  const tiles=MJ.sortTiles(hand); if(sep) tiles.push(sep);
  // この局面のあなたの判断
  let dh='';
  ds.forEach(d=>{
    const list=d.list.map(x=>({action:x.a,prob:x.p}));
    dh+=`<div class="card" style="margin-top:8px"><div class="row">${d.ok?'<span class="okmark">OK</span>':'<span class="false" style="font-size:24px">FALSE</span>'}
      <span class="grow"></span><span class="small muted">判断${d.n+1}${d.hinted?'（ヒント使用）':''}</span></div>
      <div>あなた：<b>${esc(UI.actionText(d.chosen,0))}</b>　${d.mortal?'Mortal（本物）':d.sub?'Mortal代役':''}推奨：<b style="color:var(--accent)">${esc(UI.actionText(list[0].action,0))}</b></div>
      ${d.actual?`<div class="small muted">実戦：${esc(UI.actionText(d.actual,0))}</div>`:''}
      ${whyHTML(d.why)}
      ${UI.candHTML(list,{chosen:d.chosen,me:0,max:8})}</div>`;
  });
  const bestKey=ds.length? AI.actKey(ds[0].list[0].a):null, chKey=ds.length? AI.actKey(ds[0].chosen):null;
  const lay=LAY.land;
  $('#viewer').innerHTML=`<div class="page" style="max-width:${lay?'none':'760px'}">
    <div class="topbar"><button id="v-back">← 一覧</button><h1 style="font-size:14px">${esc(UI.fmtDT(VW.g.createdAt))}</h1>
      <select id="v-k" style="width:auto;min-height:44px">${VW.kyokus.map((k,i)=>`<option value="${i}" ${i===VW.ki?'selected':''}>${esc(k.label)}</option>`).join('')}</select></div>
    <div style="display:${lay?'flex':'block'};gap:10px;align-items:flex-start">
      <div id="v-board" style="width:${w}px;max-width:100%;flex:none">${UI.boardSVG(v,{open,skipHand:[true,false,false,false],hl:F.hl})}
        <div style="display:flex;justify-content:center;padding:6px 2px;background:#0e3b2a">${tiles.map((t,i)=>{
          const k='d:'+t; const ring= k===bestKey&&ds.length? 'box-shadow:0 0 0 2px var(--accent);border-radius:4px' : (k===chKey&&ds.length? 'box-shadow:0 0 0 2px var(--bad);border-radius:4px':'');
          return `<span style="width:${Math.min(40,Math.floor((w-8)/14.6))}px;${sep&&i===tiles.length-1?'margin-left:6px;':''}${ring}">${UI.tileImg(t)}</span>`; }).join('')}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="small" style="margin:6px 0;min-height:20px"><b>${esc(F.text||'')}</b></div>
        <div class="vctl">
          <button id="v-pk">◀◀局</button><button id="v-p">◀ 1手</button><button id="v-n">1手 ▶</button><button id="v-nk">局▶▶</button><button id="v-nd">判断 ▶</button>
        </div>
        <div class="vctl" style="grid-template-columns:repeat(3,1fr)">
          <button id="v-pf" class="btn-g">◀ FALSE</button><button id="v-nf" class="btn-g">FALSE ▶</button><button id="v-memo" class="btn-g">メモ記入</button>
        </div>
        ${dh}
      </div>
    </div></div>`;
  $('#v-back').onclick=renderLogs;
  $('#v-k').onchange=e=>{ VW.ki=+e.target.value; VW.fi=0; drawViewer(); };
  const step=dlt=>{ let fi=VW.fi+dlt, ki=VW.ki;
    if(fi<0){ if(ki>0){ ki--; fi=VW.kyokus[ki].frames.length-1; } else fi=0; }
    if(fi>=VW.kyokus[ki].frames.length){ if(ki<VW.kyokus.length-1){ ki++; fi=0; } else fi=VW.kyokus[ki].frames.length-1; }
    VW.ki=ki; VW.fi=fi; drawViewer(); };
  $('#v-p').onclick=()=>step(-1); $('#v-n').onclick=()=>step(1);
  $('#v-pk').onclick=()=>{ VW.ki=Math.max(0,VW.fi>0?VW.ki:VW.ki-1); VW.fi=0; drawViewer(); };
  $('#v-nk').onclick=()=>{ if(VW.ki<VW.kyokus.length-1){ VW.ki++; VW.fi=0; drawViewer(); } };
  const jump=(dir,pred)=>{
    const decs=(VW.g.decisions||[]).filter(pred);
    const curI=VW.kyokus[VW.ki].frames[VW.fi].i;
    const d= dir>0? decs.find(x=>x.i>curI) : decs.slice().reverse().find(x=>x.i<curI);
    if(!d){ toast(dir>0?'この先にはありません':'これより前にはありません'); return; }
    gotoDecision(d.n); drawViewer(); };
  $('#v-nd').onclick=()=>jump(1,()=>true);
  $('#v-nf').onclick=()=>jump(1,d=>!d.ok);
  $('#v-pf').onclick=()=>jump(-1,d=>!d.ok);
  $('#v-memo').onclick=()=>viewerMemo(F,ds);
}
async function viewerMemo(F,ds){
  const text=prompt('メモ（要チェックに登録します）',''); if(text==null) return;
  const d=ds[0];
  const m={id:newId(),gameId:VW.g.id,createdAt:Date.now(),text:text.trim()||'（メモなし）',checked:false,kyokuLabel:VW.kyokus[VW.ki].label,logIndex:F.i,
    view:JSON.parse(JSON.stringify(F.view)),hand:F.view.hands[0].slice(),drawn:F.view.drawn[0],list:d?d.list:null,title:d?'判断'+(d.n+1):'局面',
    decision:d?{chosen:d.chosen,ok:d.ok,n:d.n}:null,q:d?d.q:null,why:d?d.why:null};
  if(d&&!m.q&&VW.g.decisions){ /* OK だった判断は問題データを持たないので、簡易に作る */ }
  await Store.saveMemo(m); toast('要チェックに登録しました');
}

/* ================= 要チェック ================= */
let CHK_FILTER='open';
async function renderChecks(){
  show('checks');
  const all=await Store.listMemos();
  const list=all.filter(m=>CHK_FILTER==='all'||(CHK_FILTER==='open'?!m.checked:m.checked));
  const w=Math.min(LAY.W-LAY.pad.l-LAY.pad.r-40,520);
  $('#checks').innerHTML=`<div class="page"><div class="topbar"><button id="c-back">← ホーム</button><h1>要チェック</h1></div>
    <div class="seg" style="margin-bottom:10px">
      <button data-cf="open" class="${CHK_FILTER==='open'?'on':''}">未チェック ${all.filter(m=>!m.checked).length}</button>
      <button data-cf="done" class="${CHK_FILTER==='done'?'on':''}">チェック済み ${all.filter(m=>m.checked).length}</button>
      <button data-cf="all" class="${CHK_FILTER==='all'?'on':''}">すべて ${all.length}</button></div>
    ${list.length?'':'<p class="muted center">該当するメモはありません。</p>'}
    ${list.map(m=>{
      const v=m.view; const hand=(m.hand||[]).slice(); const dr=m.drawn; let sep=null;
      if(dr&&hand.length%3===2){ const i=hand.lastIndexOf(dr); if(i>=0){ hand.splice(i,1); sep=dr; } }
      const tiles=MJ.sortTiles(hand); if(sep) tiles.push(sep);
      const list2=m.list? m.list.map(x=>({action:x.a,prob:x.p})):null;
      return `<div class="item">
        <div class="row"><b>${esc(m.kyokuLabel||'')}</b><span class="small muted">${esc(m.title||'')}</span><span class="grow"></span>
          ${m.decision?(m.decision.ok?'<span class="badge b-ok">OK</span>':'<span class="badge b-false">FALSE</span>'):''}
          ${m.checked?'<span class="badge">チェック済み</span>':'<span class="badge b-chk">要チェック</span>'}</div>
        <div class="small muted">${esc(UI.fmtDT(m.createdAt))}</div>
        <div style="white-space:pre-wrap;margin:6px 0;font-size:15px">${esc(m.text)}</div>
        ${v?`<div style="width:${w}px;max-width:100%">${UI.boardSVG(v,{open:[false,false,false,false],skipHand:[true,false,false,false]})}
          <div style="display:flex;justify-content:center;background:#0e3b2a;padding:4px">${tiles.map((t,i)=>`<span style="width:${Math.floor((Math.min(w,LAY.W-40)-8)/14.6)}px;${sep&&i===tiles.length-1?'margin-left:5px':''}">${UI.tileImg(t)}</span>`).join('')}</div></div>`:''}
        ${list2?`<div class="small" style="margin-top:6px">${m.decision?`あなた：<b>${esc(UI.actionText(m.decision.chosen,0))}</b>　`:''}推奨：<b style="color:var(--accent)">${esc(UI.actionText(list2[0].action,0))}</b></div>${whyHTML(m.why)}${UI.candHTML(list2,{chosen:m.decision&&m.decision.chosen,me:0,max:6})}`:''}
        <div class="row" style="margin-top:8px">
          <button class="grow ${m.checked?'btn-g':'btn-p'}" data-ck="${esc(m.id)}">${m.checked?'未チェックに戻す':'チェック済みにする'}</button>
          <button class="btn-g" data-open="${esc(m.gameId)}" data-li="${m.logIndex}">牌譜で見る</button>
          <button class="btn-d" data-del="${esc(m.id)}">削除</button></div>
      </div>`; }).join('')}</div>`;
  $('#c-back').onclick=renderHome;
  $$('[data-cf]').forEach(b=>b.onclick=()=>{ CHK_FILTER=b.dataset.cf; renderChecks(); });
  $$('[data-ck]').forEach(b=>b.onclick=async()=>{ const m=all.find(x=>x.id===b.dataset.ck); m.checked=!m.checked; await Store.saveMemo(m); renderChecks(); });
  $$('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('このメモを削除しますか？')) return; await Store.deleteMemo(b.dataset.del); renderChecks(); });
  $$('[data-open]').forEach(b=>b.onclick=async()=>{ await openViewerAt(b.dataset.open,+b.dataset.li); });
}
async function openViewerAt(id,logIndex){
  await openViewer(id);
  if(!VW) return;
  for(let ki=0;ki<VW.kyokus.length;ki++){ const fi=VW.kyokus[ki].frames.findIndex(f=>f.i===logIndex); if(fi>=0){ VW.ki=ki; VW.fi=fi; break; } }
  drawViewer();
}

/* ================= 設定 ================= */
async function renderSettings(){
  show('settings');
  const opt=(k,v,l)=>`<button data-k="${k}" data-v="${v}" class="${CFG[k]===v?'on':''}">${l}</button>`;
  $('#settings').innerHTML=`<div class="page"><div class="topbar"><button id="s-back">← ホーム</button><h1>設定</h1></div>
    <div class="card"><h2>打牌の操作</h2><div class="seg">${opt('tap','two','2回タップで切る')}${opt('tap','one','1回タップで切る')}</div>
      <p class="small muted">2回タップ：1回目で選択（受け入れを確認）、2回目で打牌。誤タップ防止におすすめです。</p></div>
    <div class="card"><h2>FALSE の判定</h2><div class="seg" style="flex-wrap:wrap">${opt('judge','strict','最善手のみ正解')}${opt('judge','tol10','10%差まで正解')}${opt('judge','tol20','20%差まで正解')}${opt('judge','off','判定しない')}</div>
      <p class="small muted">Mortal代役の推奨と違う手を選ぶと FALSE を表示して止まります。「10%差まで」は推奨手との確率差が10ポイント以内なら正解扱いにします。</p></div>
    <div class="card"><h2>画面の向き</h2><div class="seg">${opt('mode','portrait','縦画面モード')}${opt('mode','landscape','横画面モード')}</div>
      <p class="small muted">端末を傾けても自動では切り替わりません。iPhoneでは「画面縦向きのロック」をオンにしたまま使うのがおすすめです。</p></div>
    <div class="card"><h2>名前</h2>${[0,1,2,3].map(i=>`<label>${['あなた','下家','対面','上家'][i]}</label><input data-name="${i}" value="${esc(CFG.names[i])}">`).join('')}</div>
    <div class="card"><h2>データ</h2>
      <button class="hbtn" id="s-exp">牌譜・メモを書き出す（JSON）</button>
      <label>書き出したJSONを読み込む</label><input type="file" id="s-imp" accept="application/json,.json">
      <p class="small muted">データは端末内（このブラウザ）だけに保存されます。機種変更や削除に備えて、ときどき書き出してください。</p></div>
    <div class="card"><h2>このアプリについて</h2><p class="small muted">版 ${VERSION}。ルール：半荘戦・喰いタンあり・赤ドラ3枚・ダブロンあり・西入あり（天鳳準拠）。責任払い（パオ）は未対応です。</p>
      <p class="small muted">Mortal代役AI：${AI_INFO()}。</p></div>
  </div>`;
  $('#s-back').onclick=renderHome;
  $$('[data-k]').forEach(b=>b.onclick=()=>{ CFG[b.dataset.k]=b.dataset.v; saveCfg(); if(b.dataset.k==='mode') applyLayout(); renderSettings(); });
  $$('[data-name]').forEach(i=>i.onchange=()=>{ CFG.names[+i.dataset.name]=i.value.trim()||CFG.names[+i.dataset.name]; saveCfg(); });
  $('#s-exp').onclick=async()=>{
    const data={app:'mahjong-local',v:1,exportedAt:Date.now(),games:await Store.listGames(),memos:await Store.listMemos()};
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='local-mahjong-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#s-imp').onchange=async e=>{
    const f=e.target.files[0]; if(!f) return;
    try{ const j=JSON.parse(await f.text()); let n=0;
      const ex=new Set((await Store.listGames()).map(g=>g.id));
      for(const g of (j.games||[])) if(!ex.has(g.id)){ await Store.saveGame(g); n++; }
      for(const m of (j.memos||[])) await Store.saveMemo(m);
      toast(n+'半荘を読み込みました'); }catch(err){ toast('読み込めませんでした: '+err.message); }
  };
}

/* ================= 起動 ================= */
async function boot(){
  applyLayout();
  Store.askPersist();
  const m=location.hash.match(/game=([\w-]+)(?:&d=(\d+))?/);
  if(m){ await openViewer(m[1],{dec:m[2]!=null?+m[2]:null}); return; }
  renderHome();
}
if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
window.addEventListener('hashchange',()=>{ const m=location.hash.match(/game=([\w-]+)(?:&d=(\d+))?/); if(m) openViewer(m[1],{dec:m[2]!=null?+m[2]:null}); });
boot();
// テスト用に内部状態を公開
window.__ML={get RV(){return RV;},set fast(v){ CPU_MS=v?0:300; },get G(){return G;},get REC(){return REC;},get PEND(){return PEND;},choose,CFG,renderGame,applyLayout};
})();
