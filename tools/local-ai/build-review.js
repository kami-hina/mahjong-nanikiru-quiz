/* 復習半荘モード用のデータを作る（local/review-data.js）
   node build-review.js <reportディレクトリ>
   Mortal のレポートから、各局の実際の進行（配牌・ツモ・打牌・鳴き…）と、
   レビュー対象プレイヤー（あなた）の判断ごとの本物の Mortal の評価（推奨・実戦・候補の確率）を取り出して、小さく詰める。
   イベントの表記（空白区切り）: t{席}{牌}=ツモ d{席}{牌}[*]=打牌(*はツモ切り) r{席}=リーチ宣言 R{席}=リーチ成立
     c/p{席}{相手}{鳴いた牌}{手牌2枚}=チー/ポン m{席}{相手}{牌}{手牌3枚}=大明槓 a{席}{手牌4枚}=暗槓 k{席}{牌}{元の3枚}=加槓
     D{牌}=新ドラ h{席}{相手}=和了 y=流局
   行動の表記: d5m / r / c3m4m(チーで使う手牌) / p5m0m / m / a1z / k5m / h / n(スルー) / y(九種九牌) */
const fs=require('fs'), path=require('path');
const MJ=require('../../local/mj-core.js');
const dir=process.argv[2];
const RB=require('../../local/review-build.js');
const out={v:2,games:[],kyokus:[]};
// 出どころ: 牌譜データ.json / 牌譜データv3*.txt の半荘は「復習半荘」用（main）、牌譜データv2 だけにある半荘は学習用（v2）
const root=path.join(__dirname,'..','..');
const idsIn=f=>{ const p=path.join(root,f); if(!fs.existsSync(p)) return new Set(); const s=fs.readFileSync(p,'utf8'); const out=new Set(); const re=/report\/([0-9a-f]{6,})\.json/g; let m; while((m=re.exec(s))) out.add(m[1]); return out; };
const MAIN=new Set(), V2=new Set();
for(const f of fs.readdirSync(root).filter(f=>/^牌譜データ.*\.(json|txt)$/.test(f))){
  const ids=idsIn(f); const isV2=/^牌譜データv2/.test(f);
  ids.forEach(id=>(isV2?V2:MAIN).add(id)); }
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
let nEnt=0, nMiss=0;
for(const f of files){
  const rep=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  if(!rep.review||!rep.mjai_log||rep.game_length!=='Hanchan') continue;
  const rid=f.replace('.json','');
  const src=MAIN.has(rid)? 'main' : V2.has(rid)? 'v2' : 'other';
  const gi=out.games.length; out.games.push({id:rid,pid:rep.player_id|0,src});
  const r=RB.fromReport(rep,gi,out.kyokus.length);
  out.kyokus.push(...r.kyokus); nEnt+=r.entries; nMiss+=r.total-r.entries;
}
/* ---- 牌譜データv3 の天鳳牌譜（Mortal 未解析）を追加する ----
   同じ半荘の Mortal レポートがあればそちらを使う（配牌で照合）。無ければ天鳳の牌譜から同じ手牌・同じ進行を再現し、
   あなたの判断の場面ごとに Mortal代役AI の評価を付ける（sub:1 = 代役）。 */
{
  global.MJ=MJ;
  require('../../local/ai-weights.js');
  const AI=require('../../local/mj-ai.js');
  const {Game}=require('../../local/mj-game.js');
  require('../../local/ui-common.js');
  const UI=globalThis.MLUI;
  const {toEvents}=require('./tenhou6.js');
  const tdir=path.join(dir,'..','tenhou');
  const v3=new Set();
  for(const f of fs.readdirSync(root).filter(f=>/^牌譜データv3.*\.txt$/.test(f)))
    (fs.readFileSync(path.join(root,f),'utf8').match(/log=[\w-]+/g)||[]).forEach(x=>v3.add(x.slice(4)));
  // 既存レポートの配牌の署名（東1局の4人の配牌）
  const sigOf=tehais=>tehais.map(h=>h.slice().sort().join('')).join('|');
  const repSig=new Map();
  out.kyokus.forEach(K=>{ if(K.ki===0) repSig.set(sigOf(K.th.split(' ').map(x=>x.match(/../g))),K.g); });
  const codeOf=a=>{ switch(a.type){ case 'dahai': return 'd'+a.pai; case 'reach': return 'r'; case 'chi': return 'c'+a.consumed.slice().sort().join(''); case 'pon': return 'p'+a.consumed.slice().sort().join('');
    case 'daiminkan': return 'm'; case 'ankan': return 'a'+MJ.kname(MJ.kind(a.consumed[0])); case 'kakan': return 'k'+a.pai; case 'hora': return 'h'; case 'none': return 'n'; case 'ryukyoku': return 'y'; } return '?'; };
  const tokOf=e=>{ switch(e.type){
    case 'tsumo': return 't'+e.actor+e.pai; case 'dahai': return 'd'+e.actor+e.pai+(e.tsumogiri?'*':'');
    case 'reach': return 'r'+e.actor; case 'reach_accepted': return 'R'+e.actor;
    case 'chi': case 'pon': case 'daiminkan': return {chi:'c',pon:'p',daiminkan:'m'}[e.type]+e.actor+e.target+e.pai+e.consumed.join('');
    case 'ankan': return 'a'+e.actor+e.consumed.join(''); case 'kakan': return 'k'+e.actor+e.pai+e.consumed.join('');
    case 'dora': return 'D'+e.dora_marker; case 'hora': return 'h'+e.actor+e.target; case 'ryukyoku': return 'y'; } return null; };
  function fakeGame(v,afterCall,kuikae){
    const g=Object.create(Game.prototype);
    Object.assign(g,{oya:v.oya,bakaze:v.bakaze,kyoku:v.kyoku,honba:v.honba,kyotaku:v.kyotaku,scores:v.scores.slice()});
    const anyMeld=v.melds.some(ms=>ms.length);
    const kans=v.melds.reduce((a,ms)=>a+ms.filter(m=>m.type!=='chi'&&m.type!=='pon').length,0);
    g.k={hands:v.hands.map(h=>h.slice()),melds:v.melds.map(ms=>ms.map(m=>({type:m.type,tiles:m.tiles.slice(),from:m.from,pai:m.pai}))),rivers:v.rivers,
      riichi:v.riichi.slice(),riichiSeq:v.riichiSeq.slice(),doubleRiichi:[0,0,0,0],ippatsu:[0,0,0,0],furitenTemp:[0,0,0,0],furitenRiichi:[0,0,0,0],
      firstTurn:[0,1,2,3].map(s=>v.rivers[s].length===0&&!anyMeld?1:0),anyCall:anyMeld,kans,kanBy:[0,0,0,0],drawn:v.drawn.slice(),afterCall:!!afterCall,kuikae:kuikae||[],
      wall:new Array(v.left),dead:[],rinshan:false,doraCount:v.dora.length};
    g.doraIndicators=()=>v.dora.slice(); g.uraIndicators=()=>[];
    return g;
  }
  let added=0, matched=0, nSub=0;
  for(const id of v3){
    const f=path.join(tdir,id+'.json'); if(!fs.existsSync(f)) { console.error('天鳳の牌譜が未取得:',id); continue; }
    const T=JSON.parse(fs.readFileSync(f,'utf8')), PID=T.tw|0;
    const events=toEvents(T.data);
    const firstStart=events.find(e=>e.type==='start_kyoku');
    const rg=repSig.get(sigOf(firstStart.tehais));
    if(rg!=null){ out.games[rg].src='main'; out.games[rg].tenhou=id; matched++; continue; } // Mortal レポートがある → 本物の Mortal を使う
    const gi=out.games.length; out.games.push({id:'tenhou-'+id,pid:PID,src:'main',sub:1,tenhou:id});
    const kyIdx=[];
    let cur=null;
    const flush=()=>{
      if(!cur) return;
      const st=cur.start;
      const K={g:gi,ki:kyIdx.length,b:st.bakaze,k:st.kyoku,h:st.honba,kt:st.kyotaku,o:st.oya,s:st.scores.slice(),pid:PID,
        th:st.tehais.map(h=>h.join('')).join(' '),dr:st.dora_marker,ev:[],res:[],en:[],sub:1};
      const kev=cur.ev;
      for(const e of kev){ const t=tokOf(e); if(t) K.ev.push(t);
        if(e.type==='hora') K.res.push({t:'h',a:e.actor,tg:e.target,d:e.deltas,u:e.ura_markers||[],hand:''});
        if(e.type==='ryukyoku') K.res.push({t:'y',d:e.deltas||[0,0,0,0]}); }
      // 判断の場面（トークン p 個を適用した直後）
      const tokEv=kev.filter(e=>tokOf(e));
      const frames=UI.replayLog([{type:'start_game',names:['','','','']},st].concat(tokEv))[0].frames;
      for(let pIdx=1;pIdx<=tokEv.length;pIdx++){
        const prev=tokEv[pIdx-1], F=frames[pIdx]; if(!F) break; const v=F.view;
        let kind=null, legal=[], ctxTile=null, ctxFrom=null;
        if(prev.actor===PID&&(prev.type==='tsumo'||prev.type==='chi'||prev.type==='pon')){
          const g=fakeGame(v,prev.type!=='tsumo',prev.type!=='tsumo'? Game.prototype.kuikaeBan.call(null,prev.consumed,prev.pai,prev.type):[]);
          legal=g.selfActions(PID); kind='self';
          if(v.riichi[PID]) legal=legal.filter(a=>a.type!=='dahai'||a.tsumogiri);
        } else if(prev.actor===PID&&prev.type==='reach'){
          const g=fakeGame(v,false,[]); legal=g.discardable(PID,true).map(t=>({type:'dahai',pai:t,tsumogiri:t===v.drawn[PID]})); kind='riichi_discard';
        } else if(prev.actor!==PID&&(prev.type==='dahai'||prev.type==='kakan')){
          const g=fakeGame(v,false,[]); ctxTile=prev.pai; ctxFrom=prev.actor;
          legal=g.reactActions(PID,prev.pai,prev.actor,{chankan:prev.type==='kakan'}); kind='react';
        }
        if(!kind) continue;
        const codes=[...new Set(legal.map(codeOf))];
        if(codes.length<=1) continue;
        // 実際の行動
        let act='n';
        for(let q=pIdx;q<tokEv.length;q++){ const e=tokEv[q];
          if(e.type==='dora'||(e.type==='reach_accepted'&&e.actor!==PID)) continue;
          if(kind==='react'){ if(e.actor===PID&&['chi','pon','daiminkan'].includes(e.type)) act=codeOf(e); else if(e.type==='hora'&&e.actor===PID) act='h'; else if(e.type==='hora'){ continue; } break; }
          if(e.actor!==PID){ if(e.type==='hora') continue; break; }
          if(e.type==='hora') act='h'; else if(e.type==='ryukyoku') act='y'; else act=codeOf(e);
          break; }
        // Mortal代役AIの評価
        const obs={me:PID,oya:v.oya,bakaze:v.bakaze,kyoku:v.kyoku,honba:v.honba,kyotaku:v.kyotaku,scores:v.scores.slice(),dora:v.dora.slice(),left:v.left,
          hand:v.hands[PID].slice(),drawn:v.drawn[PID],melds:v.melds,rivers:v.rivers,riichiSeq:v.riichiSeq,last:kind==='react'?{actor:ctxFrom,pai:ctxTile}:null,
          allLast:(v.bakaze===1&&v.kyoku===4)||v.bakaze>=2};
        let list=AI.evaluate(obs,legal);
        const hi=list.findIndex(c=>c.action.type==='hora'); if(hi>0){ const x=list.splice(hi,1)[0]; x.prob=Math.max(x.prob,0.995); const r=list.reduce((a,c)=>a+c.prob,0)||1; list.forEach(c=>c.prob=c.prob/r*(1-x.prob)); list.unshift(x); }
        const seen=new Set(); const cands=[];
        for(const c of list){ const cd=codeOf(c.action); if(seen.has(cd)) continue; seen.add(cd); cands.push([cd,c.prob]); }
        K.en.push({p:pIdx,e:cands[0][0],a:act,c:cands.slice(0,10).map(x=>x[0]+':'+(+x[1].toPrecision(3))).join('|'),l:codes.join(' '),
          s:MJ.shanten(MJ.counts(v.hands[PID]),v.melds[PID].length),sub:1});
        nSub++;
      }
      kyIdx.push(out.kyokus.length); out.kyokus.push(K);
      cur=null;
    };
    for(const e of events){
      if(e.type==='start_kyoku'){ flush(); cur={start:e,ev:[]}; continue; }
      if(e.type==='end_kyoku'){ flush(); continue; }
      if(cur) cur.ev.push(e);
    }
    flush();
    kyIdx.forEach((x,i)=>{ out.kyokus[x].nx= i+1<kyIdx.length? kyIdx[i+1] : -1; });
    added++;
  }
  console.log('牌譜データv3: 天鳳牌譜から追加',added,'半荘（Mortal代役の評価',nSub,'場面） / Mortalレポートと照合済み',matched,'半荘');
}
for(const k of out.kyokus){ k.ev=Array.isArray(k.ev)? k.ev.join(' ') : k.ev; delete k.n; }
const js='/* 復習半荘モード用データ（tools/local-ai/build-review.js が自動生成。手で編集しない）\n   共有された牌譜（Mortal のレビュー '+out.games.length+'半荘）の各局の進行と、あなたの判断ごとの本物の Mortal の評価 */\n'
  +'(function(root){ root.ML_REVIEW='+JSON.stringify(out)+'; })(typeof window!=="undefined"?window:globalThis);\n';
fs.writeFileSync(path.join(__dirname,'../../local/review-data.js'),js);
const cnt={}; out.games.forEach(g=>cnt[g.src]=(cnt[g.src]||0)+1);
console.log('sources',JSON.stringify(cnt));
console.log('games',out.games.length,'kyokus',out.kyokus.length,'entries',nEnt,'unmatched',nMiss,'size',(js.length/1024/1024).toFixed(2)+'MB');
