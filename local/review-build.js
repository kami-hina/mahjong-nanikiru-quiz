/* Mortal のレポート（mjai.ekyu.moe の report JSON）1半荘を、復習半荘モード用のデータ（ML_REVIEW の kyokus と同じ形）に変換する。
   tools/local-ai/build-review.js（牌譜データからまとめて作る）と、
   何切るクイズの「復習半荘モードに追加」（取り込んだ牌譜をブラウザで1半荘ずつ追加）の両方で使う。
   イベント・行動の表記は build-review.js の先頭のコメントを参照。 */
(function(root){
"use strict";
const MJ2={E:'1z',S:'2z',W:'3z',N:'4z',P:'5z',F:'6z',C:'7z'};
const cv=p=>{ if(!p) return null; if(MJ2[p]) return MJ2[p]; if(/^5[mps]r$/.test(p)) return '0'+p[1]; return p; };
const SUITS='mpsz';
const kind=t=>{ const n=t.charCodeAt(0)-48, s=SUITS.indexOf(t[1]); return s===3? 27+n-1 : s*9+(n===0?4:n-1); };
const kname=k=>k>=27? (k-26)+'z' : ((k%9)+1)+SUITS[(k/9)|0];
const BK={E:0,S:1,W:2,N:3};
function actCode(a,hand){
  switch(a.type){
    case 'dahai': return 'd'+cv(a.pai);
    case 'reach': return 'r';
    case 'chi': return 'c'+a.consumed.map(cv).join('');
    case 'pon': return 'p'+a.consumed.map(cv).join('');
    case 'daiminkan': return 'm';
    case 'ankan': { // Mortal は加槓も ankan で表すので、手牌に4枚ないときは加槓
      const k=kind(cv(a.consumed[0])); const n=hand.filter(t=>kind(t)===k).length;
      if(n<4){ const t=hand.find(t=>kind(t)===k)||cv(a.consumed[0]); return 'k'+t; }
      return 'a'+kname(k); }
    case 'kakan': return 'k'+cv(a.pai);
    case 'hora': return 'h';
    case 'none': return 'n';
    case 'ryukyoku': return 'y';
  }
  return '?';
}
/* rep: レポート、gi: games の中での番号、base: kyokus の中でこの半荘の最初の局が入る位置
   戻り値: {kyokus, entries: 照合できた判断の数, total: レポートの判断の数} */
function fromReport(rep,gi,base){
  const PID=rep.player_id|0, log=rep.mjai_log||[];
  const kyokus=[];
  let K=null, st=null, ki=-1, entries=[], ptr=0, nEnt=0;
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
      kyokus.push(K);
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
  kyokus.forEach((x,i)=>{ x.nx= i+1<kyokus.length? base+i+1 : -1; x.ev=x.ev.join(' '); delete x.n; });
  const total=rep.review.kyokus.reduce((a,k)=>a+k.entries.length,0);
  return {kyokus,entries:nEnt,total};
}
const RB={cv,actCode,fromReport};
root.MLReviewBuild=RB;
if(typeof module!=='undefined'&&module.exports) module.exports=RB;
})(typeof window!=='undefined'?window:globalThis);
