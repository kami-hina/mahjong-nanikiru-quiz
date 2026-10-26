/* 麻雀の対局進行（4人打ち・半荘戦・天鳳に準拠したルール）
   ・喰いタンあり／後付けあり／赤ドラ3枚（各色の5に1枚ずつ）／一発・裏ドラ・槓ドラあり
   ・ダブロンあり（三家和は流局）、途中流局（九種九牌・四風連打・四家立直・四開槓）
   ・流し満貫あり、喰い替えなし、25000点持ち 30000点返し、南4局終了時に30000点未満なら西入（サドンデス）
   ・飛び終了あり、オーラスの親は和了止めあり
   通信なし・乱数シード固定で再現可能。牌譜は mjai 形式に近いイベント列で記録する。 */
(function(root){
"use strict";
const MJ=root.MJ||(typeof require!=='undefined'?require('./mj-core.js'):null);
const {kind,isYaochuK,shanten,counts}=MJ;

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function makeWall(rnd){
  const w=[];
  for(const s of 'mps') for(let n=1;n<=9;n++) for(let i=0;i<4;i++) w.push((n===5&&i===0)?'0'+s:n+s);
  for(let n=1;n<=7;n++) for(let i=0;i<4;i++) w.push(n+'z');
  for(let i=w.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); const x=w[i]; w[i]=w[j]; w[j]=x; }
  return w;
}
const removeOne=(arr,t)=>{ const i=arr.indexOf(t); if(i<0) throw new Error('tile not in hand: '+t); arr.splice(i,1); };
const sameKind=(a,b)=>kind(a)===kind(b);

class Game{
  constructor(opt){
    opt=opt||{};
    this.seed=opt.seed!=null?opt.seed:(Date.now()%2147483647);
    this.rnd=mulberry32(this.seed);
    this.names=opt.names||['あなた','下家','対面','上家'];
    this.log=[];
    this.scores=[25000,25000,25000,25000];
    this.bakaze=0; this.kyoku=1; this.honba=0; this.kyotaku=0; this.oya=0;
    this.over=false; this.kyokuNo=0;
    this.emit({type:'start_game',names:this.names.slice(),seed:this.seed});
  }
  emit(ev){ this.log.push(ev); return ev; }
  /* ---------- 局の開始 ---------- */
  startKyoku(){
    const K=this.k={};
    K.wall=makeWall(this.rnd);
    // 王牌: 末尾14枚。ドラ表示 = dead[4],dead[6],...  裏 = dead[5],dead[7]...  嶺上 = dead[0..3]
    K.dead=K.wall.splice(K.wall.length-14,14);
    K.rinshanUsed=0; K.doraCount=1; K.pendingDora=0;
    K.hands=[[],[],[],[]];
    for(let r=0;r<3;r++) for(let p=0;p<4;p++){ const s=(this.oya+p)%4; for(let i=0;i<4;i++) K.hands[s].push(K.wall.shift()); }
    for(let p=0;p<4;p++){ const s=(this.oya+p)%4; K.hands[s].push(K.wall.shift()); }
    K.melds=[[],[],[],[]]; K.rivers=[[],[],[],[]];
    K.riichi=[0,0,0,0]; K.riichiSeq=[-1,-1,-1,-1]; K.doubleRiichi=[0,0,0,0]; K.ippatsu=[0,0,0,0];
    K.furitenTemp=[0,0,0,0]; K.furitenRiichi=[0,0,0,0];
    K.firstTurn=[1,1,1,1]; K.anyCall=false; K.seq=0; K.kans=0; K.kanBy=[0,0,0,0];
    K.turn=this.oya; K.drawn=[null,null,null,null]; K.rinshan=false; K.afterCall=false; K.kuikae=[];
    K.pendingRiichi=-1; K.discardCount=0; K.firstWinds=[];
    K.phase='draw';
    this.kyokuNo++;
    this.emit({type:'start_kyoku',bakaze:this.bakaze,kyoku:this.kyoku,honba:this.honba,kyotaku:this.kyotaku,oya:this.oya,
      scores:this.scores.slice(),dora_marker:K.dead[4],tehais:K.hands.map(h=>MJ.sortTiles(h))});
  }
  doraIndicators(){ const K=this.k; const a=[]; for(let i=0;i<K.doraCount;i++) a.push(K.dead[4+2*i]); return a; }
  uraIndicators(){ const K=this.k; const a=[]; for(let i=0;i<K.doraCount;i++) a.push(K.dead[5+2*i]); return a; }
  left(){ return this.k.wall.length; }
  /* ---------- 観測（AI・画面表示用） ---------- */
  obsFor(seat){
    const K=this.k;
    return { me:seat, oya:this.oya, bakaze:this.bakaze, kyoku:this.kyoku, honba:this.honba, kyotaku:this.kyotaku,
      scores:this.scores.slice(), dora:this.doraIndicators(), left:this.left(),
      hand:K.hands[seat].slice(), drawn:K.drawn[seat],
      melds:K.melds.map(ms=>ms.map(m=>({type:m.type,tiles:m.tiles.slice(),from:m.from,pai:m.pai}))),
      rivers:K.rivers.map(r=>r.map(d=>Object.assign({},d))),
      riichiSeq:K.riichiSeq.slice(), last:K.lastDiscard||null, allLast:this.isAllLast() };
  }
  isAllLast(){ return (this.bakaze===1&&this.kyoku===4)||this.bakaze>=2; }
  /* ---------- 判定の道具 ---------- */
  isMenzen(s){ return this.k.melds[s].every(m=>m.type==='ankan'); }
  waitsOf(s,hand){ const c=counts(hand||this.k.hands[s]); return MJ.waits(c,this.k.melds[s].length); }
  isFuriten(s){
    const K=this.k; const ws=this.waitsOf(s); if(!ws.length) return false;
    for(const d of K.rivers[s]) if(ws.indexOf(kind(d.pai))>=0) return true;
    return !!(K.furitenTemp[s]||K.furitenRiichi[s]);
  }
  winInfo(s,tile,tsumo,extra){
    const K=this.k; extra=extra||{};
    const hand=tsumo? K.hands[s].slice() : K.hands[s].concat([tile]);
    const seatWind=(s-this.oya+4)%4;
    const last=this.left()===0;
    return MJ.score({hand,melds:K.melds[s].map(m=>({type:m.type,tiles:m.tiles})),win:tile,tsumo,seat:seatWind,round:this.bakaze,
      riichi:!!K.riichi[s], doubleRiichi:!!K.doubleRiichi[s], ippatsu:!!K.ippatsu[s],
      haitei:tsumo&&last&&!K.rinshan, houtei:!tsumo&&last&&!extra.chankan, rinshan:tsumo&&K.rinshan, chankan:!!extra.chankan,
      tenhou:tsumo&&K.firstTurn[s]&&!K.anyCall&&s===this.oya, chiihou:tsumo&&K.firstTurn[s]&&!K.anyCall&&s!==this.oya,
      dora:this.doraIndicators(), ura:K.riichi[s]?this.uraIndicators():[]});
  }
  /* ---------- 自分の手番の合法手 ---------- */
  selfActions(s){
    const K=this.k, hand=K.hands[s], acts=[];
    const drawn=K.drawn[s];
    if(!K.afterCall&&drawn){
      const c=counts(hand);
      if(shanten(c,K.melds[s].length)===-1){ const w=this.winInfo(s,drawn,true); if(w) acts.push({type:'hora',pai:drawn}); }
      // 九種九牌
      if(K.firstTurn[s]&&!K.anyCall){ let n=0; for(let k=0;k<34;k++) if(isYaochuK(k)&&c[k]) n++; if(n>=9) acts.push({type:'ryukyoku'}); }
      // 槓（残り牌があり、槓が4回未満）
      if(this.left()>0&&K.kans<4){
        for(let k=0;k<34;k++){ if(c[k]!==4) continue;
          const tiles=hand.filter(t=>kind(t)===k);
          if(K.riichi[s]){ // リーチ中: ツモ牌での暗槓で、待ちが変わらない場合のみ
            if(kind(drawn)!==k) continue;
            const before=this.waitsOf(s,hand.filter((t,i)=>i!==hand.lastIndexOf(drawn)));
            const rest=hand.filter(t=>kind(t)!==k);
            const after=MJ.waits(counts(rest),K.melds[s].length+1);
            if(before.join()!==after.join()||!before.length) continue;
          }
          acts.push({type:'ankan',consumed:tiles}); }
        if(!K.riichi[s]) for(const m of K.melds[s]) if(m.type==='pon'){ const t=hand.find(x=>sameKind(x,m.tiles[0])); if(t) acts.push({type:'kakan',pai:t,consumed:m.tiles.slice()}); }
      }
      // リーチ
      if(!K.riichi[s]&&this.isMenzen(s)&&this.scores[s]>=1000&&this.left()>=4){
        let ok=false;
        for(const t of new Set(hand)){ const h2=hand.slice(); removeOne(h2,t); if(shanten(counts(h2),K.melds[s].length)===0){ ok=true; break; } }
        if(ok) acts.push({type:'reach'});
      }
    }
    // 打牌
    for(const t of this.discardable(s)) acts.push({type:'dahai',pai:t,tsumogiri:!K.afterCall&&t===drawn});
    return acts;
  }
  discardable(s,riichiDecl){
    const K=this.k, hand=K.hands[s];
    if(K.riichi[s]&&!riichiDecl) return K.drawn[s]?[K.drawn[s]]:[];
    let ts=[...new Set(hand)];
    if(K.afterCall&&K.kuikae.length) ts=ts.filter(t=>K.kuikae.indexOf(kind(t))<0);
    if(riichiDecl) ts=ts.filter(t=>{ const h2=hand.slice(); removeOne(h2,t); return shanten(counts(h2),K.melds[s].length)===0; });
    return MJ.sortTiles(ts);
  }
  /* ---------- 他家の打牌への反応 ---------- */
  reactActions(s,tile,from,opts){
    opts=opts||{};
    const K=this.k, hand=K.hands[s], acts=[];
    const k=kind(tile);
    // ロン
    const c=counts(hand); c[k]++;
    if(shanten(c,K.melds[s].length)===-1&&!this.isFuriten(s)){
      const w=this.winInfo(s,tile,false,{chankan:opts.chankan});
      if(w) acts.push({type:'hora',pai:tile,target:from});
    }
    if(opts.chankan) return acts.length? acts.concat([{type:'none'}]) : [];
    if(K.riichi[s]||this.left()===0) return acts.length? acts.concat([{type:'none'}]) : [];
    const same=hand.filter(t=>kind(t)===k);
    // ポン（赤の有無で別の手）
    if(same.length>=2){
      const sets=new Set();
      for(let i=0;i<same.length;i++) for(let j=i+1;j<same.length;j++) sets.add([same[i],same[j]].sort().join(','));
      for(const st of sets){ const cons=st.split(',');
        if(this.hasDiscardAfterCall(s,cons,tile,'pon')) acts.push({type:'pon',pai:tile,consumed:cons,target:from}); }
    }
    if(same.length>=3&&K.kans<4) acts.push({type:'daiminkan',pai:tile,consumed:same.slice(0,3),target:from});
    // チー（下家のみ）
    if((from+1)%4===s&&k<27){
      const n=k%9, base=k-n;
      for(const [a,b] of [[-2,-1],[-1,1],[1,2]]){
        if(n+a<0||n+b>8) continue;
        const ta=hand.filter(t=>kind(t)===base+n+a), tb=hand.filter(t=>kind(t)===base+n+b);
        if(!ta.length||!tb.length) continue;
        const sets=new Set();
        for(const x of new Set(ta)) for(const y of new Set(tb)) sets.add(x+','+y);
        for(const st of sets){ const cons=st.split(',');
          if(this.hasDiscardAfterCall(s,cons,tile,'chi')) acts.push({type:'chi',pai:tile,consumed:cons,target:from}); }
      }
    }
    if(!acts.length) return [];
    acts.push({type:'none'});
    return acts;
  }
  kuikaeBan(cons,tile,type){
    const k=kind(tile), ban=[k];
    if(type==='chi'){ const ks=cons.map(kind).sort((a,b)=>a-b);
      if(ks[1]-ks[0]===1){ if(k===ks[0]-1&&ks[1]%9<8) ban.push(ks[1]+1); if(k===ks[1]+1&&ks[0]%9>0) ban.push(ks[0]-1); } }
    return ban;
  }
  hasDiscardAfterCall(s,cons,tile,type){
    const h=this.k.hands[s].slice(); for(const c of cons) removeOne(h,c);
    const ban=this.kuikaeBan(cons,tile,type);
    return h.some(t=>ban.indexOf(kind(t))<0);
  }
  /* ---------- 進行 ----------
     request(): 次に必要な判断を返す
       {kind:'self', seat, actions}            … 手番の判断（ツモ後・鳴き後）
       {kind:'riichi_discard', seat, actions}  … リーチ宣言後の打牌
       {kind:'react', seats:[{seat,actions}], tile, from, chankan} … 他家の打牌（加槓）への反応
       {kind:'end_kyoku', result} / {kind:'end_game'} */
  request(){
    const K=this.k;
    if(this.over) return {kind:'end_game'};
    if(!K||K.phase==='done') return {kind:'need_start'};
    if(K.phase==='draw') this.draw();
    if(K.phase==='self') return {kind:'self',seat:K.turn,actions:this.selfActions(K.turn)};
    if(K.phase==='riichi_discard') return {kind:'riichi_discard',seat:K.turn,actions:this.discardable(K.turn,true).map(t=>({type:'dahai',pai:t,tsumogiri:t===K.drawn[K.turn]}))};
    if(K.phase==='react') return {kind:'react',seats:K.react.seats,tile:K.react.tile,from:K.react.from,chankan:K.react.chankan};
    if(K.phase==='end') return {kind:'end_kyoku',result:K.result};
    throw new Error('bad phase '+K.phase);
  }
  draw(){
    const K=this.k, s=K.turn;
    if(this.left()===0&&!K.rinshan){ this.exhaustive(); return; }
    let t;
    if(K.rinshan){ t=K.dead[K.rinshanUsed++]; K.wall.pop(); /* 嶺上で海底がずれる */ }
    else t=K.wall.shift();
    K.hands[s].push(t); K.drawn[s]=t; K.afterCall=false; K.kuikae=[];
    this.emit({type:'tsumo',actor:s,pai:t,rinshan:K.rinshan||undefined});
    K.phase='self';
  }
  // 手番の行動
  actSelf(a){
    const K=this.k, s=K.turn;
    switch(a.type){
      case 'hora': return this.win([{seat:s,tile:K.drawn[s]}],s,true);
      case 'ryukyoku': return this.abort('九種九牌',{seat:s});
      case 'reach':
        K.pendingRiichi=s; this.emit({type:'reach',actor:s}); K.phase='riichi_discard'; return;
      case 'ankan': {
        for(const t of a.consumed) removeOne(K.hands[s],t);
        K.melds[s].push({type:'ankan',tiles:a.consumed.slice(),from:s,pai:null});
        this.emit({type:'ankan',actor:s,consumed:a.consumed.slice()});
        this.afterKan(s,true);
        // 国士無双は暗槓を槍槓できる
        const seats=[];
        for(let o=0;o<4;o++){ if(o===s) continue; const h=K.hands[o]; const c=counts(h); c[kind(a.consumed[0])]++;
          if(K.melds[o].length===0&&MJ.shantenKokushi(c)===-1&&!this.isFuriten(o)) seats.push({seat:o,actions:[{type:'hora',pai:a.consumed[0],target:s},{type:'none'}]}); }
        if(seats.length){ K.react={tile:a.consumed[0],from:s,seats,chankan:true,ankan:true,decided:{}}; K.phase='react'; return; }
        K.rinshan=true; K.phase='draw'; return; }
      case 'kakan': {
        removeOne(K.hands[s],a.pai);
        const m=K.melds[s].find(m=>m.type==='pon'&&sameKind(m.tiles[0],a.pai));
        m.type='kakan'; m.tiles.push(a.pai);
        this.emit({type:'kakan',actor:s,pai:a.pai,consumed:m.tiles.slice(0,3)});
        this.afterKan(s,false);
        // 槍槓
        const seats=[];
        for(let o=0;o<4;o++){ if(o===s) continue; const acts=this.reactActions(o,a.pai,s,{chankan:true}); if(acts.length) seats.push({seat:o,actions:acts}); }
        if(seats.length){ K.react={tile:a.pai,from:s,seats,chankan:true,decided:{}}; K.phase='react'; return; }
        K.rinshan=true; K.phase='draw'; return; }
      case 'dahai': return this.discard(s,a.pai);
    }
    throw new Error('bad self action '+a.type);
  }
  afterKan(s,closed){
    const K=this.k;
    K.kans++; K.kanBy[s]++; K.anyCall=true; K.ippatsu=[0,0,0,0];
    if(closed){ K.doraCount++; this.emit({type:'dora',dora_marker:K.dead[4+2*(K.doraCount-1)]}); }
    else K.pendingDora++;
  }
  discard(s,tile){
    const K=this.k;
    const tsumogiri=!K.afterCall&&tile===K.drawn[s];
    removeOne(K.hands[s],tile);
    K.drawn[s]=null;
    const riichi=K.pendingRiichi===s;
    const d={pai:tile,tsumogiri,riichi,called:false,seq:K.seq++};
    K.rivers[s].push(d);
    if(riichi){ K.riichiSeq[s]=d.seq; }
    K.furitenTemp[s]=0;
    if(K.ippatsu[s]&&!riichi) K.ippatsu[s]=0;
    this.emit({type:'dahai',actor:s,pai:tile,tsumogiri});
    // 明槓の槓ドラは打牌後にめくる
    while(K.pendingDora>0){ K.pendingDora--; K.doraCount++; this.emit({type:'dora',dora_marker:K.dead[4+2*(K.doraCount-1)]}); }
    K.rinshan=false; K.afterCall=false; K.kuikae=[];
    K.discardCount++;
    if(K.firstTurn[s]&&kind(tile)>=27&&kind(tile)<=30) K.firstWinds.push(kind(tile)); else if(K.firstTurn[s]) K.firstWinds.push(-1);
    K.firstTurn[s]=0;
    K.lastDiscard={actor:s,pai:tile};
    // 反応
    const seats=[];
    for(let o=0;o<4;o++){ if(o===s) continue; const acts=this.reactActions(o,tile,s); if(acts.length) seats.push({seat:o,actions:acts}); }
    K.react={tile,from:s,seats,chankan:false,decided:{}};
    K.phase='react';
    if(!seats.length) this.resolveReact();
  }
  // 反応の決定（seat ごとに1回）。全員分そろったら解決
  actReact(seat,a){
    const K=this.k; if(K.phase!=='react') throw new Error('not react phase');
    K.react.decided[seat]=a;
    if(K.react.seats.every(x=>K.react.decided[x.seat])) this.resolveReact();
  }
  resolveReact(){
    const K=this.k, R=K.react, s=R.from;
    const dec=R.seats.map(x=>({seat:x.seat,a:R.decided[x.seat]||{type:'none'}}));
    // 見逃したロンは同巡内フリテン／リーチ後なら永久フリテン
    for(const x of R.seats){ const a=R.decided[x.seat]; if(x.actions.some(y=>y.type==='hora')&&(!a||a.type!=='hora')){ K.furitenTemp[x.seat]=1; if(K.riichi[x.seat]) K.furitenRiichi[x.seat]=1; } }
    // 他家の打牌でも同巡内フリテン（待ち牌が通過）
    for(let o=0;o<4;o++){ if(o===s) continue; const ws=this.waitsOf(o); if(ws.indexOf(kind(R.tile))>=0){ K.furitenTemp[o]=1; if(K.riichi[o]) K.furitenRiichi[o]=1; } }
    const rons=dec.filter(x=>x.a.type==='hora').sort((a,b)=>((a.seat-s+4)%4)-((b.seat-s+4)%4));
    if(rons.length===3) return this.abort('三家和',{});
    if(rons.length){ if(K.pendingRiichi===s&&!R.chankan){ K.pendingRiichi=-1; /* ロンされたらリーチ不成立 */ }
      return this.win(rons.map(x=>({seat:x.seat,tile:R.tile})),s,false,{chankan:R.chankan}); }
    if(R.chankan){ K.rinshan=true; K.phase='draw'; K.turn=s; return; }
    // リーチ成立
    if(K.pendingRiichi===s){
      K.riichi[s]=1; K.ippatsu[s]=1; if(K.firstTurn[s]===0&&K.rivers[s].length===1&&!K.anyCall) K.doubleRiichi[s]=1;
      this.scores[s]-=1000; this.kyotaku++; K.pendingRiichi=-1;
      this.emit({type:'reach_accepted',actor:s,scores:this.scores.slice()});
      if(K.riichi.every(x=>x)) return this.abort('四家立直',{});
    }
    // 四風連打
    if(K.discardCount===4&&!K.anyCall&&K.firstWinds.length===4&&K.firstWinds[0]>=0&&K.firstWinds.every(x=>x===K.firstWinds[0])) return this.abort('四風連打',{});
    // 四開槓（2人以上で4回）
    if(K.kans===4&&K.kanBy.filter(x=>x>0).length>=2) return this.abort('四槓散了',{});
    const calls=dec.filter(x=>x.a.type==='pon'||x.a.type==='daiminkan');
    const chi=dec.filter(x=>x.a.type==='chi');
    const c=calls[0]||chi[0];
    if(c){ return this.call(c.seat,c.a); }
    K.turn=(s+1)%4; K.phase='draw';
  }
  call(seat,a){
    const K=this.k, s=K.react.from;
    for(const t of a.consumed) removeOne(K.hands[seat],t);
    const r=K.rivers[s]; r[r.length-1].called=true;
    K.melds[seat].push({type:a.type,tiles:a.consumed.concat([a.pai]),from:s,pai:a.pai});
    K.anyCall=true; K.ippatsu=[0,0,0,0]; K.firstTurn=[0,0,0,0];
    this.emit({type:a.type,actor:seat,target:s,pai:a.pai,consumed:a.consumed.slice()});
    K.turn=seat;
    if(a.type==='daiminkan'){ this.afterKan(seat,false); K.rinshan=true; K.phase='draw'; return; }
    K.afterCall=true; K.kuikae=this.kuikaeBan(a.consumed,a.pai,a.type); K.drawn[seat]=null;
    K.phase='self';
  }
  /* ---------- 局の終了 ---------- */
  win(wins,from,tsumo,extra){
    const K=this.k; extra=extra||{};
    const deltas=[0,0,0,0]; const res=[];
    let stickTo=wins[0].seat;
    wins.forEach((w,i)=>{
      const s=w.seat, info=this.winInfo(s,w.tile,tsumo,extra);
      const d=[0,0,0,0];
      const honba=i===0?this.honba:0;
      if(tsumo){
        if(s===this.oya){ for(let o=0;o<4;o++) if(o!==s){ d[o]-=info.all+100*honba; d[s]+=info.all+100*honba; } }
        else for(let o=0;o<4;o++) if(o!==s){ const p=(o===this.oya?info.oyaPay:info.koPay)+100*honba; d[o]-=p; d[s]+=p; }
      } else { const p=info.ron+300*honba; d[from]-=p; d[s]+=p; }
      if(s===stickTo){ d[s]+=this.kyotaku*1000; }
      for(let o=0;o<4;o++) deltas[o]+=d[o];
      const ura=K.riichi[s]?this.uraIndicators():[];
      const ev={type:'hora',actor:s,target:tsumo?s:from,pai:w.tile,hand:MJ.sortTiles(tsumo?K.hands[s]:K.hands[s]),
        melds:K.melds[s].map(m=>({type:m.type,tiles:m.tiles.slice()})),yaku:info.yaku,han:info.han,fu:info.fu,limit:info.limit,
        points:info.pts,deltas:d,ura_markers:ura,dora_markers:this.doraIndicators()};
      this.emit(ev); res.push(ev);
    });
    this.kyotaku=0;
    for(let o=0;o<4;o++) this.scores[o]+=deltas[o];
    const oyaWin=wins.some(w=>w.seat===this.oya);
    this.endKyoku({type:'hora',wins:res,deltas,renchan:oyaWin});
  }
  exhaustive(){
    const K=this.k;
    const tenpai=[0,1,2,3].map(s=>this.waitsOf(s).length>0);
    // 流し満貫
    const nagashi=[0,1,2,3].filter(s=>K.rivers[s].length&&K.rivers[s].every(d=>isYaochuK(kind(d.pai))&&!d.called));
    const deltas=[0,0,0,0];
    if(nagashi.length){
      for(const s of nagashi){ for(let o=0;o<4;o++) if(o!==s){ const p=(s===this.oya||o===this.oya)?4000:2000; deltas[o]-=p; deltas[s]+=p; } }
    } else {
      const n=tenpai.filter(x=>x).length;
      if(n>0&&n<4) for(let s=0;s<4;s++) deltas[s]+= tenpai[s]? 3000/n : -3000/(4-n);
    }
    for(let o=0;o<4;o++) this.scores[o]+=deltas[o];
    const ev={type:'ryukyoku',reason:nagashi.length?'流し満貫':'荒牌平局',tenpai,deltas,hands:K.hands.map(h=>MJ.sortTiles(h))};
    this.emit(ev);
    this.endKyoku({type:'ryukyoku',reason:ev.reason,tenpai,deltas,renchan:tenpai[this.oya],draw:true});
  }
  abort(reason){
    const K=this.k;
    const ev={type:'ryukyoku',reason,deltas:[0,0,0,0],hands:K.hands.map(h=>MJ.sortTiles(h)),abort:true};
    this.emit(ev);
    this.endKyoku({type:'ryukyoku',reason,deltas:[0,0,0,0],renchan:true,draw:true,abort:true});
  }
  endKyoku(result){
    const K=this.k;
    this.emit({type:'end_kyoku'});
    K.result=result; K.phase='end';
    // 次局の決定
    let gameOver=false;
    if(this.scores.some(x=>x<0)) gameOver=true;
    const top=Math.max.apply(null,this.scores);
    const allLast=this.isAllLast();
    if(!gameOver&&allLast){
      // 南4局以降: 親の和了止め（親がトップで30000点以上）／子の和了・流局で親が流れる場合は終了判定
      const oyaTop=this.rankOf(this.oya)===0&&this.scores[this.oya]>=30000;
      if(result.renchan){ if(result.type==='hora'&&oyaTop) gameOver=true; }
      else if(top>=30000) gameOver=true;
      else if(this.bakaze===2&&this.kyoku===4) gameOver=true; // 西4局で打ち切り
    }
    if(!gameOver&&this.bakaze>=2&&top>=30000) gameOver=true; // 西入後は誰かが30000点に届いた時点で終了（サドンデス）
    if(gameOver){ this.finish(); return; }
    if(result.renchan||result.draw) this.honba++; else this.honba=0;
    if(!result.renchan){
      this.oya=(this.oya+1)%4; this.kyoku++;
      if(this.kyoku>4){ this.kyoku=1; this.bakaze++; }
    }
  }
  rankOf(s){ let r=0; for(let o=0;o<4;o++) if(o!==s&&(this.scores[o]>this.scores[s]||(this.scores[o]===this.scores[s]&&o<s))) r++; return r; }
  finish(){
    // 供託は1位へ
    const order=[0,1,2,3].sort((a,b)=>this.scores[b]-this.scores[a]||a-b);
    this.scores[order[0]]+=this.kyotaku*1000; this.kyotaku=0;
    const uma=[20,10,-10,-20], final=[0,0,0,0];
    order.forEach((s,i)=>{ final[s]=+(((this.scores[s]-30000)/1000)+uma[i]+(i===0?20:0)).toFixed(1); });
    this.result={scores:this.scores.slice(),order,final};
    this.over=true;
    this.emit({type:'end_game',scores:this.scores.slice(),order,final});
  }
  next(){ // 局終了後に次の局を始める
    if(this.over) return false;
    this.startKyoku(); return true;
  }
  /* ---------- 保存・復元 ---------- */
  toJSON(){
    return {seed:this.seed,names:this.names,log:this.log,scores:this.scores,bakaze:this.bakaze,kyoku:this.kyoku,honba:this.honba,
      kyotaku:this.kyotaku,oya:this.oya,over:this.over,kyokuNo:this.kyokuNo,k:this.k,result:this.result};
  }
}
const _Game=Game;
// 復元: 保存した JSON から状態を戻す（乱数は seed と局数から作り直す）
_Game.fromJSON=function(j){
  const g=Object.create(_Game.prototype);
  Object.assign(g,JSON.parse(JSON.stringify(j)));
  g.rnd=mulberry32(j.seed);
  // 牌山の生成回数ぶん乱数を進める（1局あたり135回）
  for(let i=0;i<j.kyokuNo*135;i++) g.rnd();
  return g;
};
const API={Game:_Game,makeWall,mulberry32};
root.MJGame=API;
if(typeof module!=='undefined'&&module.exports) module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
