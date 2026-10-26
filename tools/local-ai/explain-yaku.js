// 推奨理由のうち、役（ホンイツ・一気通貫・三色・タンヤオ・役牌）に触れたものを手牌つきで表示する
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
require('../../local/ai-weights.js');
const AI=require('../../local/mj-ai.js');
const {loadDataset}=require('./dataset.js');
const data=loadDataset(process.argv[2],{quiet:1});
const re=new RegExp(process.argv[3]||'ホンイツ|一気通貫|三色|タンヤオ|役牌');
let n=0;
for(const s of data){
  if(n>=+(process.argv[4]||30)) break;
  if(s.isEqual) continue;
  const acts=s.acts.map(x=>x.action), list=AI.evaluate(s.obs,acts);
  const other=acts.find(a=>AI.actKey(a)===AI.actKey(s.actual)); if(!other||AI.actKey(other)===AI.actKey(list[0].action)) continue;
  const why=AI.explain(s.obs,list,other); const hit=why.filter(w=>re.test(w)); if(!hit.length) continue;
  n++;
  const t=a=>a.type==='dahai'?'打'+MJ.tileName(a.pai):a.type;
  const melds=s.obs.melds[s.obs.me].map(m=>m.type+':'+m.tiles.join('')).join(' ');
  console.log(MJ.sortTiles(s.obs.hand).join(''),melds?'['+melds+']':'','| 推奨',t(list[0].action),'| 比較',t(other),'|',hit.join(' / '));
}
