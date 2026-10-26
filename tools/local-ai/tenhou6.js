/* 天鳳の牌譜（tenhou.net/6 形式の JSON）を、mjai に近いイベント列（ローカル麻雀の牌表記）に変換する
   牌の番号: 11-19 萬 / 21-29 筒 / 31-39 索 / 41-47 字 / 51,52,53 = 赤5萬・赤5筒・赤5索 */
function tile(n){ n=+n; if(n===51) return '0m'; if(n===52) return '0p'; if(n===53) return '0s';
  const s=Math.floor(n/10), d=n%10; return d+'mpsz'[s-1]; }
const nums=str=>(String(str).match(/\d\d/g)||[]).map(Number);
function parseMeld(str,actor){
  const s=String(str);
  const letter=s.match(/[cpmak]/)[0];
  const li=s.indexOf(letter);
  const before=nums(s.slice(0,li)).length; // 記号より前の牌の数＝位置
  const all=nums(s.replace(/[cpmak]/g,''));
  const called=nums(s.slice(li+1))[0];
  const own=all.slice(); own.splice(before,1);
  let from=null;
  if(letter==='c') from=(actor+3)%4;
  if(letter==='p') from= before===0?(actor+3)%4 : before===1?(actor+2)%4 : (actor+1)%4;
  if(letter==='m') from= before===0?(actor+3)%4 : before===1?(actor+2)%4 : (actor+1)%4;
  return {letter,called,own,all,from};
}
function kyokuEvents(L){
  const [idx,honba,kyotaku]=L[0];
  const oya=idx%4;
  const ev=[{type:'start_kyoku',bakaze:Math.floor(idx/4),kyoku:idx%4+1,honba,kyotaku,oya,scores:L[1].slice(),dora_marker:tile(L[2][0]),
    tehais:[0,1,2,3].map(p=>L[4+3*p].map(tile))}];
  const takes=[0,1,2,3].map(p=>L[5+3*p]), dis=[0,1,2,3].map(p=>L[6+3*p]);
  const tk=[0,0,0,0], dk=[0,0,0,0];
  let doraNext=1, pendingDora=0;
  const drawn=[null,null,null,null];
  let p=oya, guard=0;
  const res=L[16]||[];
  while(guard++<500){
    const t=takes[p][tk[p]];
    if(t===undefined) break;
    tk[p]++;
    if(typeof t==='number'){ drawn[p]=tile(t); ev.push({type:'tsumo',actor:p,pai:drawn[p]}); }
    else {
      const m=parseMeld(t,p);
      const type={c:'chi',p:'pon',m:'daiminkan'}[m.letter];
      ev.push({type,actor:p,target:m.from,pai:tile(m.called),consumed:m.own.map(tile)});
      drawn[p]=null;
      if(type==='daiminkan'){ dk[p]++; pendingDora++; continue; } // 打牌欄の 0 を飛ばして嶺上ツモへ
    }
    // 打牌（または暗槓・加槓）
    let d=dis[p][dk[p]];
    if(d===undefined) break; // ツモ和了など
    dk[p]++;
    if(typeof d==='string'&&/[ak]/.test(d)){
      const m=parseMeld(d,p);
      if(m.letter==='a'){ ev.push({type:'ankan',actor:p,consumed:m.all.map(tile)}); ev.push({type:'dora',dora_marker:tile(L[2][doraNext++]||L[2][0])}); }
      else { ev.push({type:'kakan',actor:p,pai:tile(m.called),consumed:m.own.map(tile)}); pendingDora++; }
      drawn[p]=null;
      continue; // 嶺上ツモ（同じ人）
    }
    let riichi=false;
    if(typeof d==='string'&&d[0]==='r'){ riichi=true; d=+d.slice(1); }
    const tsumogiri=d===60;
    const pai= tsumogiri? drawn[p] : tile(d);
    if(riichi) ev.push({type:'reach',actor:p});
    ev.push({type:'dahai',actor:p,pai,tsumogiri});
    drawn[p]=null;
    while(pendingDora>0&&L[2][doraNext]!=null){ pendingDora--; ev.push({type:'dora',dora_marker:tile(L[2][doraNext++])}); }
    const code= tsumogiri? null : d;
    // 次の手番: ポン・カン（誰でも）→ チー（下家）→ 下家のツモ
    let next=null;
    for(let i=1;i<=3&&next==null;i++){ const q=(p+i)%4, nt=takes[q][tk[q]];
      if(typeof nt==='string'&&/[pm]/.test(nt)){ const m=parseMeld(nt,q); if(m.from===p&&tile(m.called)===pai) next=q; } }
    if(next==null){ const q=(p+1)%4, nt=takes[q][tk[q]]; if(typeof nt==='string'&&nt[0]==='c'){ const m=parseMeld(nt,q); if(tile(m.called)===pai) next=q; } }
    // ロンされたか（和了者の打牌元が p で、まだ誰も次を引いていない）
    const ronned=res[0]==='和了'&&res.slice(1).some((x,i)=>i%2===1&&x[1]===p&&x[0]!==p)&&[0,1,2,3].every(q=>takes[q][tk[q]]===undefined||(next!=null&&q===next&&false));
    if(riichi&&!ronned) ev.push({type:'reach_accepted',actor:p});
    p= next!=null? next : (p+1)%4;
  }
  // 結果
  if(res[0]==='和了'){
    for(let i=1;i+1<res.length;i+=2){ const d=res[i], info=res[i+1];
      ev.push({type:'hora',actor:info[0],target:info[1],deltas:d,ura_markers:(L[3]||[]).map(tile)}); }
  } else ev.push({type:'ryukyoku',reason:res[0]||'流局',deltas:Array.isArray(res[1])?res[1]:[0,0,0,0]});
  ev.push({type:'end_kyoku'});
  return ev;
}
function toEvents(j){
  const ev=[{type:'start_game',names:(j.name||['A','B','C','D']).slice(0,4)}];
  for(const L of j.log) ev.push(...kyokuEvents(L));
  ev.push({type:'end_game'});
  return ev;
}
module.exports={toEvents,kyokuEvents,tile};
