/* 麻雀の基本処理（牌・シャンテン数・受け入れ・和了形の分解・役と点数計算）
   ブラウザ（通常の<script>）と Node（学習用）の両方で動く。通信は一切しない。
   牌の表記: 1m..9m / 1p..9p / 1s..9s / 1z..7z(東南西北白發中) / 0m,0p,0s = 赤5 */
(function(root){
"use strict";
const SUITS='mpsz';
// 牌 → 種類番号 0..33
function kind(t){ const n=t.charCodeAt(0)-48, s=SUITS.indexOf(t[1]); return s===3? 27+n-1 : s*9+(n===0?4:n-1); }
// 種類番号 → 牌（赤なし）
function kname(k){ return k>=27? (k-26)+'z' : ((k%9)+1)+SUITS[(k/9)|0]; }
const isRed=t=>t[0]==='0';
const isHonorK=k=>k>=27, isTermK=k=>k<27&&(k%9===0||k%9===8), isYaochuK=k=>k>=27||k%9===0||k%9===8;
const numK=k=>k>=27?0:(k%9)+1;
const suitK=k=>k>=27?3:(k/9)|0;
const NAMES_Z=['東','南','西','北','白','發','中'];
function tileName(t){ if(!t) return ''; const n=t[0],s=t[1]; if(s==='z') return NAMES_Z[+n-1];
  const j={m:'萬',p:'筒',s:'索'}[s]; return n==='0'?'赤5'+j:n+j; }
function counts(tiles){ const c=new Array(34).fill(0); for(const t of tiles) c[kind(t)]++; return c; }
function tkey(t){ const s=SUITS.indexOf(t[1]); const n=t[0]==='0'?5.5:+t[0]; return s*10+n; }
const sortTiles=a=>a.slice().sort((x,y)=>tkey(x)-tkey(y));
// ドラ表示牌 → ドラの種類
function doraOf(ind){ const k=kind(ind);
  if(k<27) return ((k/9)|0)*9+((k%9)+1)%9;
  if(k<31) return 27+((k-27)+1)%4;
  return 31+((k-31)+1)%3; }

/* ---------------- シャンテン数 ----------------
   1色ごとに (面子数, 面子+搭子数) のパレート最良を雀頭あり/なし別に求めてメモ化し、色をまたいで合成する */
const SMEMO=new Map();
function paretoAdd(L,m,v){
  for(let i=0;i<L.length;i++){ const x=L[i]; if(x[0]>=m&&x[1]>=v) return; }
  for(let i=L.length-1;i>=0;i--){ const x=L[i]; if(m>=x[0]&&v>=x[1]) L.splice(i,1); }
  L.push([m,v]);
}
function suitOpts(c,off,honor){
  const len=honor?7:9;
  let key=honor?7:0;
  for(let i=0;i<len;i++) key=key*5+c[off+i];
  key=honor? -key-1 : key;
  let r=SMEMO.get(key); if(r) return r;
  const a=[]; for(let i=0;i<len;i++) a.push(c[off+i]);
  const res=[[],[]]; // [頭なし, 頭あり] それぞれ [m, m+t]
  (function dfs(i,m,t,h){
    while(i<len&&a[i]===0) i++;
    if(i>=len){ paretoAdd(res[h],m,m+t); return; }
    if(a[i]>=3){ a[i]-=3; dfs(i,m+1,t,h); a[i]+=3; }
    if(!honor&&i+2<len&&a[i+1]&&a[i+2]){ a[i]--;a[i+1]--;a[i+2]--; dfs(i,m+1,t,h); a[i]++;a[i+1]++;a[i+2]++; }
    if(a[i]>=2){ a[i]-=2; if(!h) dfs(i,m,t,1); dfs(i,m,t+1,h); a[i]+=2; }
    if(!honor&&i+1<len&&a[i+1]){ a[i]--;a[i+1]--; dfs(i,m,t+1,h); a[i]++;a[i+1]++; }
    if(!honor&&i+2<len&&a[i+2]){ a[i]--;a[i+2]--; dfs(i,m,t+1,h); a[i]++;a[i+2]++; }
    a[i]--; dfs(i,m,t,h); a[i]++;   // 孤立牌として残す
  })(0,0,0,0);
  if(SMEMO.size>600000) SMEMO.clear();
  SMEMO.set(key,res); return res;
}
function comb(A,B){
  const out=[[],[]];
  for(let ha=0;ha<2;ha++) for(const x of A[ha]) for(let hb=0;hb+ha<2;hb++) for(const y of B[hb]) paretoAdd(out[ha+hb],x[0]+y[0],x[1]+y[1]);
  return out;
}
function shantenStd(c,melds){
  let r=suitOpts(c,0,false); r=comb(r,suitOpts(c,9,false)); r=comb(r,suitOpts(c,18,false)); r=comb(r,suitOpts(c,27,true));
  const cap=4-melds; let best=8;
  for(let h=0;h<2;h++) for(const x of r[h]){
    const m=Math.min(x[0],cap), t=Math.min(x[1]-x[0], cap-m);
    const s=8-2*(m+melds)-t-h; if(s<best) best=s; }
  return best;
}
function shantenChiitoi(c){ let p=0,k=0; for(let i=0;i<34;i++){ if(c[i]>=1)k++; if(c[i]>=2)p++; } return 6-p+Math.max(0,7-k); }
function shantenKokushi(c){ let k=0,p=0; for(let i=0;i<34;i++) if(isYaochuK(i)){ if(c[i]){k++; if(c[i]>=2)p=1;} } return 13-k-p; }
// c: 手牌（副露を除く）の枚数配列, melds: 副露数
function shanten(c,melds){
  let s=shantenStd(c,melds|0);
  if(!melds){ let n=0; for(let i=0;i<34;i++) n+=c[i]; if(n>=13){ const a=shantenChiitoi(c), b=shantenKokushi(c); if(a<s)s=a; if(b<s)s=b; } }
  return s;
}
// 13枚（3n+1）の手で、シャンテン数を下げる牌（受け入れ）。visible: 見えている枚数（自分の手を含む）
function ukeire(c,melds,visible){
  const s=shanten(c,melds), out=[]; let total=0;
  for(let k=0;k<34;k++){
    if(c[k]>=4) continue;
    c[k]++; const s2=shanten(c,melds); c[k]--;
    if(s2<s){ const rest=Math.max(0,4-(visible?visible[k]:c[k])); out.push({k,rest}); total+=rest; }
  }
  return {shanten:s,tiles:out,total};
}
// 14枚（3n+2）の手から各打牌のシャンテン数と受け入れ
function discardTable(c,melds,visible){
  const rows=[];
  for(let k=0;k<34;k++){ if(!c[k]) continue;
    c[k]--; const u=ukeire(c,melds,visible); c[k]++;
    rows.push({k,shanten:u.shanten,tiles:u.tiles,total:u.total}); }
  return rows;
}
// テンパイ（13枚）の待ち（自分で4枚使っている牌は待ちにならない）
function waits(c,melds){
  const out=[];
  for(let k=0;k<34;k++){ if(c[k]>=4) continue; c[k]++; if(shanten(c,melds)===-1) out.push(k); c[k]--; }
  return out;
}
function isAgariC(c,melds){ return shanten(c,melds)===-1; }

/* ---------------- 和了形の分解 ---------------- */
// c: 副露を除いた 3n+2 枚。返り値: [{head:k, groups:[{t:'s'|'k', k}]}]
function decompose(c){
  const out=[];
  for(let h=0;h<34;h++){ if(c[h]<2) continue;
    c[h]-=2; const gs=[];
    (function rec(i){
      while(i<34&&c[i]===0) i++;
      if(i>=34){ out.push({head:h,groups:gs.slice()}); return; }
      if(c[i]>=3){ c[i]-=3; gs.push({t:'k',k:i}); rec(i); gs.pop(); c[i]+=3; }
      if(i<27&&i%9<=6&&c[i+1]&&c[i+2]){ c[i]--;c[i+1]--;c[i+2]--; gs.push({t:'s',k:i}); rec(i); gs.pop(); c[i]++;c[i+1]++;c[i+2]++; }
    })(0);
    c[h]+=2; }
  return out;
}

/* ---------------- 役・符・点数 ----------------
   w = { hand:[和了牌を含む手牌(副露以外)], melds:[{type,tiles}], win:牌, tsumo:bool, seat:0-3(自風 東=0), round:0-3,
         riichi, doubleRiichi, ippatsu, haitei, houtei, rinshan, chankan, tenhou, chiihou,
         dora:[表示牌], ura:[表示牌] }
   返り値: null(役なし) または {yaku:[[名前,翻]], han, fu, yakuman, ron | (all) | (oyaPay,koPay), pts, limit} */
const ceil100=x=>Math.ceil(x/100)*100;
function score(w){
  const melds=w.melds||[];
  const menzen=melds.every(m=>m.type==='ankan');
  const c=counts(w.hand), winK=kind(w.win);
  const all=c.slice();
  for(const m of melds) for(const t of m.tiles) all[kind(t)]++;
  if(shanten(c,melds.length)!==-1) return null;
  const yakuhaiK=[31,32,33,27+w.seat,27+w.round];
  let best=null;
  const consider=r=>{ if(r&&(!best||r.pts>best.pts||(r.pts===best.pts&&r.han>best.han))) best=r; };
  const base=[];
  if(w.tenhou) base.push(['天和',13,1]); if(w.chiihou) base.push(['地和',13,1]);
  // ドラ
  let dora=0, aka=0, ura=0;
  for(const d of (w.dora||[])) dora+=all[doraOf(d)];
  for(const t of w.hand) if(isRed(t)) aka++;
  for(const m of melds) for(const t of m.tiles) if(isRed(t)) aka++;
  if(w.riichi) for(const d of (w.ura||[])) ura+=all[doraOf(d)];
  const allK=[]; for(let i=0;i<34;i++) if(all[i]) allK.push(i);
  const isTanyao=allK.every(k=>!isYaochuK(k));
  const suitsUsed=new Set(allK.filter(k=>k<27).map(suitK)), hasHonor=allK.some(k=>k>=27);
  const honitsu=suitsUsed.size===1&&hasHonor, chinitsu=suitsUsed.size===1&&!hasHonor;
  const tsuiso=allK.every(k=>k>=27);
  const chinro=allK.every(k=>isTermK(k)), honro=allK.every(isYaochuK);
  const ryuiso=allK.every(k=>[19,20,21,23,25,32].indexOf(k)>=0);
  function common(y,mz){
    if(w.doubleRiichi) y.push(['ダブル立直',2]); else if(w.riichi) y.push(['立直',1]);
    if(w.ippatsu) y.push(['一発',1]);
    if(mz&&w.tsumo) y.push(['門前清自摸和',1]);
    if(w.haitei) y.push(['海底摸月',1]); if(w.houtei) y.push(['河底撈魚',1]);
    if(w.rinshan) y.push(['嶺上開花',1]); if(w.chankan) y.push(['槍槓',1]);
    if(isTanyao) y.push(['断幺九',1]);
    if(chinitsu) y.push(['清一色',mz?6:5]); else if(honitsu) y.push(['混一色',mz?3:2]);
  }
  function fin(yaku,fu){
    const ym=yaku.filter(x=>x[2]);
    let han, mult=0;
    if(ym.length){ mult=ym.length; han=13*mult; yaku=ym; }
    else { han=yaku.reduce((a,x)=>a+x[1],0); if(han===0) return null;
      yaku=yaku.slice();
      if(dora) yaku.push(['ドラ',dora]); if(aka) yaku.push(['赤ドラ',aka]); if(w.riichi&&ura) yaku.push(['裏ドラ',ura]);
      han+=dora+aka+(w.riichi?ura:0); }
    let b;
    if(mult) b=8000*mult; else if(han>=13) b=8000; else if(han>=11) b=6000; else if(han>=8) b=4000; else if(han>=6) b=3000;
    else { b=fu*Math.pow(2,han+2); if(han>=5||b>2000) b=2000; }
    const oya=w.seat===0;
    const r={yaku,han,fu,yakuman:mult,base:b,oya};
    if(w.tsumo){ if(oya){ r.all=ceil100(b*2); r.pts=r.all*3; } else { r.oyaPay=ceil100(b*2); r.koPay=ceil100(b); r.pts=r.oyaPay+r.koPay*2; } }
    else { r.ron=ceil100(b*(oya?6:4)); r.pts=r.ron; }
    r.limit= mult? (mult>1?mult+'倍役満':'役満') : han>=13?'数え役満':han>=11?'三倍満':han>=8?'倍満':han>=6?'跳満':(han>=5||b>=2000)?'満貫':'';
    return r;
  }
  // ---- 国士無双
  if(!melds.length&&shantenKokushi(c)===-1){ consider(fin(base.concat([['国士無双',13,1]]),0)); return best; }
  // ---- 七対子（二盃口形と両立する場合は高い方）
  if(!melds.length&&shantenChiitoi(c)===-1){
    const y=base.slice();
    if(tsuiso) y.push(['字一色',13,1]);
    common(y,true); y.push(['七対子',2]);
    if(honro) y.push(['混老頭',2]);
    consider(fin(y,25));
  }
  // ---- 通常形
  for(const d of decompose(c)){
    // 和了牌がどの面子／雀頭に入るか（待ちの解釈）を全通り試す
    const choices=[];
    if(d.head===winK) choices.push({g:-1,wait:'tanki'});
    d.groups.forEach((g,i)=>{
      if(g.t==='k'&&g.k===winK) choices.push({g:i,wait:'shanpon'});
      if(g.t==='s'&&winK>=g.k&&winK<=g.k+2){
        const p=winK-g.k, n=numK(g.k);
        const wt = p===1?'kanchan' : ((p===0&&n===7)||(p===2&&n===1))?'penchan':'ryanmen';
        choices.push({g:i,wait:wt}); }
    });
    for(const ch of choices){
      const G=d.groups.map((g,i)=>({t:g.t,k:g.k,open:(!w.tsumo&&i===ch.g&&g.t==='k'),kan:false}));
      for(const m of melds){ const ks=m.tiles.map(kind).sort((a,b)=>a-b);
        if(m.type==='chi') G.push({t:'s',k:ks[0],open:true,kan:false});
        else G.push({t:'k',k:ks[0],open:m.type!=='ankan',kan:m.type!=='pon'}); }
      const shun=G.filter(g=>g.t==='s'), kou=G.filter(g=>g.t==='k');
      const anko=kou.filter(g=>!g.open).length, kans=kou.filter(g=>g.kan).length;
      // 役満
      const y=base.slice();
      if(anko===4) y.push([ch.wait==='tanki'?'四暗刻単騎':'四暗刻',13,1]);
      const dragonsK=kou.filter(g=>g.k>=31).length;
      if(dragonsK===3) y.push(['大三元',13,1]);
      const windsK=kou.filter(g=>g.k>=27&&g.k<=30).length;
      if(windsK===4) y.push(['大四喜',13,1]); else if(windsK===3&&d.head>=27&&d.head<=30) y.push(['小四喜',13,1]);
      if(tsuiso) y.push(['字一色',13,1]); if(ryuiso) y.push(['緑一色',13,1]); if(chinro) y.push(['清老頭',13,1]);
      if(kans===4) y.push(['四槓子',13,1]);
      if(!melds.length&&chinitsu){ const s0=suitK(allK[0])*9; const need=[3,1,1,1,1,1,1,1,3]; let ok=true;
        for(let i=0;i<9;i++) if(all[s0+i]<need[i]) ok=false; if(ok) y.push(['九蓮宝燈',13,1]); }
      if(y.some(x=>x[2])){ consider(fin(y,0)); continue; }
      common(y,menzen);
      for(const g of kou){ if(g.k===31) y.push(['役牌 白',1]); if(g.k===32) y.push(['役牌 發',1]); if(g.k===33) y.push(['役牌 中',1]);
        if(g.k===27+w.seat) y.push(['自風 '+NAMES_Z[w.seat],1]); if(g.k===27+w.round) y.push(['場風 '+NAMES_Z[w.round],1]); }
      const headYakuhai=yakuhaiK.indexOf(d.head)>=0;
      const pinfu=!melds.length&&kou.length===0&&!headYakuhai&&ch.wait==='ryanmen';
      if(pinfu) y.push(['平和',1]);
      if(!melds.length){ const cnt={}; shun.forEach(g=>cnt[g.k]=(cnt[g.k]||0)+1);
        let pk=0; for(const k in cnt) pk+=Math.floor(cnt[k]/2);
        if(pk===2) y.push(['二盃口',3]); else if(pk===1) y.push(['一盃口',1]); }
      for(let n=0;n<7;n++) if([0,9,18].every(s=>shun.some(g=>g.k===s+n))){ y.push(['三色同順',menzen?2:1]); break; }
      for(const s of [0,9,18]) if([0,3,6].every(n=>shun.some(g=>g.k===s+n))){ y.push(['一気通貫',menzen?2:1]); break; }
      for(let n=0;n<9;n++) if([0,9,18].every(s=>kou.some(g=>g.k===s+n))){ y.push(['三色同刻',2]); break; }
      if(kou.length===4) y.push(['対々和',2]);
      if(anko===3) y.push(['三暗刻',2]);
      if(kans===3) y.push(['三槓子',2]);
      if(dragonsK===2&&d.head>=31) y.push(['小三元',2]);
      const grpYao=g=> g.t==='k'? isYaochuK(g.k) : (numK(g.k)===1||numK(g.k)===7);
      if(G.every(grpYao)&&isYaochuK(d.head)){
        if(honro) y.push(['混老頭',2]);
        else if(shun.length){ if(!hasHonor) y.push(['純全帯幺九',menzen?3:2]); else y.push(['混全帯幺九',menzen?2:1]); }
      }
      let fu;
      if(pinfu) fu=w.tsumo?20:30;
      else {
        fu=20; if(menzen&&!w.tsumo) fu+=10; if(w.tsumo) fu+=2;
        if(d.head>=31) fu+=2; if(d.head===27+w.seat) fu+=2; if(d.head===27+w.round) fu+=2;
        if(ch.wait==='tanki'||ch.wait==='kanchan'||ch.wait==='penchan') fu+=2;
        for(const g of kou){ let f=isYaochuK(g.k)?4:2; if(!g.open) f*=2; if(g.kan) f*=4; fu+=f; }
        fu=Math.ceil(fu/10)*10;
        if(!menzen&&fu===20) fu=30;
      }
      consider(fin(y,fu));
    }
  }
  return best;
}

const MJ={kind,kname,isRed,isHonorK,isTermK,isYaochuK,numK,suitK,tileName,counts,sortTiles,tkey,doraOf,
  shanten,shantenStd,shantenChiitoi,shantenKokushi,ukeire,discardTable,waits,isAgariC,decompose,score,NAMES_Z};
root.MJ=MJ;
if(typeof module!=='undefined'&&module.exports) module.exports=MJ;
})(typeof window!=='undefined'?window:globalThis);
