// 推奨打牌選定理由のサンプル表示: テスト用の半荘で、Mortal と人間が食い違った局面の理由を出す
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
require('../../local/ai-weights.js');
const AI=require('../../local/mj-ai.js');
const {loadDataset}=require('./dataset.js');
const data=loadDataset(process.argv[2],{quiet:1});
let n=0;
for(const s of data){
  if(s.isEqual||n>=+(process.argv[3]||25)) continue;
  if(s.file.charCodeAt(0)%7!==0) continue;
  const list=AI.evaluate(s.obs,s.acts.map(x=>x.action));
  const other=s.acts.map(x=>x.action).find(a=>AI.actKey(a)===AI.actKey(s.actual));
  if(!other||AI.actKey(list[0].action)===AI.actKey(other)) continue;
  n++;
  const t=a=>a.type==='dahai'?'打'+MJ.tileName(a.pai):a.type;
  console.log(MJ.sortTiles(s.obs.hand).join(''),'| 推奨',t(list[0].action),'| あなた',t(other));
  for(const r of AI.explain(s.obs,list,other)) console.log('   ・'+r);
}
