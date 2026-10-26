// 学習済み重みで、Mortal と食い違う打牌の例を表示する
const {loadDataset}=require('./dataset.js');
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
const W=require('../../local/ai-weights.js');
const AI=require('../../local/mj-ai.js');
const data=loadDataset(process.argv[2],{quiet:1});
const files=[...new Set(data.map(r=>r.file))].sort(); const test=new Set(files.filter((f,i)=>i%5===2));
let shown=0, cats={};
for(const s of data){
  if(!test.has(s.file)) continue;
  const ts=new Set(s.acts.map(x=>x.action.type)); if(ts.size!==1||!ts.has('dahai')) continue;
  const ev=AI.evaluate(s.obs,s.acts.map(x=>x.action));
  const mine=AI.actKey(ev[0].action), exp=AI.actKey(s.expected);
  if(mine===exp) continue; if(s.acts[0].prob<0.9) continue;
  const c=MJ.counts(s.obs.hand), m=s.obs.melds[s.obs.me].length;
  const sh=k=>{c[k]--; const r=MJ.shanten(c,m); c[k]++; return r;};
  const sm=sh(MJ.kind(ev[0].action.pai)), se=sh(MJ.kind(s.expected.pai));
  const anyR=s.obs.riichiSeq.some((x,p)=>p!==s.obs.me&&x>=0);
  const key=(anyR?'R ':'')+(se<sm?'mortal-lower-shanten':se>sm?'mortal-higher-shanten':'same-shanten')+' s='+MJ.shanten(c,m);
  cats[key]=(cats[key]||0)+1;
  if(shown<60&&!anyR){ shown++;
    const mp=s.acts.find(x=>AI.actKey(x.action)===mine);
    console.log(MJ.sortTiles(s.obs.hand).join(''),'melds',s.obs.melds[s.obs.me].map(x=>x.tiles.join('')).join('/'),'dora',s.obs.dora.join(),'left',s.obs.left,
      '| Mortal',s.expected.pai,(s.acts[0].prob*100).toFixed(0)+'%','| me',ev[0].action.pai,'(Mortal '+(mp.prob*100).toFixed(0)+'%)','s',sm,'sE',se, 'opp-melds',[0,1,2,3].filter(p=>p!==s.obs.me).map(p=>s.obs.melds[p].length).join(''));
  }
}
console.log(cats);
