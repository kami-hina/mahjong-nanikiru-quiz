// tenhou6.js のテスト: レポート内の天鳳形式(split_logs)を変換した結果が、同じレポートの mjai ログと一致するか
const fs=require('fs'), path=require('path');
const {kyokuEvents}=require('./tenhou6.js');
const {cv}=require('./dataset.js');
const dir=process.argv[2]; let ok=0, ng=0, shown=0;
const key=e=>{ const o={t:e.type,a:e.actor}; if(e.pai) o.p=cv(e.pai); if(e.consumed) o.c=e.consumed.map(cv).slice().sort().join(''); if(e.target!=null&&e.type!=='hora') o.g=e.target; if(e.type==='hora'){ o.g=e.target; } if(e.type==='dahai') o.tg=!!e.tsumogiri; return JSON.stringify(o); };
const keep=e=>['tsumo','dahai','reach','chi','pon','daiminkan','ankan','kakan','hora','ryukyoku'].includes(e.type);
for(const f of fs.readdirSync(dir)){
  const rep=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  const mj=[]; let cur=null;
  for(const e of rep.mjai_log){ if(e.type==='start_kyoku'){ cur=[]; mj.push(cur); } else if(cur&&keep(e)) cur.push(key(e)); }
  const ref=(rep.split_logs||[]).map(x=>x.log[0]);
  let bad=false;
  ref.forEach((L,i)=>{ const mine=kyokuEvents(L).filter(keep).map(key); const a=mine.join('\n'), b=(mj[i]||[]).join('\n');
    if(a!==b){ bad=true; if(shown++<3){ const A=mine, B=mj[i]||[]; let k=0; while(k<A.length&&A[k]===B[k]) k++; console.log(f,'kyoku',i,'diff at',k,'\n mine',A.slice(k,k+3).join(' '),'\n ref ',B.slice(k,k+3).join(' ')); } } });
  if(bad) ng++; else ok++;
}
console.log('tenhou6 convert: match',ok,'mismatch',ng);
