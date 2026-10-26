/* Mortal代役AI（完全オフライン）
   Mortal の解析結果（98半荘・約1.5万判断の確率分布）を教師データにして学習した線形ソフトマックス方策。
   局面 obs と合法手 actions を受け取り、各手の確率（Mortal の「％」に相当）を返す。
   ・特徴量: 牌効率（シャンテン・受け入れ・テンパイ時の待ち枚数・1シャンテンからの好形率）、
             牌の種類（孤立字牌・役牌・端牌・ドラ）、押し引き（相手のリーチ／仕掛けに対する危険度区分）、
             鳴き（シャンテン前進・役の有無・ドラ）、リーチ判断（待ち・打点・巡目・順位）
   ・重み: local/ai-weights.js（tools/local-ai/train.js が Mortal のデータから学習して書き出す）

   obs = { me, oya, bakaze(0-3), kyoku(1-4), honba, kyotaku, scores[4],
           dora:[表示牌], left, hand:[手牌(ツモ牌を含む)], drawn,
           melds:[[{type,tiles,from,pai}]x4], rivers:[[{pai,tsumogiri,riichi,called,seq}]x4],
           riichiSeq:[-1|宣言牌のseq x4], last:{actor,pai}|null, allLast:bool }
   action = {type:'dahai',pai} | {type:'reach'} | {type:'chi'|'pon'|'daiminkan',pai,consumed} |
            {type:'ankan',consumed} | {type:'kakan',pai} | {type:'hora'} | {type:'ryukyoku'} | {type:'none'} */
(function(root){
"use strict";
const MJ=root.MJ||(typeof require!=='undefined'?require('./mj-core.js'):null);
const {kind,numK,suitK,isYaochuK,doraOf,shanten,counts}=MJ;

/* ---------------- 特徴量の定義 ---------------- */
const F=[]; const FI={};
function def(name){ FI[name]=F.length; F.push(name); }
// 打牌
['d_sh1','d_sh2','d_uke','d_ukerel','d_ukemax','d_wait','d_waitdead','d_furiten','d_good','d_goodrel','d_tpyaku','d_tpnoyaku_open',
 'd_tphan','d_iso_guest','d_iso_yakuhai','d_iso_19','d_iso_28','d_iso_37','d_iso_456',
 'd_guest','d_yakuhai','d_19','d_28','d_37','d_456','d_pairbreak','d_tribreak','d_yakuhaipair','d_dora','d_red',
 'd_vis_honor','d_tsumogiri_same','d_chiitoi_mode','d_sh2_far','d_uke_far','d_flushkeep','d_flushoff',
 'd_u2','d_u2rel','d_u2max','d_doranear','d_doranear2','d_sanshoku','d_ittsu','d_tanyao','d_safekeep','d_early_honor','d_late_safe',
 'd_imp','d_imprel','d_conn','d_connrel','d_ukediff','d_tpyakufrac','d_open_noyaku','d_tanyao_cut','d_tanyao_break','d_honor_yakuhai_early',
 'd_push_makesafe','d_push_pair','d_push_musuji','d_safe_count'].forEach(def);
// 危険度区分
const NCAT=17;
for(const b of ['tp','s1','s2']) for(let i=0;i<NCAT;i++) def('r_'+b+'_'+i);
for(let i=0;i<NCAT;i++) def('o_'+i);
['dz_oya','dz_val','dz_left','dz_last','dz_multi'].forEach(def);
// リーチ
['R_bias','R_wait','R_kinds','R_damayaku','R_damahan','R_rhan','R_left','R_opp','R_open','R_oya','R_lasttop','R_lastlow','R_mangan','R_danger'].forEach(def);
// 鳴き
['C_chi','C_pon','C_kan','C_adv','C_worse','C_tp','C_sh','C_uke','C_yakuhai','C_yakupath','C_noyaku','C_first','C_dora',
 'C_opp','C_left','C_oya','C_tanyao','C_flush','C_toitoi','C_far','C_honorpair','C_danger'].forEach(def);
// 槓・和了・流局
['K_ankan','K_kakan','K_worse','K_ukeloss','K_riichi','K_opp','K_tp','H_bias','Y_bias','Y_yao'].forEach(def);
// 局面の文脈（すべての手に付ける。隠れ層で他の特徴量と組み合わさる）
['x_s0','x_s1','x_s2','x_s3','x_left','x_riichi','x_open','x_oya','x_dora','x_last','x_rank0','x_rank3','x_none'].forEach(def);

/* ---------------- 局面の前処理 ---------------- */
function visibleCounts(obs){
  const v=counts(obs.hand);
  for(const r of obs.rivers) for(const d of r) if(!d.called) v[kind(d.pai)]++;
  for(const ms of obs.melds) for(const m of ms) for(const t of m.tiles) v[kind(t)]++;
  for(const d of obs.dora) v[kind(d)]++;
  for(let i=0;i<34;i++) if(v[i]>4) v[i]=4;
  return v;
}
// 相手 o に対して安全な牌（現物＋リーチ後の通過牌＋同巡内フリテン）
function safeSet(obs,o){
  const s=new Uint8Array(34);
  const r=obs.rivers[o];
  for(const d of r) s[kind(d.pai)]=1;
  const lastSeq=r.length? r[r.length-1].seq : -1;
  const rs=obs.riichiSeq[o];
  for(let p=0;p<4;p++) if(p!==o) for(const d of obs.rivers[p]){
    if((rs>=0&&d.seq>rs)||d.seq>lastSeq) s[kind(d.pai)]=1; }
  return s;
}
// 危険度区分 0:現物 1-4:字牌(見え枚数0-3) 5-16:数牌(19/28/37/456 × 両面の生き残り なし/一部/全部)
function dangerCat(k,safe,vis){
  if(safe[k]) return 0;
  if(k>=27) return 1+Math.min(3,vis[k]-0);
  const n=numK(k), base=k-n+1; let total=0, live=0;
  // n と n+3 の両面待ち（搭子 n+1,n+2）
  if(n<=6){ total++; const ok=!safe[base+n+2] && vis[base+n]<4 && vis[base+n+1]<4; if(ok) live++; }
  // n-3 と n の両面待ち（搭子 n-2,n-1）
  if(n>=4){ total++; const ok=!safe[base+n-4] && vis[base+n-2]<4 && vis[base+n-3]<4; if(ok) live++; }
  const cls=(n===1||n===9)?0:(n===2||n===8)?1:(n===3||n===7)?2:3;
  return 5+cls*3+(live===0?0:live<total?1:2);
}
// リーチに対する放銃率の目安（％, 中盤）: 区分ごとの事前値。学習で補正される
const PRIOR=[0, 7.0,4.5,2.2,0.5, 2.5,6,6.5, 3.5,7,8, 4.5,9,10, 4.5,7.5,12.5];
// 自分の役の可能性（鳴き判断用）
function yakuPaths(c,melds,seat,round){
  const yak=[31,32,33,27+seat,27+round];
  const allK=c.slice(); for(const m of melds) for(const t of m.tiles) allK[kind(t)]++;
  let yakuhaiMeld=false, yakuhaiPair=false;
  for(const m of melds){ const k=kind(m.tiles[0]); if(m.type!=='chi'&&yak.indexOf(k)>=0) yakuhaiMeld=true; }
  for(const k of yak) if(c[k]>=2) yakuhaiPair=true;
  let yao=0; for(let k=0;k<34;k++) if(isYaochuK(k)) yao+=c[k];
  const meldYao=melds.some(m=>m.tiles.some(t=>isYaochuK(kind(t))));
  const tanyao=!meldYao&&yao<=1;
  // 混一色: 副露がすべて同じ色（＋字牌）で、手牌の他色が2枚以下
  let flush=false;
  for(let s=0;s<3;s++){
    if(!melds.every(m=>m.tiles.every(t=>{const k=kind(t);return k>=27||suitK(k)===s;}))) continue;
    let off=0; for(let k=0;k<27;k++) if(suitK(k)!==s) off+=c[k];
    if(off<=2) flush=true; }
  let pairs=0; for(let k=0;k<34;k++) if(c[k]>=2) pairs++;
  const toitoi=melds.every(m=>m.type!=='chi')&&(pairs+melds.length)>=4;
  return {yakuhaiMeld,yakuhaiPair,tanyao,flush,toitoi};
}
// 待ち候補（手牌の近くの牌だけ調べて高速化）
function waitKinds(c,melds){
  const cand=new Uint8Array(34);
  for(let k=0;k<34;k++) if(c[k]){
    cand[k]=1;
    if(k<27){ const n=k%9; for(let d=-2;d<=2;d++){ const m=n+d; if(m>=0&&m<9) cand[k+d]=1; } }
  }
  if(!melds&&MJ.shantenKokushi(c)<=0) for(let k=0;k<34;k++) if(isYaochuK(k)) cand[k]=1;
  const out=[];
  for(let k=0;k<34;k++){ if(!cand[k]||c[k]>=4) continue; c[k]++; if(shanten(c,melds)===-1) out.push(k); c[k]--; }
  return out;
}
function waitInfo(c,melds,vis,ownSafe){
  const ws=waitKinds(c,melds); let rest=0, furiten=false;
  for(const k of ws){ rest+=Math.max(0,4-vis[k]-0); if(ownSafe&&ownSafe[k]) furiten=true; }
  return {ws,rest,furiten};
}
// 1シャンテンの13枚: 有効牌を引いてテンパイしたときの最大待ち枚数の加重和（好形率の目安）
function goodness(c,melds,vis){
  let g=0, n=0;
  for(let k=0;k<34;k++){
    if(c[k]>=4) continue; const rest=4-vis[k]; if(rest<=0) continue;
    c[k]++;
    if(shanten(c,melds)===0){
      let best=0;
      for(let d=0;d<34;d++){ if(!c[d]||d===k&&c[d]===1) continue;
        c[d]--; if(shanten(c,melds)===0){ const w=waitKinds(c,melds); let r=0; for(const x of w) r+=Math.max(0,4-vis[x]-(x===k?1:0)); if(r>best) best=r; }
        c[d]++; }
      g+=rest*best; n+=rest;
    }
    c[k]--;
  }
  return {g,n};
}
// 2次受け入れ: 有効牌 x を引いたあと最良の打牌をしたときの受け入れ枚数の加重和
function uke2(c,melds,vis,s){
  let tot=0;
  for(let x=0;x<34;x++){
    if(c[x]>=4) continue; const rest=4-vis[x]; if(rest<=0) continue;
    c[x]++;
    if(shanten(c,melds)<s){
      let best=0;
      for(let d=0;d<34;d++){ if(!c[d]) continue; c[d]--;
        if(shanten(c,melds)===s-1){ let u=0;
          for(let y=0;y<34;y++){ if(c[y]>=4) continue; c[y]++; if(shanten(c,melds)<s-1) u+=Math.max(0,4-vis[y]-(y===x?1:0)); c[y]--; }
          if(u>best) best=u; }
        c[d]++; }
      tot+=rest*best;
    }
    c[x]--;
  }
  return tot;
}
// 改良: シャンテン数は変わらないが、引くと（最良の打牌のあと）受け入れが増える牌の加重和
function improve(c,melds,vis,s,uke){
  let tot=0;
  for(let x=0;x<34;x++){
    if(c[x]>=4) continue; const rest=4-vis[x]; if(rest<=0) continue;
    c[x]++;
    if(shanten(c,melds)===s){
      let best=0;
      for(let d=0;d<34;d++){ if(!c[d]||d===x) continue; c[d]--;
        if(shanten(c,melds)===s){ let u=0;
          for(let y=0;y<34;y++){ if(c[y]>=4) continue; c[y]++; if(shanten(c,melds)<s) u+=Math.max(0,4-vis[y]-(y===x?1:0)); c[y]--; }
          if(u>best) best=u; }
        c[d]++; }
      if(best>uke) tot+=rest*(best-uke);
    }
    c[x]--;
  }
  return tot;
}
// つながり: 手牌の各牌の近く（数牌は±2、字牌は同じ牌）で、まだ見えていない牌の枚数
function connectivity(c,vis){
  const near=new Uint8Array(34);
  for(let k=0;k<34;k++) if(c[k]){ near[k]=1; if(k<27){ const n=k%9; for(let d=-2;d<=2;d++){ const m=n+d; if(m>=0&&m<9) near[k+d]=1; } } }
  let t=0; for(let k=0;k<34;k++) if(near[k]) t+=Math.max(0,4-vis[k]);
  return t;
}
// 三色・一通の形の近さ（0..1）
function sanshokuPot(c){ let best=0; for(let n=0;n<7;n++){ let v=0; for(let s=0;s<3;s++){ for(let i=0;i<3;i++) if(c[s*9+n+i]) v++; } if(v>best) best=v; } return best/9; }
function ittsuPot(c){ let best=0; for(let s=0;s<3;s++){ let v=0; for(let i=0;i<9;i++) if(c[s*9+i]) v++; if(v>best) best=v; } return best/9; }
function rankOf(obs,seat){ let r=0; for(let p=0;p<4;p++) if(p!==seat&&(obs.scores[p]>obs.scores[seat]||(obs.scores[p]===obs.scores[seat]&&((p-obs.oya+4)%4)<((seat-obs.oya+4)%4)))) r++; return r; }
// 和了したときのおおよその翻数（役なしなら0）
function estHan(obs,c13,meldsArr,riichi,vis){
  const ws=waitKinds(c13,meldsArr.length);
  if(!ws.length) return {yaku:false,han:0};
  const seat=(obs.me-obs.oya+4)%4;
  const hand=[]; for(let k=0;k<34;k++) for(let i=0;i<c13[k];i++) hand.push(MJ.kname(k));
  // 赤ドラの枚数を反映
  const reds=obs.hand.filter(MJ.isRed).length;
  let sum=0, n=0, yakuAny=false, yw=0;
  for(const k of ws){
    const win=MJ.kname(k);
    const r=MJ.score({hand:hand.concat([win]),melds:meldsArr,win,tsumo:false,seat,round:obs.bakaze,riichi,dora:obs.dora,ura:[]});
    const w=Math.max(0.5,4-vis[k]);
    if(r){ yakuAny=true; sum+=w*(r.yakuman?13:Math.min(13,r.han+reds)); yw+=w; } n+=w;
  }
  return {yaku:yakuAny,han:n?sum/n:0,frac:n?yw/n:0};
}

/* ---------------- 特徴量の計算 ---------------- */
function prep(obs){
  if(obs._p) return obs._p;
  const me=obs.me, vis=visibleCounts(obs);
  const safe=[0,1,2,3].map(o=>o===me?null:safeSet(obs,o));
  const riichi=[0,1,2,3].map(o=>o!==me&&obs.riichiSeq[o]>=0?1:0);
  const openT=[0,1,2,3].map(o=>{ if(o===me||riichi[o]) return 0; const n=obs.melds[o].filter(m=>m.type!=='ankan').length; return n>=3?1:n===2?0.5:0; });
  const myMelds=obs.melds[me];
  const mz=myMelds.every(m=>m.type==='ankan');
  let dora=0; const c=counts(obs.hand); for(const d of obs.dora){ dora+=c[doraOf(d)]; for(const m of myMelds) for(const t of m.tiles) if(kind(t)===doraOf(d)) dora++; }
  dora+=obs.hand.filter(MJ.isRed).length; for(const m of myMelds) dora+=m.tiles.filter(MJ.isRed).length;
  const nRiichi=riichi.reduce((a,b)=>a+b,0);
  const left=obs.left;
  const seat=(me-obs.oya+4)%4;
  return obs._p={vis,safe,riichi,openT,mz,dora,nRiichi,left,seat,rank:rankOf(obs,me),
    meldsArr:myMelds.map(m=>({type:m.type,tiles:m.tiles})), ownSafe:(()=>{const s=new Uint8Array(34); for(const d of obs.rivers[me]) s[kind(d.pai)]=1; return s;})()};
}
function dangerFeats(f,obs,P,k,bucket,scale){
  let any=0;
  for(let o=0;o<4;o++){
    if(o===obs.me) continue;
    const cat=dangerCat(k,P.safe[o],P.vis);
    if(P.riichi[o]){ any=1;
      add(f,'r_'+bucket+'_'+cat,scale);
      const pr=PRIOR[cat]/10;
      if(o===obs.oya) add(f,'dz_oya',pr);
      add(f,'dz_val',pr*Math.min(P.dora,4)/4);
      add(f,'dz_left',pr*(1-P.left/70));
      if(obs.allLast) add(f,'dz_last',pr);
      if(P.nRiichi>=2) add(f,'dz_multi',pr);
    } else if(P.openT[o]) add(f,'o_'+cat,P.openT[o]);
  }
  return any;
}
function add(f,name,v){ const i=FI[name]; if(i===undefined) throw new Error('feature '+name); f[i]=(f[i]||0)+v; }
// 打牌候補（14枚）をまとめて評価してキャッシュ
function discardInfo(obs){
  const P=prep(obs);
  if(P.dinfo) return P.dinfo;
  const c=counts(obs.hand), melds=obs.melds[obs.me].length;
  const rows={};
  let smin=9;
  for(let k=0;k<34;k++){ if(!c[k]) continue;
    c[k]--;
    const s=shanten(c,melds);
    let uke=0;
    for(let x=0;x<34;x++){ if(c[x]>=4) continue; c[x]++; if(shanten(c,melds)<s) uke+=Math.max(0,4-P.vis[x]); c[x]--; }
    rows[k]={s,uke};
    if(s<smin) smin=s;
    c[k]++; }
  let umax=0; for(const k in rows) if(rows[k].s===smin&&rows[k].uke>umax) umax=rows[k].uke;
  // 2次の指標（1シャンテン・テンパイ）
  let gmax=0, u2max=0, impmax=0, connmax=0;
  for(const k in rows){ const r=rows[k]; const kk=+k;
    if(r.s===smin&&smin>=2&&r.uke>=umax*0.5){ c[kk]--; r.u2=uke2(c,melds,P.vis,smin); c[kk]++; if(r.u2>u2max) u2max=r.u2; }
    if(r.s===smin&&smin>=1&&smin<=3&&r.uke>=umax*0.5){ c[kk]--; r.imp=improve(c,melds,P.vis,smin,r.uke); c[kk]++; if(r.imp>impmax) impmax=r.imp; }
    c[kk]--; r.conn=connectivity(c,P.vis); c[kk]++; if(r.conn>connmax) connmax=r.conn;
    if(r.s===smin&&smin===1&&r.uke>=umax*0.4){ c[kk]--; const g=goodness(c,melds,P.vis); c[kk]++; r.good=g.g; if(g.g>gmax) gmax=g.g; }
    if(r.s===0){ c[kk]--; const w=waitInfo(c,melds,P.vis,P.ownSafe); r.wait=w; r.han=estHan(obs,c,P.meldsArr,false,P.vis); c[kk]++; }
  }
  const ss0=sanshokuPot(c), it0=ittsuPot(c);
  for(const k in rows){ const kk=+k; c[kk]--; rows[k].sp=ss0-sanshokuPot(c); rows[k].ip=it0-ittsuPot(c); c[kk]++; }
  let yao=0; for(let k=0;k<34;k++) if(isYaochuK(k)) yao+=c[k];
  return P.dinfo={rows,smin,umax,gmax,u2max,impmax,connmax,c,yao};
}
function featDahai(obs,a){
  const P=prep(obs), D=discardInfo(obs), f={};
  const k=kind(a.pai), r=D.rows[k], c=D.c;
  if(!r) return f;
  const ds=r.s-D.smin;
  if(ds===1) add(f,'d_sh1',1); else if(ds>=2) add(f,'d_sh2',1);
  if(ds===0){
    add(f,'d_uke',Math.log1p(r.uke)/3);
    add(f,'d_ukerel',D.umax?r.uke/D.umax:0);
    if(D.umax&&r.uke===D.umax) add(f,'d_ukemax',1);
    if(D.smin>=3){ add(f,'d_uke_far',D.umax?r.uke/D.umax:0); }
    add(f,'d_ukediff',(r.uke-D.umax)/8);
    if(r.imp!=null){ add(f,'d_imp',Math.log1p(r.imp)/5); if(D.impmax>0) add(f,'d_imprel',r.imp/D.impmax); }
    if(r.u2!=null&&D.u2max>0){ add(f,'d_u2',Math.log1p(r.u2)/6); add(f,'d_u2rel',r.u2/D.u2max); if(r.u2===D.u2max) add(f,'d_u2max',1); }
    if(r.good!=null&&D.gmax>0){ add(f,'d_good',Math.log1p(r.good)/5); add(f,'d_goodrel',r.good/D.gmax); }
  }
  if(D.smin>=3&&ds>=1) add(f,'d_sh2_far',1);
  add(f,'d_conn',(r.conn-D.connmax)/10); if(D.connmax) add(f,'d_connrel',r.conn/D.connmax);
  if(r.s===0&&r.wait){
    add(f,'d_wait',Math.log1p(r.wait.rest)/2.5);
    if(r.wait.rest===0) add(f,'d_waitdead',1);
    if(r.wait.furiten) add(f,'d_furiten',1);
    if(r.han.yaku) add(f,'d_tpyaku',1); else if(!P.mz) add(f,'d_tpnoyaku_open',1);
    add(f,'d_tpyakufrac',r.han.frac||0);
    add(f,'d_tphan',Math.min(r.han.han,8)/8);
  }
  // 牌の種類
  const cnt=c[k];
  const yak=[31,32,33,27+P.seat,27+obs.bakaze];
  let iso=cnt===1;
  if(k<27){ const n=k%9; for(let d=-2;d<=2;d++){ if(!d) continue; const m=n+d; if(m>=0&&m<9&&c[k+d]) iso=false; } }
  const cls = k>=27? (yak.indexOf(k)>=0?'yakuhai':'guest') : (numK(k)===1||numK(k)===9)?'19':(numK(k)===2||numK(k)===8)?'28':(numK(k)===3||numK(k)===7)?'37':'456';
  add(f,(iso?'d_iso_':'d_')+cls,1);
  if(cnt===2){ add(f,'d_pairbreak',1); if(cls==='yakuhai') add(f,'d_yakuhaipair',1); }
  if(cnt>=3) add(f,'d_tribreak',1);
  let dv=0; for(const d of obs.dora) if(doraOf(d)===k) dv++;
  if(dv) add(f,'d_dora',dv);
  if(MJ.isRed(a.pai)) add(f,'d_red',1);
  // ドラの近く（ドラ受けになる牌）
  if(k<27) for(const d of obs.dora){ const dk=doraOf(d); if(dk<27&&suitK(dk)===suitK(k)){ const dd=Math.abs(dk-k); if(dd===1) add(f,'d_doranear',1); else if(dd===2) add(f,'d_doranear2',1); } }
  // 手役の形を崩すか
  if(r.sp>0&&D.smin<=3) add(f,'d_sanshoku',r.sp*9*sanshokuPot(c));
  if(r.ip>0&&D.smin<=3) add(f,'d_ittsu',r.ip*9*ittsuPot(c));
  // 断幺九: 幺九牌の少ない手では幺九牌を切って断幺九に寄せる
  if(D.yao<=3&&D.smin<=3){ if(isYaochuK(k)) add(f,'d_tanyao_cut',(4-D.yao)/4); else add(f,'d_tanyao',(4-D.yao)/4); }
  // 副露手: 切ったあとに役の可能性が残るか
  if(!P.mz){ c[k]--; const yp=yakuPaths(c,P.meldsArr,P.seat,obs.bakaze); c[k]++;
    if(!(yp.yakuhaiMeld||yp.yakuhaiPair||yp.tanyao||yp.flush||yp.toitoi)) add(f,'d_open_noyaku',1);
    if(yp.tanyao&&isYaochuK(k)) add(f,'d_tanyao_cut',1); }
  if(cls==='yakuhai'&&P.left>=55&&cnt===1) add(f,'d_honor_yakuhai_early',1);
  // 安全牌の価値（誰かがリーチしそうな中盤以降に、どの相手にも通っている牌）
  { let safeAll=true; for(let o=0;o<4;o++) if(o!==obs.me&&!P.safe[o][k]) safeAll=false;
    if(safeAll&&k>=27) add(f,'d_safekeep',1-P.left/70);
    if(k>=27&&P.left>=55) add(f,'d_early_honor',1);
    if(safeAll) add(f,'d_late_safe',(1-P.left/70)*(D.smin>=2?1:0)); }
  if(k>=27) add(f,'d_vis_honor',(P.vis[k]-cnt)/3);
  // 七対子寄りの手
  if(P.mz&&MJ.shantenChiitoi(c)<=D.smin&&MJ.shantenChiitoi(c)<=2&&cnt===1) add(f,'d_chiitoi_mode',1);
  // 染め手: 副露が一色ならその色・字牌を切るのは悪い
  if(!P.mz){
    const ms=obs.melds[obs.me]; let s0=-1, mono=true;
    for(const m of ms) for(const t of m.tiles){ const kk=kind(t); if(kk<27){ const s=suitK(kk); if(s0<0)s0=s; else if(s!==s0) mono=false; } }
    if(mono&&s0>=0){ if(k>=27||suitK(k)===s0) add(f,'d_flushkeep',1); else add(f,'d_flushoff',1); }
  }
  // 押し引き
  const bucket= r.s<=0?'tp': r.s===1?'s1':'s2';
  const anyR=dangerFeats(f,obs,P,k,bucket,1);
  if(anyR){
    // 発男道場の押し方の原則: 通れば他の手牌が安全（現物・筋）になる牌から切る／危険牌は対子から切る／将来通す無筋の本数を減らす
    let makeSafe=0, musujiAfter=0, safeLeft=0;
    for(let o=0;o<4;o++){ if(o===obs.me||!P.riichi[o]) continue;
      const sf=P.safe[o]; const sf2=sf.slice(); sf2[k]=1;
      for(let x=0;x<34;x++){ if(!c[x]) continue; const n=x===k?c[x]-1:c[x]; if(!n) continue;
        const before=dangerCat(x,sf,P.vis), after=dangerCat(x,sf2,P.vis);
        if(PRIOR[after]<PRIOR[before]) makeSafe+=n;
        if(after>=5&&PRIOR[after]>=6) musujiAfter+=n;
        if(after===0) safeLeft+=n; }
    }
    add(f,'d_push_makesafe',Math.min(makeSafe,6)/6);
    add(f,'d_push_musuji',Math.min(musujiAfter,10)/10);
    add(f,'d_safe_count',Math.min(safeLeft,6)/6);
    let isSafe=true; for(let o=0;o<4;o++) if(o!==obs.me&&P.riichi[o]&&!P.safe[o][k]) isSafe=false;
    if(!isSafe&&cnt>=2) add(f,'d_push_pair',1);
  }
  return f;
}
function featReach(obs){
  const P=prep(obs), D=discardInfo(obs), f={};
  add(f,'R_bias',1);
  // リーチ後に切れる牌のうち、最も待ちが多いもの
  let best=null;
  for(const k in D.rows){ const r=D.rows[k]; if(r.s===0&&r.wait&&(!best||r.wait.rest>best.wait.rest)) best=r; }
  if(best){
    add(f,'R_wait',Math.log1p(best.wait.rest)/2.5);
    if(best.wait.ws.length>=2) add(f,'R_kinds',1);
    if(best.han.yaku) add(f,'R_damayaku',1);
    add(f,'R_damahan',Math.min(best.han.han,8)/8);
    if(best.han.han>=4.5) add(f,'R_mangan',1);
    add(f,'R_rhan',Math.min(best.han.yaku?best.han.han+1:2,8)/8);
  }
  add(f,'R_left',P.left/70);
  add(f,'R_opp',P.nRiichi);
  add(f,'R_open',P.openT.reduce((a,b)=>a+b,0));
  if(P.seat===0) add(f,'R_oya',1);
  if(obs.allLast&&P.rank===0) add(f,'R_lasttop',1);
  if(obs.allLast&&P.rank===3) add(f,'R_lastlow',1);
  return f;
}
function featCall(obs,a){
  const P=prep(obs), f={};
  const me=obs.me, myM=obs.melds[me];
  const c=counts(obs.hand), melds=myM.length;
  const s0=shanten(c,melds);
  let u0=0; for(let x=0;x<34;x++){ if(c[x]>=4) continue; c[x]++; if(shanten(c,melds)<s0) u0+=Math.max(0,4-P.vis[x]); c[x]--; }
  add(f,a.type==='chi'?'C_chi':a.type==='pon'?'C_pon':'C_kan',1);
  const c2=c.slice(); for(const t of a.consumed) c2[kind(t)]--;
  const ck=kind(a.pai);
  const newMelds=P.meldsArr.concat([{type:a.type,tiles:a.consumed.concat([a.pai])}]);
  let s1=9,u1=0;
  if(a.type==='daiminkan'){ s1=shanten(c2,melds+1); for(let x=0;x<34;x++){ if(c2[x]>=4) continue; c2[x]++; if(shanten(c2,melds+1)<s1) u1+=Math.max(0,4-P.vis[x]); c2[x]--; } }
  else {
    // 喰い替え禁止の牌を除いて最良の打牌
    const ban=new Set([ck]);
    if(a.type==='chi'){ const ks=a.consumed.map(kind).sort((x,y)=>x-y);
      if(ks[1]-ks[0]===1){ if(ck===ks[0]-1&&numK(ks[1])<=8) ban.add(ks[1]+1); if(ck===ks[1]+1&&numK(ks[0])>=2) ban.add(ks[0]-1); } }
    for(let k=0;k<34;k++){ if(!c2[k]||ban.has(k)) continue;
      c2[k]--; const s=shanten(c2,melds+1); let u=0;
      if(s<=s1){ for(let x=0;x<34;x++){ if(c2[x]>=4) continue; c2[x]++; if(shanten(c2,melds+1)<s) u+=Math.max(0,4-P.vis[x]); c2[x]--; } }
      if(s<s1||(s===s1&&u>u1)){ s1=s; u1=u; }
      c2[k]++; }
  }
  if(s1<s0) add(f,'C_adv',1); if(s1>s0) add(f,'C_worse',1);
  if(s1===0) add(f,'C_tp',1);
  add(f,'C_sh',Math.min(s1,4)/4);
  add(f,'C_uke',Math.log1p(u1)/3-Math.log1p(u0)/3);
  const yak=[31,32,33,27+P.seat,27+obs.bakaze];
  const isYakuhaiPon=a.type!=='chi'&&yak.indexOf(ck)>=0;
  if(isYakuhaiPon) add(f,'C_yakuhai',1);
  const yp=yakuPaths(c2,newMelds,P.seat,obs.bakaze);
  const path=isYakuhaiPon||yp.yakuhaiMeld||yp.yakuhaiPair||yp.tanyao||yp.flush||yp.toitoi;
  if(path) add(f,'C_yakupath',1); else add(f,'C_noyaku',1);
  if(yp.yakuhaiPair&&!isYakuhaiPon&&!yp.yakuhaiMeld) add(f,'C_honorpair',1);
  if(yp.tanyao) add(f,'C_tanyao',1); if(yp.flush) add(f,'C_flush',1); if(yp.toitoi) add(f,'C_toitoi',1);
  if(P.mz) add(f,'C_first',1);
  add(f,'C_dora',Math.min(P.dora,4)/4);
  add(f,'C_opp',P.nRiichi);
  add(f,'C_left',P.left/70);
  if(P.seat===0) add(f,'C_oya',1);
  if(s0>=3) add(f,'C_far',1);
  // 鳴くと手牌が減り守りにくくなる
  add(f,'C_danger',P.nRiichi*(s1>=1?1:0));
  return f;
}
function featKan(obs,a){
  const P=prep(obs), f={};
  add(f,a.type==='ankan'?'K_ankan':'K_kakan',1);
  const c=counts(obs.hand), melds=obs.melds[obs.me].length;
  // 槓しない場合の最良（打牌表）と、槓した後の13枚
  const D=discardInfo(obs);
  const c2=c.slice(); const k=kind(a.type==='ankan'?a.consumed[0]:a.pai);
  c2[k]-=a.type==='ankan'?4:1;
  const s2=shanten(c2,melds+1);
  let u2=0; for(let x=0;x<34;x++){ if(c2[x]>=4) continue; c2[x]++; if(shanten(c2,melds+1)<s2) u2+=Math.max(0,4-P.vis[x]); c2[x]--; }
  if(s2>D.smin) add(f,'K_worse',1);
  if(D.umax) add(f,'K_ukeloss',Math.max(0,(D.umax-u2)/D.umax));
  if(obs.riichiSeq[obs.me]>=0) add(f,'K_riichi',1);
  add(f,'K_opp',P.nRiichi);
  if(s2===0) add(f,'K_tp',1);
  return f;
}
function context(obs,f){
  const P=prep(obs);
  if(P.ctx==null){
    const c=counts(obs.hand), m=obs.melds[obs.me].length;
    P.ctx=Math.min(3,Math.max(0,shanten(c,m)-((c.reduce((x,y)=>x+y,0)%3===2)?0:0)));
  }
  add(f,'x_s'+P.ctx,1); add(f,'x_left',P.left/70); add(f,'x_riichi',P.nRiichi); add(f,'x_open',obs.melds[obs.me].length/4);
  if(P.seat===0) add(f,'x_oya',1); add(f,'x_dora',Math.min(P.dora,4)/4); if(obs.allLast) add(f,'x_last',1);
  if(P.rank===0) add(f,'x_rank0',1); if(P.rank===3) add(f,'x_rank3',1);
  return f;
}
function featurize(obs,a){
  const f=featurize0(obs,a); context(obs,f); if(a.type==='none') add(f,'x_none',1); return f;
}
function featurize0(obs,a){
  switch(a.type){
    case 'dahai': return featDahai(obs,a);
    case 'reach': return featReach(obs);
    case 'chi': case 'pon': case 'daiminkan': return featCall(obs,a);
    case 'ankan': case 'kakan': return featKan(obs,a);
    case 'hora': { const f={}; add(f,'H_bias',1); return f; }
    case 'ryukyoku': { const f={}; add(f,'Y_bias',1); let y=0; const c=counts(obs.hand); for(let k=0;k<34;k++) if(isYaochuK(k)&&c[k]) y++; add(f,'Y_yao',y/13); return f; }
    default: return {};
  }
}

/* ---------------- 推論 ---------------- */
let WEIGHTS=null;
// 重み: {lin:Float64Array, H, U:[H][nF], b:[H], v:[H]}
function setWeights(w){ WEIGHTS=w; }
function getWeights(){
  if(WEIGHTS) return WEIGHTS;
  const src=root.MJ_AI_WEIGHTS||{}; const lin=new Float64Array(F.length);
  const L=src.lin||src;
  for(const k in L) if(FI[k]!==undefined&&typeof L[k]==='number') lin[FI[k]]=L[k];
  const W={lin,H:0};
  if(src.mlp){ const m=src.mlp; W.H=m.H; W.b=m.b; W.v=m.v; W.U=[];
    for(let h=0;h<m.H;h++){ const row=new Float64Array(F.length); m.names.forEach((n,j)=>{ if(FI[n]!==undefined) row[FI[n]]=m.U[h][j]; }); W.U.push(row); } }
  return WEIGHTS=W;
}
function scoreF(W,f){
  let z=0; for(const i in f) z+=W.lin[i]*f[i];
  for(let h=0;h<W.H;h++){ let a=W.b[h]; const U=W.U[h]; for(const i in f) a+=U[i]*f[i]; if(a>0) z+=W.v[h]*a; }
  return z;
}
// 同じ牌種の打牌（赤5とそれ以外は別扱い）はまとめる
function actKey(a){ return a.type==='dahai'? 'd:'+a.pai : a.type==='chi'||a.type==='pon'? a.type+':'+a.consumed.slice().sort().join(',') : a.type==='ankan'? 'ankan:'+kind(a.consumed[0]) : a.type==='kakan'? 'kakan:'+kind(a.pai): a.type; }
function evaluate(obs,actions,temp){
  const w=getWeights();
  const logits=actions.map(a=>scoreF(w,featurize(obs,a)));
  const T=temp||1, m=Math.max.apply(null,logits);
  const e=logits.map(z=>Math.exp((z-m)/T)), s=e.reduce((x,y)=>x+y,0);
  const probs=e.map(x=>x/s);
  return actions.map((a,i)=>({action:a,prob:probs[i],logit:logits[i]})).sort((x,y)=>y.prob-x.prob);
}
// 最善手（和了できるときは必ず和了）
function decide(obs,actions){
  const h=actions.find(a=>a.type==='hora'); if(h) return {best:h,list:evaluate(obs,actions)};
  const list=evaluate(obs,actions);
  return {best:list[0].action,list};
}

/* ---------------- 推奨打牌選定理由 ----------------
   推奨手 best と比較対象 other（あなたの手、ヒント時は次点）の評価差を、特徴量のグループごとに分解して
   差を大きく生んだグループから順に、具体的な数字を入れた文にする。 */
const GROUPS=[
  ['shanten',/^d_sh1$|^d_sh2$|^d_sh2_far$/],
  ['uke',/^d_uke|^d_ukerel|^d_ukemax|^d_ukediff/],
  ['shape',/^d_u2|^d_good|^d_imp|^d_conn|^d_chiitoi_mode/],
  ['wait',/^d_wait|^d_waitdead|^d_furiten/],
  ['yaku',/^d_tpyaku|^d_tpnoyaku_open|^d_tphan|^d_tpyakufrac|^d_open_noyaku/],
  ['flush',/^d_flush/],
  ['dora',/^d_dora|^d_red|^d_doranear/],
  ['handyaku',/^d_sanshoku|^d_ittsu|^d_tanyao|^d_yakuhaipair/],
  ['defense',/^r_|^o_|^dz_|^d_push_|^d_safe_count|^d_safekeep|^d_late_safe/],
  ['tiletype',/^d_iso_|^d_guest$|^d_yakuhai$|^d_19$|^d_28$|^d_37$|^d_456$|^d_pairbreak|^d_tribreak|^d_vis_honor|^d_early_honor|^d_honor_yakuhai_early/],
  ['reach',/^R_/],
  ['call',/^C_/],
  ['kan',/^K_/]
];
const GI=new Map(); F.forEach((n,i)=>{ for(const [g,re] of GROUPS) if(re.test(n)){ GI.set(i,g); break; } });
const REL=['自分','下家','対面','上家'];
const tname=t=>MJ.tileName(t);
function catText(cat){
  if(cat===0) return '現物（安全）';
  if(cat<=4){ const v=cat-1; return v>=3?'ほぼ安全な字牌':v===2?'2枚見えの字牌':v===1?'1枚見えの字牌':'生牌の字牌'; }
  const live=(cat-5)%3; return live===0?'スジ・壁で比較的安全':live===1?'片スジ':'無スジで危険';
}
function shTxt(s){ return s<=-1?'和了形':s===0?'テンパイ':s+'向聴'; }
function explain(obs,list,other){
  try{
    const best=list[0].action;
    if(!other){ other=list[1]&&list[1].action; }
    if(best.type==='hora') return ['和了できるため（和了を逃すと点数を得られず、フリテンにもなります）'];
    if(!other) return [];
    const W=getWeights();
    const fb=featurize(obs,best), fo=featurize(obs,other);
    const total=scoreF(W,fb)-scoreF(W,fo);
    // グループごとの寄与（そのグループの特徴量を両方から外したときの差の変化）
    const contrib={};
    for(const [g] of GROUPS){
      const strip=f=>{ const o={}; for(const i in f) if(GI.get(+i)!==g) o[i]=f[i]; return o; };
      const d=total-(scoreF(W,strip(fb))-scoreF(W,strip(fo)));
      if(Math.abs(d)>1e-6) contrib[g]=d;
    }
    const order=Object.entries(contrib).filter(([g,d])=>d>0.15).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
    const P=prep(obs);
    const out=[];
    const isD=a=>a.type==='dahai';
    let D=null, rb=null, ro=null;
    if(isD(best)&&isD(other)){ D=discardInfo(obs); rb=D.rows[kind(best.pai)]; ro=D.rows[kind(other.pai)]; }
    const B=isD(best)?tname(best.pai):'', O=isD(other)?tname(other.pai):'';
    for(const g of order){
      let t=null;
      if(D&&rb&&ro) switch(g){
        case 'shanten': if(rb.s<ro.s) t=`${O}を切ると${shTxt(ro.s)}に戻ってしまう（${B}を切れば${shTxt(rb.s)}を維持できる）ため`; break;
        case 'uke': if(rb.uke>ro.uke) t=`受け入れ枚数が多いため（打${B}：${rb.uke}枚 ／ 打${O}：${ro.uke}枚）`; break;
        case 'shape': t= rb.s===1? `テンパイしたときに良い待ちになりやすいため` : `手が伸びる余地（好形への変化・くっつき）が大きいため`; break;
        case 'wait': if(rb.wait&&ro.wait){ if(ro.wait.furiten&&!rb.wait.furiten) t=`${O}を切るとフリテンの待ちになるため`; else if(rb.wait.rest>ro.wait.rest) t=`待ち牌の残りが多いため（打${B}：残り${rb.wait.rest}枚 ／ 打${O}：残り${ro.wait.rest}枚）`; } break;
        case 'yaku': if(rb.han&&ro.han){ if(rb.han.yaku&&!ro.han.yaku) t=`役のあるテンパイになるため（${O}を切ると役なしで和了できない待ちが残る）`; else if(rb.han.han>ro.han.han+0.4) t=`和了したときの打点が高いため（推定 約${rb.han.han.toFixed(1)}翻 ／ 約${ro.han.han.toFixed(1)}翻）`; else if((rb.han.frac||0)>(ro.han.frac||0)) t=`どの待ちで和了しても役が付きやすいため`; }
          else if(!P.mz) t=`鳴いた手で役を残すため（${O}を切ると役がなくなる）`; break;
        case 'flush': t=`ホンイツ（染め手）を目指した方が打点が高いため`; break;
        case 'dora': t= MJ.isRed(other.pai)? `赤ドラ（${O}）を残して打点を確保するため` : `ドラ（${obs.dora.map(d=>tname(MJ.kname(doraOf(d)))).join('・')}）を活かして打点を確保するため`; break;
        case 'handyaku': { const fbN=n=>fb[FI[n]]||0, foN=n=>fo[FI[n]]||0;
          if(foN('d_sanshoku')>fbN('d_sanshoku')) t=`三色同順の可能性を残すため`;
          else if(foN('d_ittsu')>fbN('d_ittsu')) t=`一気通貫の可能性を残すため`;
          else if(foN('d_yakuhaipair')>0) t=`役牌（${O}）の対子を残して役を確保するため`;
          else t=`タンヤオを目指すため（幺九牌から整理する）`; break; }
        case 'defense': {
          const parts=[];
          for(let o=0;o<4;o++){ if(o===obs.me) continue;
            const thr=P.riichi[o]? 'リーチ' : P.openT[o]? obs.melds[o].length+'副露' : null; if(!thr) continue;
            const cb=dangerCat(kind(best.pai),P.safe[o],P.vis), co=dangerCat(kind(other.pai),P.safe[o],P.vis);
            if(PRIOR[cb]<PRIOR[co]) parts.push(`${REL[(o-obs.me+4)%4]}（${thr}）`);
            if(parts.length===1&&!t) t=`${REL[(o-obs.me+4)%4]}（${thr}）に振り込まないようにするため（${B}は${catText(cb)}、${O}は${catText(co)}）`;
          }
          if(parts.length>1) t=`${parts.join('・')}に振り込まないようにするため`;
          if(!t){ const nb=fb[FI.d_push_makesafe]||0, no=fo[FI.d_push_makesafe]||0;
            if(nb>no) t=`${B}が通れば、ほかの手牌も安全になるため（将来通す危険牌が減る）`;
            else t=`あとで守れるように、安全な牌を手に残しておくため`; }
          break; }
        case 'tiletype': {
          const kb=kind(best.pai), ko=kind(other.pai);
          const yak=[31,32,33,27+P.seat,27+obs.bakaze];
          if(ko>=27&&yak.indexOf(ko)>=0&&D.c[ko]===1) t=`役牌（${O}）は重なれば役になるので、先に${B}を切るため`;
          else if(kb>=27) t=`孤立した字牌（${B}）から整理するため（数牌の方がほかの牌とつながりやすい）`;
          else if(MJ.isTermK(kb)) t=`使いにくい端牌（${B}）から整理するため`;
          else if(D.c[ko]>=2) t=`対子（${O}）を残して雀頭・ポンの候補にするため`;
          else t=`${B}の方が手の中で役に立ちにくいため`;
          break; }
      }
      else if(g==='reach'){
        if(best.type==='reach'){ D=discardInfo(obs); let w=null; for(const k in D.rows){ const r=D.rows[k]; if(r.s===0&&r.wait&&(!w||r.wait.rest>w.wait.rest)) w=r; }
          t= w&&!w.han.yaku? `ダマでは役がなく和了できないため、リーチして役を作る` : w&&w.wait.rest>=5? `待ちが十分にあり（残り${w.wait.rest}枚）、リーチで打点が上がるため` : `リーチで打点を上げる価値が高いため`; }
        else if(other.type==='reach'){ D=discardInfo(obs); const r=D.rows[kind(best.pai)];
          t= P.nRiichi? `相手のリーチを受けているので、リーチで手を固定せず守れる形を残すため` : r&&r.han&&r.han.yaku&&r.han.han>=3.5? `ダマでも役があり打点も十分なため（リーチ不要）` : r&&r.wait&&r.wait.rest<=3? `待ちが少なく（残り${r.wait.rest}枚）、リーチしても和了しにくいため` : `今はリーチせず、手変わりや守りの余地を残すため`; }
      }
      else if(g==='call'){
        const call=['chi','pon','daiminkan'].indexOf(best.type)>=0? best : ['chi','pon','daiminkan'].indexOf(other.type)>=0? other : null;
        if(call){ const f=featurize(obs,call), has=n=>(f[FI[n]]||0)>0;
          if(call===best){ t= has('C_tp')? `鳴くとテンパイになるため` : has('C_yakuhai')? `役牌を鳴いて役を確定し、和了に近づくため` : has('C_adv')? `鳴くと向聴数が進み、和了に近づくため` : `鳴いた方が和了しやすいため`; }
          else { t= has('C_noyaku')? `鳴くと役がなくなり和了できなくなるため` : has('C_worse')||!has('C_adv')? `鳴いても手が進まないため` : P.nRiichi? `リーチを受けているので、鳴いて手牌を減らすと守りにくくなるため` : has('C_first')? `門前のまま（リーチなどで）打点を作った方がよいため` : `鳴くより門前の方が価値が高いため`; }
        }
      }
      else if(g==='kan'){ t= best.type==='ankan'||best.type==='kakan'? `受け入れを減らさずに槓でき、ドラも増えるため` : `槓すると受け入れが減る（または危険が増える）ため`; }
      if(t&&out.indexOf(t)<0) out.push(t);
      if(out.length>=3) break;
    }
    if(!out.length) out.push('牌効率・打点・安全度を総合した評価が最も高いため');
    return out;
  }catch(e){ return []; }
}

const AI={F,FI,featurize,evaluate,decide,setWeights,getWeights,actKey,visibleCounts,safeSet,dangerCat,prep,waitKinds,PRIOR,explain};
root.MJAI=AI;
if(typeof module!=='undefined'&&module.exports) module.exports=AI;
})(typeof window!=='undefined'?window:globalThis);
