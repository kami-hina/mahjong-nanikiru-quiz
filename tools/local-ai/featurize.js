/* 特徴量の計算（並列）とバイナリ保存
   node featurize.js <reportディレクトリ> <出力ディレクトリ> [--perms 0,1,2]
   perm: 萬子・筒子・索子の入れ替え（0 はそのまま）。牌の色を入れ替えても判断の正しさは変わらないので、データを増やせる。
   出力: <out>/feat-p<perm>.bin と .json（行ごとのメタ情報） */
const {Worker,isMainThread,parentPort,workerData}=require('worker_threads');
const fs=require('fs'), path=require('path');
const PERMS=[['m','p','s'],['p','s','m'],['s','m','p'],['m','s','p'],['p','m','s'],['s','p','m']];
function permTile(t,P){ if(!t||t[1]==='z') return t; return t[0]+P['mps'.indexOf(t[1])]; }
function permObs(o,P){
  const pt=t=>permTile(t,P);
  return Object.assign({},o,{
    dora:o.dora.map(pt), hand:o.hand.map(pt), drawn:o.drawn?pt(o.drawn):o.drawn,
    melds:o.melds.map(ms=>ms.map(m=>Object.assign({},m,{tiles:m.tiles.map(pt),pai:m.pai?pt(m.pai):m.pai}))),
    rivers:o.rivers.map(r=>r.map(d=>Object.assign({},d,{pai:pt(d.pai)}))),
    last:o.last?Object.assign({},o.last,{pai:pt(o.last.pai)}):o.last });
}
function permAct(a,P){ const o=Object.assign({},a); if(o.pai) o.pai=permTile(o.pai,P); if(o.consumed) o.consumed=o.consumed.map(t=>permTile(t,P)); return o; }
function kindOf(s){
  const ts=new Set(s.acts.map(x=>x.action.type));
  if(ts.has('hora')) return 'hora';
  if(ts.has('reach')) return 'riichi';
  if(ts.has('chi')||ts.has('pon')||ts.has('daiminkan')) return 'call';
  if(ts.has('ankan')||ts.has('kakan')) return 'kan';
  if(ts.has('dahai')) return s.obs.riichiSeq.some((x,p)=>p!==s.obs.me&&x>=0)? 'dahai-vsRiichi':'dahai';
  return 'other';
}
if(isMainThread){
  const dir=process.argv[2], out=process.argv[3];
  const pi=process.argv.indexOf('--perms');
  const perms=pi>0? process.argv[pi+1].split(',').map(Number) : [0];
  fs.mkdirSync(out,{recursive:true});
  const {loadDataset}=require('./dataset.js');
  const data=loadDataset(dir);
  const NW=Math.max(1,require('os').cpus().length-1);
  (async()=>{
    for(const p of perms){
      const t0=Date.now();
      const chunks=[]; for(let w=0;w<NW;w++) chunks.push([]);
      data.forEach((s,i)=>chunks[i%NW].push(i));
      const results=await Promise.all(chunks.map((idx,w)=>new Promise((res,rej)=>{
        const wk=new Worker(__filename,{workerData:{items:idx.map(i=>data[i]),perm:p}});
        wk.on('message',res); wk.on('error',rej);
      })));
      // 元の順序に戻す
      const rows=new Array(data.length);
      chunks.forEach((idx,w)=>idx.forEach((i,j)=>{ rows[i]=results[w][j]; }));
      // バイナリ化
      let nnz=0, nact=0; for(const r of rows){ nact+=r.n; nnz+=r.idx.length; }
      const IDX=new Uint16Array(nnz), VAL=new Float32Array(nnz), OFF=new Uint32Array(nact+1), PS=new Float32Array(nact);
      const meta=[]; let a=0, z=0;
      for(const r of rows){
        meta.push({file:r.file,kind:r.kind,n:r.n,a0:a,keys:r.keys,exp:r.exp,act:r.act});
        for(let j=0;j<r.n;j++){ OFF[a]=z; PS[a]=r.ps[j]; for(let q=r.off[j];q<r.off[j+1];q++){ IDX[z]=r.idx[q]; VAL[z]=r.val[q]; z++; } a++; }
      }
      OFF[a]=z;
      const buf=Buffer.concat([Buffer.from(new Uint32Array([nact,nnz]).buffer),Buffer.from(OFF.buffer),Buffer.from(PS.buffer),Buffer.from(IDX.buffer),Buffer.from(VAL.buffer)]);
      fs.writeFileSync(path.join(out,'feat-p'+p+'.bin'),buf);
      fs.writeFileSync(path.join(out,'feat-p'+p+'.json'),JSON.stringify(meta));
      console.error('perm',p,'rows',rows.length,'actions',nact,'nnz',nnz,((Date.now()-t0)/1000).toFixed(0)+'s');
    }
  })();
} else {
  const MJ=require('../../local/mj-core.js'); global.MJ=MJ;
  const AI=require('../../local/mj-ai.js');
  const P=PERMS[workerData.perm];
  const out=workerData.items.map(s0=>{
    const s=workerData.perm? Object.assign({},s0,{obs:permObs(s0.obs,P),acts:s0.acts.map(x=>Object.assign({},x,{action:permAct(x.action,P)})),expected:permAct(s0.expected,P),actual:permAct(s0.actual,P)}) : s0;
    const acts=s.acts.map(x=>x.action);
    const idx=[], val=[], off=[0];
    for(const a of acts){ const f=AI.featurize(s.obs,a); for(const k in f){ idx.push(+k); val.push(f[k]); } off.push(idx.length); }
    let ps=s.acts.map(x=>x.prob); const z=ps.reduce((a,b)=>a+b,0); ps=ps.map(p=>p/z);
    return {file:s.file,kind:kindOf(s),n:acts.length,idx,val,off,ps,keys:acts.map(AI.actKey),exp:AI.actKey(s.expected),act:AI.actKey(s.actual)};
  });
  parentPort.postMessage(out);
}
