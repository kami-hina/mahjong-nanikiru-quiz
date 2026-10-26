/* Mortal のレポート（mjai.ekyu.moe の report JSON）を再生して、
   レビュー対象プレイヤーの各判断時点の局面（obs）・合法手・Mortal の確率分布を取り出す。
   使い方: const {loadDataset}=require('./dataset.js'); loadDataset(dir) */
const fs=require('fs'), path=require('path');
const MJ=require('../../local/mj-core.js');
const MJ2={E:'1z',S:'2z',W:'3z',N:'4z',P:'5z',F:'6z',C:'7z'};
const cv=p=>{ if(!p) return null; if(MJ2[p]) return MJ2[p]; if(/^5[mps]r$/.test(p)) return '0'+p[1]; return p; };
const BK={E:0,S:1,W:2,N:3};
function cvAction(a){
  const o={type:a.type};
  if(a.pai) o.pai=cv(a.pai);
  if(a.consumed) o.consumed=a.consumed.map(cv);
  if(a.type==='dahai') o.tsumogiri=!!a.tsumogiri;
  return o;
}
const msKey=a=>a.slice().sort().join(',');
function replayReport(rep,fileId){
  const PID=rep.player_id|0, log=rep.mjai_log;
  const out=[];
  let st=null, ki=-1, seq=0;
  const kyokus=rep.review.kyokus;
  let entries=[], ptr=0;
  // 対局全体の局数（オーラス判定用）
  const starts=log.filter(e=>e.type==='start_kyoku');
  const mkObs=(last)=>({
    me:PID, oya:st.oya, bakaze:st.bakaze, kyoku:st.kyoku, honba:st.honba, kyotaku:st.kyotaku,
    scores:st.scores.slice(), dora:st.dora.slice(), left:st.left,
    hand:st.hands[PID].slice(), drawn:st.drawn[PID],
    melds:st.melds.map(ms=>ms.map(m=>({type:m.type,tiles:m.tiles.slice(),from:m.from,pai:m.pai}))),
    rivers:st.rivers.map(r=>r.map(d=>Object.assign({},d))),
    riichiSeq:st.riichiSeq.slice(), last, allLast:st.bakaze>=1&&st.kyoku===4
  });
  const tryMatch=(last,lastActor,tile)=>{
    // 現在の局面がレビュー対象の判断ポイントかどうか
    for(let i=ptr;i<Math.min(entries.length,ptr+3);i++){
      const e=entries[i];
      if(e.tiles_left!==st.left) continue;
      if(e.last_actor!==lastActor) continue;
      if(cv(e.tile)!==tile) continue;
      if(msKey((e.state.tehai||[]).map(cv))!==msKey(st.hands[PID])) continue;
      out.push({file:fileId,ki,ei:i,obs:mkObs(last),entry:e});
      ptr=i+1; return true;
    }
    return false;
  };
  for(const ev of log){
    if(ev.type==='start_kyoku'){
      ki++;
      st={bakaze:BK[ev.bakaze],kyoku:ev.kyoku,honba:ev.honba,kyotaku:ev.kyotaku,oya:ev.oya,scores:ev.scores.slice(),
          dora:[cv(ev.dora_marker)],left:70,hands:ev.tehais.map(h=>h.map(cv)),drawn:[null,null,null,null],
          melds:[[],[],[],[]],rivers:[[],[],[],[]],riichiSeq:[-1,-1,-1,-1],pending:-1};
      entries=(kyokus[ki]&&kyokus[ki].entries)||[]; ptr=0;
      continue;
    }
    if(!st) continue;
    switch(ev.type){
      case 'tsumo': { st.left--; const t=cv(ev.pai); st.hands[ev.actor].push(t); st.drawn[ev.actor]=t;
        if(ev.actor===PID) tryMatch(null,PID,t); break; }
      case 'dahai': { const t=cv(ev.pai); const h=st.hands[ev.actor]; const i=h.indexOf(t); if(i>=0) h.splice(i,1); else throw new Error('dahai missing '+t);
        st.drawn[ev.actor]=null;
        const riichi=st.pending===ev.actor;
        st.rivers[ev.actor].push({pai:t,tsumogiri:!!ev.tsumogiri,riichi,called:false,seq:seq++});
        if(riichi){ st.riichiSeq[ev.actor]=seq-1; st.pending=-1; }
        if(ev.actor!==PID) tryMatch({actor:ev.actor,pai:t},ev.actor,t);
        break; }
      case 'reach': st.pending=ev.actor; break;
      case 'reach_accepted': st.scores[ev.actor]-=1000; st.kyotaku++; break;
      case 'chi': case 'pon': case 'daiminkan': {
        const h=st.hands[ev.actor]; for(const c of ev.consumed.map(cv)){ const i=h.indexOf(c); if(i>=0) h.splice(i,1); else throw new Error('call missing'); }
        const r=st.rivers[ev.target]; if(r.length) r[r.length-1].called=true;
        st.melds[ev.actor].push({type:ev.type,tiles:ev.consumed.map(cv).concat([cv(ev.pai)]),from:ev.target,pai:cv(ev.pai)});
        st.drawn[ev.actor]=null;
        if(ev.actor===PID&&ev.type!=='daiminkan') tryMatch(null,PID,cv(ev.pai));
        break; }
      case 'ankan': { const h=st.hands[ev.actor]; for(const c of ev.consumed.map(cv)){ const i=h.indexOf(c); if(i>=0) h.splice(i,1); }
        st.melds[ev.actor].push({type:'ankan',tiles:ev.consumed.map(cv),from:ev.actor,pai:null}); st.drawn[ev.actor]=null; break; }
      case 'kakan': { const h=st.hands[ev.actor]; const t=cv(ev.pai); const i=h.indexOf(t); if(i>=0) h.splice(i,1);
        const m=st.melds[ev.actor].find(m=>m.type==='pon'&&MJ.kind(m.tiles[0])===MJ.kind(t)); if(m){ m.type='kakan'; m.tiles.push(t); }
        st.drawn[ev.actor]=null;
        if(ev.actor!==PID) tryMatch({actor:ev.actor,pai:t,kakan:true},ev.actor,t);
        break; }
      case 'dora': st.dora.push(cv(ev.dora_marker)); break;
      case 'hora': if(ev.deltas) for(let p=0;p<4;p++) st.scores[p]+=ev.deltas[p]; break;
      case 'ryukyoku': if(ev.deltas) for(let p=0;p<4;p++) st.scores[p]+=ev.deltas[p]; break;
    }
  }
  return out;
}
function loadDataset(dir,opts){
  opts=opts||{};
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
  const all=[]; let miss=0, tot=0;
  for(const f of files){
    const rep=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
    if(!rep.review||!rep.mjai_log) continue;
    const pts=replayReport(rep,f.replace('.json',''));
    let n=0; for(const k of rep.review.kyokus) n+=k.entries.length;
    tot+=n; miss+=n-pts.length;
    for(const p of pts){
      const e=p.entry;
      const fix=a=>{ // Mortal は加カンも ankan（4枚）で表すので、手牌に4枚ない場合は加カンに直す
        if(a.type==='ankan'){ const k=MJ.kind(a.consumed[0]); const n=p.obs.hand.filter(t=>MJ.kind(t)===k).length;
          if(n<4){ const t=p.obs.hand.find(t=>MJ.kind(t)===k)||a.consumed[0]; return {type:'kakan',pai:t}; } }
        return a; };
      const acts=e.details.map(d=>({action:fix(cvAction(d.action)),prob:d.prob,q:d.q_value}));
      all.push({file:p.file,ki:p.ki,ei:p.ei,obs:p.obs,acts,expected:fix(cvAction(e.expected)),actual:fix(cvAction(e.actual)),
        isEqual:e.is_equal,shanten:e.shanten,riichiAfter:!!e.at_self_riichi});
    }
  }
  if(!opts.quiet) console.error(`files=${files.length} entries=${tot} matched=${all.length} unmatched=${miss}`);
  return all;
}
module.exports={loadDataset,replayReport,cv,cvAction};
