// 対局ルールの単体テスト: node rules-test.js
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
const {Game}=require('../../local/mj-game.js');
const h=s=>{const out=[];let num=[];for(const ch of s){if(/[0-9]/.test(ch))num.push(ch);else{for(const n of num)out.push(n+ch);num=[];}}return out;};
let fails=0, passes=0;
const ok=(c,msg)=>{ if(c) passes++; else { fails++; console.log('FAIL:',msg); } };
// 局面を手で作る: hands=4人の13枚, wall=ツモ順の牌
function setup(hands,wall,opt){
  const g=new Game({seed:1}); g.startKyoku(); const K=g.k;
  K.hands=hands.map(x=>h(x));
  // 牌山はテスト用の牌のあと、余りを適当に埋める（69枚になるように）
  const rest=[]; const used=MJ.counts([].concat(...K.hands,h(wall)));
  for(let k=0;k<34;k++) for(let i=used[k];i<4;i++) rest.push(MJ.kname(k));
  K.wall=h(wall).concat(rest).slice(0,opt&&opt.wallLen||69);
  K.dead=['1z','2z','3z','4z','9m','9p','9s','8m','8p','8s','7m','7p','7s','6m'];
  if(opt&&opt.turn!=null) K.turn=opt.turn;
  return g;
}
const acts=(g)=>g.request();
// --- 1. リーチ・一発ツモ
{
  const g=setup(['123m456p789s1122z','147m258p369s1234z','147m258p369s5677z','258m147p258s1357z'],'3z9m9p9s2z');
  let r=acts(g); ok(r.kind==='self'&&r.seat===0,'oya self');
  ok(r.actions.some(a=>a.type==='reach'),'reach available');
  g.actSelf({type:'reach'}); r=acts(g); ok(r.kind==='riichi_discard','riichi discard phase');
  ok(r.actions.length===1&&r.actions[0].pai==='3z','only 3z keeps tenpai: '+JSON.stringify(r.actions));
  g.actSelf(r.actions[0]);
  r=acts(g);
  // 他家が順に打牌（ツモ切り）
  for(let s=1;s<=3;s++){ while(r.kind==='react'){ for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g); }
    ok(r.kind==='self'&&r.seat===s,'turn '+s); g.actSelf(r.actions.find(a=>a.type==='dahai'&&a.tsumogiri)||r.actions.find(a=>a.type==='dahai')); r=acts(g); }
  while(r.kind==='react'){ for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g); }
  ok(g.scores[0]===24000&&g.kyotaku===1,'riichi stick paid '+g.scores+' '+g.kyotaku);
  ok(r.kind==='self'&&r.seat===0&&r.actions.some(a=>a.type==='hora'),'tsumo win available');
  g.actSelf({type:'hora'}); r=acts(g);
  const w=r.result.wins[0]; const names=w.yaku.map(y=>y[0]);
  ok((names.includes('立直')||names.includes('ダブル立直'))&&names.includes('一発')&&names.includes('門前清自摸和'),'yaku '+names);
  ok(g.scores.reduce((a,b)=>a+b,0)===100000,'sum 100000');
}
// --- 2. フリテン（自分の捨て牌に待ち牌）
{
  const g=setup(['123456789m1222z','147p258p369s3344z','147p258p369s5677z','258p147p258s1357z'].map(x=>x),'4z9p1z9s');
  let r=acts(g); g.actSelf({type:'dahai',pai:'4z'}); // 一気通貫・東単騎待ち
  r=acts(g); while(r.kind==='react'){ for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g); }
  // 下家が9mツモ→切る
  g.actSelf({type:'dahai',pai:'9p'}); r=acts(g); while(r.kind==='react'){ for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g); }
  // 対面が1zツモ→切る: 自分は1z単騎待ち → ロンできる
  g.actSelf({type:'dahai',pai:'1z'}); r=acts(g);
  ok(r.kind==='react'&&r.seats.some(x=>x.seat===0&&x.actions.some(a=>a.type==='hora')),'ron on 1z available (not furiten)');
  // 見逃し → 同巡内フリテン
  for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g);
  ok(g.k.furitenTemp[0]===1,'temporary furiten after pass');
}
// --- 3. 喰い替え禁止（45m で 3m をチー → 3m・6m は切れない）
{
  const g=setup(['45m6m789p11s2345z','3m','',''],'',{});
  const K=g.k; K.hands=[h('456m789p11s23455z'),h('3m3m1p2p3p5s6s7s8s9s1z1z1z'),h('147m258p369s1234z'),h('258m147p258s1357z')];
  K.turn=1; K.phase='self'; K.drawn[1]=null; K.afterCall=false;
  // 下家ではなく上家(3)の打牌に自分(0)がチーするため、上家の手番にする
  K.hands[3]=h('3m58m147p258s1357z'); K.turn=3; K.drawn[3]='3m';
  g.actSelf({type:'dahai',pai:'3m'}); let r=acts(g);
  const mine=r.seats.find(x=>x.seat===0); ok(mine&&mine.actions.some(a=>a.type==='chi'),'chi available');
  const chi=mine.actions.find(a=>a.type==='chi'&&a.consumed.join()==='4m,5m');
  for(const x of r.seats) g.actReact(x.seat,x.seat===0?chi:{type:'none'});
  r=acts(g); ok(r.kind==='self'&&r.seat===0,'after chi own turn');
  const ds=r.actions.filter(a=>a.type==='dahai').map(a=>a.pai);
  ok(!ds.includes('6m')&&!ds.includes('3m'),'kuikae banned: '+ds);
  ok(!r.actions.some(a=>a.type==='hora'||a.type==='reach'),'no tsumo/reach after call');
}
// --- 4. 槍槓
{
  const g=setup(['111m456p789s1234z','23m456p789s11p55z','147m258p369s5677z','258m147p258s1357z'],'');
  const K=g.k; K.melds[0]=[]; K.hands[0]=h('1m456p789s1234z55s'); // 自分: 1m ポン済み
  K.melds[0]=[{type:'pon',tiles:h('111m'),from:2,pai:'1m'}]; K.hands[0]=h('1m456p789s123z55s'); K.drawn[0]='1m';
  K.hands[1]=h('23m456p789s11p555z'); // 1m-4m 待ち
  K.turn=0; K.phase='self';
  let r=acts(g); const kk=r.actions.find(a=>a.type==='kakan'); ok(!!kk,'kakan available');
  g.actSelf(kk); r=acts(g);
  ok(r.kind==='react'&&r.chankan&&r.seats.some(x=>x.seat===1&&x.actions.some(a=>a.type==='hora')),'chankan ron available');
  for(const x of r.seats) g.actReact(x.seat,x.seat===1?{type:'hora'}:{type:'none'}); r=acts(g);
  ok(r.kind==='end_kyoku'&&r.result.wins[0].yaku.some(y=>y[0]==='槍槓'),'chankan yaku');
}
// --- 5. ダブロン
{
  const g=setup(['147m258p369s1234z','23m456p789s11p555z','23m456p789s22p666z','258m147p258s1357z'],'');
  const K=g.k; K.hands[0]=h('147m258p369s1234z1m'); K.drawn[0]='1m'; K.turn=0; K.phase='self';
  // 下家・対面とも 1m-4m 待ち（役なし → リーチ扱いにして役をつける）
  K.riichi[1]=1; K.riichiSeq[1]=0; K.riichi[2]=1; K.riichiSeq[2]=0;
  let r=acts(g); g.actSelf({type:'dahai',pai:'1m'}); r=acts(g);
  const ron=r.seats.filter(x=>x.actions.some(a=>a.type==='hora')).map(x=>x.seat);
  ok(ron.length===2,'two can ron '+ron);
  for(const x of r.seats) g.actReact(x.seat,x.actions.some(a=>a.type==='hora')?{type:'hora'}:{type:'none'}); r=acts(g);
  ok(r.kind==='end_kyoku'&&r.result.wins.length===2,'double ron');
  ok(g.scores.reduce((a,b)=>a+b,0)+g.kyotaku*1000===100000,'sum after double ron');
}
// --- 6. 流局と聴牌料
{
  const g=setup(['123m456p789s1122z','147m258p369s1234z','147m258p369s5677z','258m147p258s1357z'],'',{wallLen:0});
  g.k.wall=[]; let r=acts(g);
  ok(r.kind==='end_kyoku'&&r.result.type==='ryukyoku','exhaustive draw');
  ok(g.scores[0]===28000&&g.scores[1]===24000,'tenpai payment '+g.scores);
  ok(g.oya===0&&g.honba===1,'dealer tenpai renchan');
}
// --- 7. 四風連打
{
  const g=setup(['1z23m456p789s1122z','1z47m258p369s1234z','1z47m258p369s5677z','1z58m147p258s1357z'],'');
  const K=g.k; for(let s=0;s<4;s++) K.hands[s]=h(['123m456p789s1122z','147m258p369s1234z','147m258p369s5677z','258m147p258s1357z'][s]).slice(0,12).concat(['1z']);
  let r=acts(g);
  for(let s=0;s<4;s++){ while(r.kind==='react'){ for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g); }
    if(r.kind!=='self') break; g.actSelf({type:'dahai',pai:'1z'}); r=acts(g); }
  while(r.kind==='react'){ for(const x of r.seats) g.actReact(x.seat,{type:'none'}); r=acts(g); }
  ok(r.kind==='end_kyoku'&&r.result.reason==='四風連打','suufon renda '+(r.result&&r.result.reason));
}
// --- 8. 終局条件
{
  const g=new Game({seed:3}); g.bakaze=1; g.kyoku=4; g.oya=3; g.startKyoku();
  g.scores=[29000,26000,25000,20000];
  g.endKyoku({type:'ryukyoku',deltas:[0,0,0,0],renchan:false,draw:true});
  ok(!g.over&&g.bakaze===2&&g.kyoku===1,'west entered when no one >=30000');
  g.startKyoku(); g.scores=[31000,24000,25000,20000];
  g.endKyoku({type:'hora',deltas:[0,0,0,0],renchan:true});
  ok(g.over,'west ends when someone >=30000');
  const g2=new Game({seed:4}); g2.bakaze=1; g2.kyoku=4; g2.oya=3; g2.startKyoku(); g2.scores=[20000,20000,20000,40000];
  g2.endKyoku({type:'hora',deltas:[0,0,0,0],renchan:true});
  ok(g2.over,'agari-yame for top dealer');
  const g3=new Game({seed:5}); g3.startKyoku(); g3.scores=[-100,40100,30000,30000];
  g3.endKyoku({type:'hora',deltas:[0,0,0,0],renchan:false});
  ok(g3.over,'bust ends game');
  const g4=new Game({seed:6}); g4.bakaze=1; g4.kyoku=4; g4.oya=3; g4.startKyoku(); g4.scores=[35000,25000,20000,20000];
  g4.endKyoku({type:'ryukyoku',deltas:[0,0,0,0],renchan:true,draw:true});
  ok(!g4.over&&g4.kyoku===4&&g4.honba===1,'S4 dealer tenpai continues');
}
// --- 9. 保存と復元
{
  const g=new Game({seed:77}); g.startKyoku(); for(let i=0;i<3;i++){ g.k.phase='end'; g.endKyoku({type:'ryukyoku',deltas:[0,0,0,0],renchan:false,draw:true}); g.next(); }
  const w1=g.k.wall.slice(0,5).join();
  const g2=Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
  ok(g2.k.wall.slice(0,5).join()===w1,'restore wall');
  g.k.phase='end'; g.endKyoku({type:'ryukyoku',deltas:[0,0,0,0],renchan:false,draw:true}); g.next();
  g2.k.phase='end'; g2.endKyoku({type:'ryukyoku',deltas:[0,0,0,0],renchan:false,draw:true}); g2.next();
  ok(g.k.wall.join()===g2.k.wall.join(),'restored game deals same next wall');
}
console.log(`rules-test: ${passes} passed, ${fails} failed`);
process.exit(fails?1:0);
