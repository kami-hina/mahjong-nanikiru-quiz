/* ローカル対局の牌譜を天鳳形式（tenhou.net/6 の JSON）に変換する
   書き出したファイルを Mortal（mjai.ekyu.moe）にアップロードすると、本物の Mortal で同じ半荘を解析でき、
   Mortal代役AIの判定と照合できる。
   牌の番号: 11-19 萬 / 21-29 筒 / 31-39 索 / 41-47 字（東南西北白發中）/ 51,52,53 = 赤5萬・赤5筒・赤5索 */
(function(root){
"use strict";
const MJ=root.MJ;
function tn(t){ if(t[1]==='z') return 40+(+t[0]); const s={m:1,p:2,s:3}[t[1]]; if(t[0]==='0') return 50+s; return s*10+(+t[0]); }
const YAKU_TENHOU={'門前清自摸和':'門前清自摸和','立直':'立直','ダブル立直':'両立直','一発':'一発','断幺九':'断幺九','平和':'平和','一盃口':'一盃口',
  '海底摸月':'海底摸月','河底撈魚':'河底撈魚','嶺上開花':'嶺上開花','槍槓':'槍槓','三色同順':'三色同順','一気通貫':'一気通貫','混全帯幺九':'混全帯幺九',
  '七対子':'七対子','対々和':'対々和','三暗刻':'三暗刻','三槓子':'三槓子','三色同刻':'三色同刻','混老頭':'混老頭','小三元':'小三元','混一色':'混一色',
  '純全帯幺九':'純全帯幺九','二盃口':'二盃口','清一色':'清一色','ドラ':'ドラ','赤ドラ':'赤ドラ','裏ドラ':'裏ドラ',
  '役牌 白':'役牌 白','役牌 發':'役牌 發','役牌 中':'役牌 中'};
function yakuStr(y){
  let n=y[0];
  if(/^自風 /.test(n)) n='自風 '+n.slice(3); if(/^場風 /.test(n)) n='場風 '+n.slice(3);
  n=YAKU_TENHOU[n]||n;
  return y[2]? n+'(役満)' : n+'('+y[1]+'飜)';
}
function pointStr(w,oya){
  const lim={'満貫':'満貫','跳満':'跳満','倍満':'倍満','三倍満':'三倍満','数え役満':'役満','役満':'役満'}[w.limit]||'';
  const head= lim? lim : w.fu+'符'+w.han+'飜';
  const tsumo=w.actor===w.target;
  if(!tsumo) return head+w.points+'点';
  if(oya) return head+(w.points/3)+'点∀';
  // 子のツモ: 子の支払い-親の支払い
  const ko=Math.ceil(w.points/4/100)*100; // 近似（表示用）
  const d=w.deltas; let oyaPay=0, koPay=0;
  for(let s=0;s<4;s++){ if(s===w.actor) continue; const p=-d[s]; if(s===w.oyaSeat) oyaPay=p; else koPay=Math.max(koPay,p); }
  return head+(koPay||ko)+'-'+(oyaPay||ko*2)+'点';
}
function toTenhou6(rec){
  const log=rec.log||[], out=[];
  let K=null;
  const names=(log[0]&&log[0].names)||rec.names||['A','B','C','D'];
  let lastDahaiActor=-1;
  const meldStr=(type,actor,target,pai,consumed)=>{
    const rel=(target-actor+4)%4; // 1:下家 2:対面 3:上家
    const called=tn(pai), own=consumed.map(tn);
    if(type==='chi') return 'c'+called+own.join('');
    if(type==='pon'){ const arr=own.map(String); const pos= rel===3?0 : rel===2?1 : 2; arr.splice(pos,0,'p'+called); return arr.join(''); }
    if(type==='daiminkan'){ const arr=own.map(String); const pos= rel===3?0 : rel===2?1 : 3; arr.splice(pos,0,'m'+called); return arr.join(''); }
    return '';
  };
  for(const ev of log){
    switch(ev.type){
      case 'start_kyoku':
        K={head:[ev.bakaze*4+(ev.kyoku-1),ev.honba,ev.kyotaku],scores:ev.scores.slice(),dora:[tn(ev.dora_marker)],ura:[],
           hai:ev.tehais.map(h=>h.map(tn)),take:[[],[],[],[]],dis:[[],[],[],[]],result:null,oya:ev.oya,pons:[{},{},{},{}],riichiNext:-1,drawn:[null,null,null,null]};
        out.push(K); break;
      case 'tsumo': K.take[ev.actor].push(tn(ev.pai)); K.drawn[ev.actor]=ev.pai; break;
      case 'reach': K.riichiNext=ev.actor; break;
      case 'dahai': {
        let v= ev.tsumogiri? 60 : tn(ev.pai);
        if(K.riichiNext===ev.actor){ v='r'+v; K.riichiNext=-1; }
        K.dis[ev.actor].push(v); lastDahaiActor=ev.actor; break; }
      case 'chi': case 'pon': case 'daiminkan': {
        const s=meldStr(ev.type,ev.actor,ev.target,ev.pai,ev.consumed);
        K.take[ev.actor].push(s);
        if(ev.type==='pon') K.pons[ev.actor][MJ.kind(ev.pai)]=s;
        if(ev.type==='daiminkan') K.dis[ev.actor].push(0);
        break; }
      case 'ankan': { const t=ev.consumed.map(tn); K.dis[ev.actor].push(t.slice(0,3).join('')+'a'+t[3]); break; }
      case 'kakan': {
        const ps=K.pons[ev.actor][MJ.kind(ev.pai)]||'';
        // ポンの文字列の 'p' を 'k'+加えた牌 に置き換える
        const s=ps.replace(/p(\d\d)/,(m,c)=>'k'+tn(ev.pai)+c);
        K.dis[ev.actor].push(s||('k'+tn(ev.pai))); break; }
      case 'dora': K.dora.push(tn(ev.dora_marker)); break;
      case 'hora': {
        if(!K.result) K.result=['和了'];
        if(ev.ura_markers&&ev.ura_markers.length) K.ura=ev.ura_markers.map(tn);
        const w=Object.assign({},ev,{oyaSeat:K.oya});
        K.result.push(ev.deltas.slice(), [ev.actor,ev.target,ev.actor,pointStr(w,ev.actor===K.oya)].concat(ev.yaku.map(yakuStr)));
        break; }
      case 'ryukyoku': {
        const name={'荒牌平局':'流局','流し満貫':'流し満貫','九種九牌':'九種九牌','四風連打':'四風連打','四家立直':'四家立直','四槓散了':'四開槓','三家和':'三家和了'}[ev.reason]||'流局';
        K.result= ev.deltas&&ev.deltas.some(x=>x)? [name,ev.deltas.slice()] : [name];
        break; }
    }
  }
  return {title:['ローカル麻雀（Mortal代役AI）',new Date(rec.createdAt||Date.now()).toLocaleString('ja-JP')],name:names.slice(0,4),
    rule:{disp:'般南喰赤',aka:1,aka51:1,aka52:1,aka53:1},
    log:out.map(K=>[K.head,K.scores,K.dora,K.ura,K.hai[0],K.take[0],K.dis[0],K.hai[1],K.take[1],K.dis[1],K.hai[2],K.take[2],K.dis[2],K.hai[3],K.take[3],K.dis[3],K.result||['流局']])};
}
root.MLTenhou={toTenhou6,tn};
if(typeof module!=='undefined'&&module.exports) module.exports=root.MLTenhou;
})(typeof window!=='undefined'?window:globalThis);
