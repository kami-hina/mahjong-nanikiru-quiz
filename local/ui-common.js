/* ローカル麻雀の画面部品（対局画面・牌譜ビューア・要チェック・何切るクイズ連携で共用）
   ・boardSVG(view, opt): 卓（河・副露・手牌・中央の点数表示）をSVGで描く
   ・candHTML(list, opt): Mortal の検討画面風の候補一覧（％とバー）
   ・quizItem(...): 何切るクイズ（index.html）の問題形式に変換
   ・passedSuji(obs, o): 相手 o に通っている筋（18本） */
(function(root){
"use strict";
const MJ=root.MJ;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TILEDIR=root.ML_TILEDIR||'tiles/';
const tileURL=t=>TILEDIR+(t==='back'?'back':t)+'.svg';
const TILE_AR=44/34;
const WIND=['東','南','西','北'];
const REL=['自分','下家','対面','上家'];
function tileImg(t,cls){ return `<img class="${cls||'tile'}" src="${tileURL(t)}" alt="${esc(MJ.tileName(t))}" draggable="false">`; }
// SVG 内に牌を1枚置く（x,y は左上、w は幅）
function put(t,x,y,w,o){
  o=o||{};
  const h=w*TILE_AR, p=w*0.06, iw=w-2*p, ih=iw*4/3, r=w*0.12;
  let s=`<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})${o.rot?` rotate(${o.rot} ${(w/2).toFixed(1)} ${(h/2).toFixed(1)})`:''}"${o.op?` opacity="${o.op}"`:''}>`;
  if(t==='back'){ s+=`<rect width="${w}" height="${h}" rx="${r}" fill="#d9a441" stroke="rgba(0,0,0,.35)" stroke-width="${Math.max(.6,w*0.03)}"/>`
    +`<rect x="${w*0.12}" y="${h*0.1}" width="${w*0.76}" height="${h*0.8}" rx="${r*0.7}" fill="#e8b85a"/>`; }
  else s+=`<rect width="${w}" height="${h}" rx="${r}" fill="${o.dark?'#bfb3a6':'#f2f0ea'}" stroke="rgba(0,0,0,.35)" stroke-width="${Math.max(.6,w*0.03)}"/>`
    +`<image href="${tileURL(t)}" x="${p}" y="${p}" width="${iw}" height="${ih}"${o.dark?' opacity=".78"':''}/>`;
  if(o.ring) s+=`<rect x="-2" y="-2" width="${w+4}" height="${h+4}" rx="${r+2}" fill="none" stroke="${o.ring}" stroke-width="${Math.max(2.5,w*0.1)}"/>`;
  return s+'</g>';
}
/* ---------------- 卓の描画 ----------------
   view = {me, oya, bakaze, kyoku, honba, kyotaku, left, scores[4], dora[], riichi[4], names[4],
           hands[4](配列 or null), counts[4], drawn[4], melds[4], rivers[4], last:{actor}|null }
   opt  = {open:[bool x4] 手牌を表で描くか, skipHand:[bool x4] 手牌を描かない（自分の手牌をHTMLで出すとき）,
           hl:{seat,idx,color} 河の牌の強調, label: 中央下の補足文字 } */
const V=640, C=320;
const RW=34, RH=RW*TILE_AR;          // 河の牌
const HW=24, HH=HW*TILE_AR;          // 手牌・副露
const RIVER_Y=C+94, HAND_Y=C+238, ROW_L=92, ROW_R=548;
function riverSVG(list,hl){
  let s='', x0=C-3*RW, x=x0, y=RIVER_Y, row=0, col=0;
  list.forEach((d,i)=>{
    if((row<2&&col===6)){ row++; col=0; x=x0; y+=RH+2; }
    const w=d.riichi? RH:RW;
    const ring=(hl&&hl.idx===i)? hl.color : null;
    if(d.riichi) s+=put(d.pai,x+(RH-RW)/2,y,RW,{rot:90,dark:d.tsumogiri,op:d.called?0.35:null,ring});
    else s+=put(d.pai,x,y,RW,{dark:d.tsumogiri,op:d.called?0.35:null,ring});
    x+=w+1; col++;
  });
  return s;
}
// 副露を右端から左へ並べる。返り値 [svg, 左端x]
function meldsSVG(melds,owner,right,y){
  let s='', x=right;
  for(let mi=melds.length-1;mi>=0;mi--){
    const m=melds[mi];
    const rel=m.type==='ankan'? -1 : (m.from-owner+4)%4; // 1:下家 2:対面 3:上家
    let tiles=m.tiles.slice();
    if(m.type==='ankan'){
      const arr=[ 'back', tiles[1], tiles[2], 'back' ];
      for(let i=arr.length-1;i>=0;i--){ x-=HW; s+=put(arr[i],x,y,HW); }
      x-=6; continue;
    }
    // 鳴いた牌を横にする位置
    let base=m.type==='kakan'? tiles.slice(0,3) : tiles.slice();
    const called=m.pai||base[base.length-1];
    // 鳴いた牌をいったん除く
    const ci=base.lastIndexOf(called); const rest=base.slice(); if(ci>=0) rest.splice(ci,1);
    rest.sort((a,b)=>MJ.tkey(a)-MJ.tkey(b));
    let pos = rel===3? 0 : rel===2? 1 : rest.length; // 上家=左, 対面=真ん中, 下家=右
    if(m.type==='daiminkan'&&rel===2) pos=1;
    const seq=rest.slice(); seq.splice(pos,0,{side:called});
    for(let i=seq.length-1;i>=0;i--){
      const t=seq[i];
      if(t&&t.side){ x-=HH; s+=put(t.side,x+(HH-HW)/2,y+(HH-HW),HW,{rot:90});
        if(m.type==='kakan') s+=put(m.tiles[3],x+(HH-HW)/2,y+(HH-HW)-HW-1,HW,{rot:90}); }
      else { x-=HW; s+=put(t,x,y,HW); }
    }
    x-=6;
  }
  return [s,x];
}
function handSVG(v,seat,open,showDrawn){
  const hand=v.hands&&v.hands[seat];
  const n=hand? hand.length : (v.counts?v.counts[seat]:13);
  let s='', x=ROW_L;
  let tiles;
  if(open&&hand){
    const dr=v.drawn&&v.drawn[seat];
    let h=hand.slice(); let sep=null;
    if(dr&&h.length%3===2){ const i=h.lastIndexOf(dr); if(i>=0){ h.splice(i,1); sep=dr; } }
    tiles=MJ.sortTiles(h); if(sep) tiles.push(sep);
    tiles.forEach((t,i)=>{ if(sep&&i===tiles.length-1) x+=6; s+=put(t,x,HAND_Y,HW); x+=HW; });
  } else {
    for(let i=0;i<n;i++){ if(n%3===2&&i===n-1) x+=6; s+=put('back',x,HAND_Y,HW); x+=HW; }
  }
  return s;
}
function boardSVG(v,opt){
  opt=opt||{};
  let s=`<svg class="board" viewBox="0 0 ${V} ${V}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
  s+=`<rect width="${V}" height="${V}" fill="#0e3b2a"/>`;
  s+=`<rect x="${C-90}" y="${C-90}" width="180" height="180" rx="10" fill="#0a2a1e" stroke="#2f6b4f" stroke-width="2"/>`;
  for(let r=0;r<4;r++){
    const seat=(v.me+r)%4;
    let g=`<g transform="rotate(${-90*r} ${C} ${C})">`;
    const hl=(opt.hl&&opt.hl.seat===seat)? opt.hl : null;
    g+=riverSVG(v.rivers[seat]||[],hl);
    if(!(opt.skipHand&&opt.skipHand[seat])) g+=handSVG(v,seat,!!(opt.open&&opt.open[seat]));
    g+=meldsSVG(v.melds[seat]||[],seat,ROW_R,HAND_Y)[0];
    // 中央の点数（各自の向き）
    const wind=WIND[(seat-v.oya+4)%4];
    const isOya=seat===v.oya;
    const sc=v.scores[seat];
    g+=`<text x="${C}" y="${C+82}" text-anchor="middle" font-size="18" font-weight="700" fill="${r===0?'#ffd166':'#e6f2ec'}" font-family="sans-serif">`
      +`<tspan fill="${isOya?'#ff8a8a':'#9fd3b8'}">${wind}</tspan> ${sc}</text>`;
    if(v.riichi&&v.riichi[seat]) g+=`<rect x="${C-34}" y="${C+52}" width="68" height="7" rx="3.5" fill="#f4f4f4"/><circle cx="${C}" cy="${C+55.5}" r="2.6" fill="#d22"/>`;
    if(v.last&&v.last.actor===seat&&opt.turnMark!==false) g+=`<rect x="${C-50}" y="${C+86}" width="100" height="3" rx="1.5" fill="#ffd166"/>`;
    g+='</g>';
    s+=g;
  }
  // 中央
  const round=WIND[v.bakaze]+v.kyoku+'局';
  s+=`<text x="${C}" y="${C-30}" text-anchor="middle" font-size="21" font-weight="800" fill="#fff" font-family="sans-serif">${round}</text>`;
  s+=`<text x="${C}" y="${C-12}" text-anchor="middle" font-size="12" fill="#bfe3d0" font-family="sans-serif">${v.honba}本場 供託${v.kyotaku}</text>`;
  const dn=Math.min(5,v.dora.length), dw=19, dx=C-(5*dw)/2;
  for(let i=0;i<5;i++) s+= i<dn? put(v.dora[i],dx+i*dw,C-4,dw-1) : put('back',dx+i*dw,C-4,dw-1);
  s+=`<text x="${C}" y="${C+40}" text-anchor="middle" font-size="12" fill="#bfe3d0" font-family="sans-serif">残り ${v.left}</text>`;
  if(opt.label) s+=`<text x="${C}" y="${V-6}" text-anchor="middle" font-size="16" fill="#ffd166" font-family="sans-serif">${esc(opt.label)}</text>`;
  return s+'</svg>';
}

/* ---------------- 行動の表記 ---------------- */
function actionText(a,me){
  if(!a) return '―';
  const t=x=>MJ.tileName(x);
  const cons=(a.consumed||[]).map(t).join('');
  switch(a.type){
    case 'dahai': return '打 '+t(a.pai);
    case 'reach': return 'リーチ';
    case 'none': return 'スルー';
    case 'chi': return 'チー（'+cons+'）';
    case 'pon': return 'ポン（'+cons+'）';
    case 'daiminkan': return '大明槓';
    case 'ankan': return '暗槓（'+t(a.consumed[0])+'）';
    case 'kakan': return '加槓（'+t(a.pai)+'）';
    case 'hora': return a.target!=null&&a.target!==me? 'ロン' : 'ツモ和了';
    case 'ryukyoku': return '九種九牌で流局';
  }
  return a.type;
}
function actionTile(a){ return a.type==='dahai'||a.type==='kakan'? a.pai : a.type==='ankan'? a.consumed[0] : null; }
// Mortal 検討画面風の候補一覧
function candHTML(list,opt){
  opt=opt||{};
  const chosenKey=opt.chosen? root.MJAI.actKey(opt.chosen):null;
  const show=list.filter((c,i)=>(i<(opt.max||8)&&(i<3||c.prob>=0.003))||root.MJAI.actKey(c.action)===chosenKey);
  // あなたの手が候補に無い（確率がごく小さい）ときも一覧に出す
  if(chosenKey&&!show.some(c=>root.MJAI.actKey(c.action)===chosenKey)) show.push({action:opt.chosen,prob:0});
  const max=show.length?Math.max(show[0].prob,1e-9):1;
  return `<div class="cands">`+show.map((c,i)=>{
    const k=root.MJAI.actKey(c.action), isMe=chosenKey===k;
    const t=actionTile(c.action);
    return `<div class="cand${i===0?' best':''}${isMe?' mine':''}">
      <span class="rk">${i+1}</span>
      <span class="ct">${t?tileImg(t,'tile ctile'):''}<span class="cn">${esc(c.action.type==='dahai'?MJ.tileName(t):actionText(c.action,opt.me))}</span></span>
      <span class="cbar"><span style="width:${Math.max(2,c.prob/max*100).toFixed(1)}%"></span></span>
      <span class="cp">${c.prob<0.001?'<0.1':(c.prob*100).toFixed(1)}%</span>
      ${isMe?'<span class="cme">あなた</span>':''}
    </div>`; }).join('')+`</div>`;
}

/* ---------------- 筋（スジ） ----------------
   数牌の両面待ち 1-4,2-5,3-6,4-7,5-8,6-9 × 3色 = 18本。どちらかの牌が相手の安全牌なら「通っている」 */
const SUJI=[[1,4],[2,5],[3,6],[4,7],[5,8],[6,9]];
function passedSuji(obs,o){
  const safe=root.MJAI.safeSet(obs,o);
  const out=[];
  for(let si=0;si<3;si++) for(const [a,b] of SUJI){
    const ka=si*9+a-1, kb=si*9+b-1;
    out.push({suit:'mps'[si],a,b,passed:!!(safe[ka]||safe[kb])});
  }
  return out;
}

/* ---------------- 何切るクイズの問題形式に変換 ----------------
   obs: 判断時の局面（自分視点）、list: 評価（確率順）、chosen: 実際の行動、kind: 'dahai'|'riichi'|'call' */
function quizItem(gameId,n,obs,list,chosen,names,createdAt){
  const me=obs.me, rel=s=>((s-me)%4+4)%4, abs=r=>(me+r)%4;
  const best=list[0].action;
  const types=new Set(list.map(c=>c.action.type));
  const kind= (types.has('chi')||types.has('pon')||types.has('daiminkan'))&&obs.last? 'call' : (types.has('reach')? 'riichi':'dahai');
  let hand=obs.hand.slice(); let drawn=null;
  if(hand.length%3===2&&obs.drawn){ const i=hand.lastIndexOf(obs.drawn); if(i>=0){ hand.splice(i,1); drawn=obs.drawn; } }
  else if(hand.length%3===2){ drawn=null; }
  const cands=list.slice(0,16).map(c=>({tile:c.action.type==='dahai'?c.action.pai:null,type:c.action.type,text:actionText(c.action,me),prob:c.prob,q:null}));
  const actC=list.find(c=>root.MJAI.actKey(c.action)===root.MJAI.actKey(chosen));
  const junme=obs.rivers[me].length+(hand.length%3===1&&!obs.last?0:1);
  return {
    id:'local-'+gameId+'-'+n, createdAt:createdAt||Date.now(), seq:n, src:'local',
    srcUrl:'play.html#game='+gameId+'&d='+n, reportId:'local-'+gameId,
    st:{roundText:WIND[obs.bakaze]+obs.kyoku+'局', oyaRel:rel(obs.oya), honba:obs.honba, seatText:WIND[(me-obs.oya+4)%4]+'家',
        junme, left:obs.left, dora:obs.dora.slice(), scores:[0,1,2,3].map(r=>obs.scores[abs(r)]),
        riichi:[0,1,2,3].map(r=>obs.riichiSeq[abs(r)]>=0?1:0),
        rivers:[0,1,2,3].map(r=>obs.rivers[abs(r)].filter(d=>!d.called).map(d=>({pai:d.pai,t:d.tsumogiri?1:0,r:d.riichi?1:0}))),
        fuuros:[0,1,2,3].map(r=>obs.melds[abs(r)].map(m=>({type:m.type,tiles:m.tiles.slice()}))),
        hand:MJ.sortTiles(hand), drawn, names:[0,1,2,3].map(r=>names[abs(r)]),
        callRel:obs.last&&kind==='call'? rel(obs.last.actor):null, callTile:obs.last&&kind==='call'? obs.last.pai:null},
    q:{kind, answer:best.type==='dahai'?best.pai:null, actual:chosen.type==='dahai'?chosen.pai:null,
       answerText:actionText(best,me), actualText:actionText(chosen,me), answerType:best.type, actualType:chosen.type,
       answerConsumed:best.consumed&&(best.type==='chi'||best.type==='pon')? best.consumed.slice():null,
       candidates:cands, shanten:MJ.shanten(MJ.counts(obs.hand),obs.melds[me].length), furiten:false,
       severity:actC? list[0].prob-actC.prob : null, explanation:'', engine:'Mortal代役AI（ローカル）'},
    status:'new', review:false, attempts:0, correctCount:0, wrongCount:0, lastAnsweredAt:null
  };
}

/* ---------------- 牌譜の再生（ビューア用） ----------------
   log を先頭から適用して、各イベント適用後の卓の状態（全員の手牌つき）を作る */
function replayLog(log){
  const kyokus=[]; let cur=null, st=null, scores=[25000,25000,25000,25000], names=['','','',''];
  const snap=(i,text)=>({i,text,view:{me:0,oya:st.oya,bakaze:st.bakaze,kyoku:st.kyoku,honba:st.honba,kyotaku:st.kyotaku,left:st.left,
      scores:st.scores.slice(),dora:st.dora.slice(),riichi:st.riichi.slice(),names,
      hands:st.hands.map(h=>h.slice()),counts:st.hands.map(h=>h.length),drawn:st.drawn.slice(),
      melds:st.melds.map(ms=>ms.map(m=>Object.assign({},m,{tiles:m.tiles.slice()}))),
      rivers:st.rivers.map(r=>r.map(d=>Object.assign({},d))),last:st.last,riichiSeq:st.riichiSeq.slice()},hl:st.hl,ev:log[i]});
  log.forEach((ev,i)=>{
    switch(ev.type){
      case 'start_game': names=ev.names.slice(); break;
      case 'start_kyoku':
        st={oya:ev.oya,bakaze:ev.bakaze,kyoku:ev.kyoku,honba:ev.honba,kyotaku:ev.kyotaku,scores:ev.scores.slice(),dora:[ev.dora_marker],
            riichi:[0,0,0,0],riichiSeq:[-1,-1,-1,-1],hands:ev.tehais.map(h=>h.slice()),drawn:[null,null,null,null],melds:[[],[],[],[]],
            rivers:[[],[],[],[]],left:70,last:null,hl:null,seq:0,pend:-1};
        cur={label:WIND[ev.bakaze]+ev.kyoku+'局 '+ev.honba+'本場',start:i,frames:[]}; kyokus.push(cur);
        cur.frames.push(snap(i,cur.label+' 開始'));
        return;
      case 'tsumo': st.hands[ev.actor].push(ev.pai); st.drawn[ev.actor]=ev.pai; st.left--; st.hl=null; st.last={actor:ev.actor};
        break;
      case 'dahai': { const h=st.hands[ev.actor]; const k=h.indexOf(ev.pai); if(k>=0) h.splice(k,1); st.drawn[ev.actor]=null;
        const riichi=st.pend===ev.actor; if(riichi) st.pend=-1;
        st.rivers[ev.actor].push({pai:ev.pai,tsumogiri:ev.tsumogiri,riichi,called:false,seq:st.seq});
        if(riichi) st.riichiSeq[ev.actor]=st.seq; st.seq++;
        st.hl={seat:ev.actor,idx:st.rivers[ev.actor].length-1,color:'#ffd166'}; st.last={actor:ev.actor}; break; }
      case 'reach': st.pend=ev.actor; break;
      case 'reach_accepted': st.riichi[ev.actor]=1; st.scores[ev.actor]-=1000; st.kyotaku++; break;
      case 'chi': case 'pon': case 'daiminkan': { const h=st.hands[ev.actor]; for(const c of ev.consumed){ const k=h.indexOf(c); if(k>=0) h.splice(k,1); }
        const r=st.rivers[ev.target]; if(r.length) r[r.length-1].called=true;
        st.melds[ev.actor].push({type:ev.type,tiles:ev.consumed.concat([ev.pai]),from:ev.target,pai:ev.pai}); st.last={actor:ev.actor}; st.hl=null; break; }
      case 'ankan': { const h=st.hands[ev.actor]; for(const c of ev.consumed){ const k=h.indexOf(c); if(k>=0) h.splice(k,1); }
        st.melds[ev.actor].push({type:'ankan',tiles:ev.consumed.slice(),from:ev.actor}); st.drawn[ev.actor]=null; break; }
      case 'kakan': { const h=st.hands[ev.actor]; const k=h.indexOf(ev.pai); if(k>=0) h.splice(k,1);
        const m=st.melds[ev.actor].find(m=>m.type==='pon'&&MJ.kind(m.tiles[0])===MJ.kind(ev.pai)); if(m){ m.type='kakan'; m.tiles.push(ev.pai); } st.drawn[ev.actor]=null; break; }
      case 'dora': st.dora.push(ev.dora_marker); break;
      case 'hora': for(let p=0;p<4;p++) st.scores[p]+=ev.deltas[p]; if(ev.ura_markers) st.ura=ev.ura_markers; st.kyotaku=0; break;
      case 'ryukyoku': for(let p=0;p<4;p++) st.scores[p]+=ev.deltas[p]; break;
      case 'end_kyoku': case 'end_game': default: if(!st) return;
    }
    if(st&&cur) cur.frames.push(snap(i+1,eventText(ev,names)));
  });
  return kyokus;
}
function eventText(ev,names){
  const n=s=>names[s]||REL[s];
  const t=x=>MJ.tileName(x);
  switch(ev.type){
    case 'tsumo': return n(ev.actor)+' ツモ'+(ev.rinshan?'（嶺上）':'');
    case 'dahai': return n(ev.actor)+' 打 '+t(ev.pai)+(ev.tsumogiri?'（ツモ切り）':'');
    case 'reach': return n(ev.actor)+' リーチ';
    case 'reach_accepted': return n(ev.actor)+' リーチ成立';
    case 'chi': return n(ev.actor)+' チー '+t(ev.pai);
    case 'pon': return n(ev.actor)+' ポン '+t(ev.pai);
    case 'daiminkan': return n(ev.actor)+' 大明槓 '+t(ev.pai);
    case 'ankan': return n(ev.actor)+' 暗槓 '+t(ev.consumed[0]);
    case 'kakan': return n(ev.actor)+' 加槓 '+t(ev.pai);
    case 'dora': return '新ドラ表示 '+t(ev.dora_marker);
    case 'hora': return n(ev.actor)+(ev.actor===ev.target?' ツモ和了 ':' ロン和了 ')+ev.points+'点（'+ev.yaku.map(y=>y[0]).join('・')+'）';
    case 'ryukyoku': return '流局（'+ev.reason+'）';
    case 'end_kyoku': return '局終了';
    case 'end_game': return '対局終了';
  }
  return ev.type;
}
function fmtDT(t){ return t? new Date(t).toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''; }

root.MLUI={esc,tileURL,tileImg,put,boardSVG,candHTML,actionText,actionTile,passedSuji,quizItem,replayLog,eventText,fmtDT,WIND,REL,SUJI};
})(typeof window!=='undefined'?window:globalThis);
