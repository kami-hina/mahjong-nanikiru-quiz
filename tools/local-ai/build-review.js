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
const {cv}=require('./dataset.js');
const dir=process.argv[2];
const BK={E:0,S:1,W:2,N:3};
function actCode(a,hand){
  switch(a.type){
    case 'dahai': return 'd'+cv(a.pai);
    case 'reach': return 'r';
    case 'chi': return 'c'+a.consumed.map(cv).join('');
    case 'pon': return 'p'+a.consumed.map(cv).join('');
    case 'daiminkan': return 'm';
    case 'ankan': { // Mortal は加槓も ankan で表すので、手牌に4枚ないときは加槓
      const k=MJ.kind(cv(a.consumed[0])); const n=hand.filter(t=>MJ.kind(t)===k).length;
      if(n<4){ const t=hand.find(t=>MJ.kind(t)===k)||cv(a.consumed[0]); return 'k'+t; }
      return 'a'+MJ.kname(k); }
    case 'kakan': return 'k'+cv(a.pai);
    case 'hora': return 'h';
    case 'none': return 'n';
    case 'ryukyoku': return 'y';
  }
  return '?';
}
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
  const PID=rep.player_id|0, log=rep.mjai_log;
  const rid=f.replace('.json','');
  const src=MAIN.has(rid)? 'main' : V2.has(rid)? 'v2' : 'other';
  const gi=out.games.length; out.games.push({id:rid,pid:PID,src});
  let K=null, st=null, ki=-1, entries=[], ptr=0;
  const kyIdx=[];
  const tryMatch=(lastActor,tile)=>{
    for(let i=ptr;i<Math.min(entries.length,ptr+3);i++){
      const e=entries[i];
      if(e.tiles_left!==st.left||e.last_actor!==lastActor||cv(e.tile)!==tile) continue;
      if((e.state.tehai||[]).map(cv).sort().join()!==st.hands[PID].slice().sort().join()) continue;
      const hand=st.hands[PID];
      let cands=e.details.map(d=>[actCode(d.action,hand),d.prob]).filter(x=>x[1]>=0.0005||x===e.details[0]);
      cands.sort((a,b)=>b[1]-a[1]);
      // すべての合法手（確率が小さいものも選べるように）
      const legal=[...new Set(e.details.map(d=>actCode(d.action,hand)))];
      K.en.push({p:K.n,e:actCode(e.expected,hand),a:actCode(e.actual,hand),
        c:cands.slice(0,10).map(x=>x[0]+':'+(+x[1].toPrecision(3))).join('|'),l:legal.join(' '),s:e.shanten});
      ptr=i+1; nEnt++; return true;
    }
    return false;
  };
  for(const ev of log){
    if(ev.type==='start_kyoku'){
      ki++;
      st={left:70,hands:ev.tehais.map(h=>h.map(cv)),pending:-1};
      entries=(rep.review.kyokus[ki]&&rep.review.kyokus[ki].entries)||[]; ptr=0;
      K={g:gi,ki,b:BK[ev.bakaze],k:ev.kyoku,h:ev.honba,kt:ev.kyotaku,o:ev.oya,s:ev.scores.slice(),pid:PID,
         th:st.hands.map(h=>h.join('')).join(' '),dr:cv(ev.dora_marker),ev:[],res:[],en:[],n:0};
      kyIdx.push(out.kyokus.length); out.kyokus.push(K);
      continue;
    }
    if(!K) continue;
    let tok=null;
    switch(ev.type){
      case 'tsumo': { st.left--; const t=cv(ev.pai); st.hands[ev.actor].push(t); tok='t'+ev.actor+t; break; }
      case 'dahai': { const t=cv(ev.pai); const h=st.hands[ev.actor]; const i=h.indexOf(t); if(i>=0) h.splice(i,1); tok='d'+ev.actor+t+(ev.tsumogiri?'*':''); break; }
      case 'reach': tok='r'+ev.actor; break;
      case 'reach_accepted': tok='R'+ev.actor; break;
      case 'chi': case 'pon': case 'daiminkan': { const c=ev.consumed.map(cv); const h=st.hands[ev.actor]; c.forEach(x=>{ const i=h.indexOf(x); if(i>=0) h.splice(i,1); });
        tok={chi:'c',pon:'p',daiminkan:'m'}[ev.type]+ev.actor+ev.target+cv(ev.pai)+c.join(''); break; }
      case 'ankan': { const c=ev.consumed.map(cv); const h=st.hands[ev.actor]; c.forEach(x=>{ const i=h.indexOf(x); if(i>=0) h.splice(i,1); }); tok='a'+ev.actor+c.join(''); break; }
      case 'kakan': { const t=cv(ev.pai); const h=st.hands[ev.actor]; const i=h.indexOf(t); if(i>=0) h.splice(i,1); tok='k'+ev.actor+t+ev.consumed.map(cv).join(''); break; }
      case 'dora': tok='D'+cv(ev.dora_marker); break;
      case 'hora': tok='h'+ev.actor+ev.target; K.res.push({t:'h',a:ev.actor,tg:ev.target,d:ev.deltas,u:(ev.ura_markers||[]).map(cv),hand:st.hands[ev.actor].join('')}); break;
      case 'ryukyoku': tok='y'; K.res.push({t:'y',d:ev.deltas||[0,0,0,0],hands:st.hands.map(h=>h.join(''))}); break;
      case 'end_kyoku': K=null; break;
    }
    if(tok&&K){ K.ev.push(tok); K.n++;
      if(ev.type==='tsumo'&&ev.actor===PID) tryMatch(PID,cv(ev.pai));
      else if(ev.type==='dahai'&&ev.actor!==PID) tryMatch(ev.actor,cv(ev.pai));
      else if((ev.type==='chi'||ev.type==='pon')&&ev.actor===PID) tryMatch(PID,cv(ev.pai));
      else if(ev.type==='kakan'&&ev.actor!==PID) tryMatch(ev.actor,cv(ev.pai));
    }
  }
  // 同じ牌譜の次の局（終局なら -1）
  kyIdx.forEach((x,i)=>{ out.kyokus[x].nx= i+1<kyIdx.length? kyIdx[i+1] : -1; });
  const tot=rep.review.kyokus.reduce((a,k)=>a+k.entries.length,0);
  nMiss+=tot-out.kyokus.filter(k=>k.g===gi).reduce((a,k)=>a+k.en.length,0);
}
for(const k of out.kyokus){ k.ev=k.ev.join(' '); delete k.n; }
const js='/* 復習半荘モード用データ（tools/local-ai/build-review.js が自動生成。手で編集しない）\n   共有された牌譜（Mortal のレビュー '+out.games.length+'半荘）の各局の進行と、あなたの判断ごとの本物の Mortal の評価 */\n'
  +'(function(root){ root.ML_REVIEW='+JSON.stringify(out)+'; })(typeof window!=="undefined"?window:globalThis);\n';
fs.writeFileSync(path.join(__dirname,'../../local/review-data.js'),js);
const cnt={}; out.games.forEach(g=>cnt[g.src]=(cnt[g.src]||0)+1);
console.log('sources',JSON.stringify(cnt));
console.log('games',out.games.length,'kyokus',out.kyokus.length,'entries',nEnt,'unmatched',nMiss,'size',(js.length/1024/1024).toFixed(2)+'MB');
