// 指定した局面（手牌文字列）で、各打牌の特徴量とスコアを表示する
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
require('../../local/ai-weights.js');
const AI=require('../../local/mj-ai.js');
const h=s=>{const out=[];let num=[];for(const ch of s){if(/[0-9]/.test(ch))num.push(ch);else{for(const n of num)out.push(n+ch);num=[];}}return out;};
function obsOf(hand,o){ o=o||{}; return Object.assign({me:0,oya:0,bakaze:0,kyoku:1,honba:0,kyotaku:0,scores:[25000,25000,25000,25000],dora:o.dora||['1z'],left:o.left||60,
  hand:h(hand),drawn:null,melds:[o.melds||[],[],[],[]],rivers:[[],[],[],[]],riichiSeq:[-1,-1,-1,-1],last:null,allLast:false},o.extra||{}); }
const W=AI.getWeights();
function show(hand,o){
  const obs=obsOf(hand,o);
  const acts=[...new Set(obs.hand)].map(p=>({type:'dahai',pai:p}));
  const ev=AI.evaluate(obs,acts);
  console.log('\n'+hand, JSON.stringify(o||{}));
  for(const e of ev.slice(0,5)){ const f=AI.featurize(obs,e.action);
    const parts=Object.entries(f).filter(([i])=>!AI.F[i].startsWith('x_')).map(([i,v])=>AI.F[i]+'='+(+v).toFixed(2)+'('+(W.lin[i]*v).toFixed(2)+')');
    console.log(e.action.pai.padEnd(3),(e.prob*100).toFixed(1).padStart(5)+'%', parts.join(' ')); }
}
for(const a of process.argv.slice(2)){ const [hand,dora,left]=a.split(':'); show(hand,{dora:dora?[dora]:undefined,left:left?+left:undefined}); }
