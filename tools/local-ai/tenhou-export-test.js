// 天鳳形式への変換テスト: Mortal レポートの mjai ログ → ローカル麻雀のログ形式 → 天鳳形式 を作り、
// レポートに入っている元の天鳳形式（split_logs）と配牌・ツモ・打牌・ドラが一致するか確かめる
const fs=require('fs'), path=require('path');
const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
const {toTenhou6}=require('../../local/tenhou-export.js');
const {cv}=require('./dataset.js');
const dir=process.argv[2]; let ok=0, ng=0, shown=0;
const BK={E:0,S:1,W:2,N:3};
for(const f of fs.readdirSync(dir).slice(0,+(process.argv[3]||40))){
  const rep=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  const log=rep.mjai_log.map(e=>{
    const o=Object.assign({},e);
    if(o.pai) o.pai=cv(o.pai); if(o.consumed) o.consumed=o.consumed.map(cv);
    if(o.dora_marker) o.dora_marker=cv(o.dora_marker);
    if(o.type==='start_kyoku'){ o.bakaze=BK[e.bakaze]; o.tehais=e.tehais.map(h=>h.map(cv)); }
    if(o.type==='hora'){ o.yaku=[]; o.points=0; o.deltas=e.deltas||[0,0,0,0]; o.ura_markers=(e.ura_markers||[]).map(cv); }
    return o; });
  const mine=toTenhou6({log,createdAt:0}).log;
  const ref=(rep.split_logs||[]).map(x=>x.log[0]);
  if(mine.length!==ref.length){ ng++; console.log(f,'kyoku count',mine.length,ref.length); continue; }
  let bad=false;
  mine.forEach((k,i)=>{ const r=ref[i];
    const res=x=>JSON.stringify([x[16][0],x[16][1],x[16][2]&&x[16][2].slice(0,2)]);
    if(res(k)!==res(r)&&!(k[16][0]==='流局'&&/流局|全員|不聴|聴牌|九種九牌|四風連打|四家立直|四開槓|三家和了/.test(r[16][0]))){ bad=true; if(shown++<8) console.log(f,'kyoku',i,'result','mine',res(k),'ref',res(r)); }
    if(JSON.stringify(k[3])!==JSON.stringify(r[3])&&k[16][0]==='和了'){ bad=true; if(shown++<8) console.log(f,'kyoku',i,'ura',JSON.stringify(k[3]),JSON.stringify(r[3])); }
    for(const j of [0,1,2,4,5,6,7,8,9,10,11,12,13,14,15]){
      const a=JSON.stringify(k[j]), b=JSON.stringify(r[j]);
      if(a!==b){ bad=true; if(shown++<8) console.log(f,'kyoku',i,'field',j,'\n mine',a.slice(0,300),'\n ref ',b.slice(0,300)); }
    }
  });
  if(bad) ng++; else ok++;
}
console.log('tenhou export: match',ok,'mismatch',ng);
