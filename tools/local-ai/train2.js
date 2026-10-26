/* Mortal代役AIの学習（featurize.js が作ったバイナリの特徴量を使う）
   node train2.js <特徴量ディレクトリ> [--perms 0,1,2] [--all] [--write] [--H 32] [--epochs 20]
   ・半荘単位で 学習用/テスト用（5半荘に1つ）に分け、テスト用の半荘（色の入れ替えなし）で Mortal との一致率を測る
   ・--all: テスト用も含めた全データで学習（最終版）。--write: local/ai-weights.js に書き出す */
const fs=require('fs'), path=require('path');
const AI=(()=>{ const MJ=require('../../local/mj-core.js'); global.MJ=MJ; return require('../../local/mj-ai.js'); })();
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i>0? process.argv[i+1] : d; };
const dir=process.argv[2];
const perms=arg('perms','0').split(',').map(Number);
const ALL=process.argv.includes('--all'), WRITE=process.argv.includes('--write');
const H=+arg('H',32), EPOCHS=+arg('epochs',20), LR=+arg('lr',0.004), L2=+arg('l2',3e-5), B=+arg('batch',256);
const nF=AI.F.length;
function load(p){
  const buf=fs.readFileSync(path.join(dir,'feat-p'+p+'.bin'));
  const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  const [nact,nnz]=new Uint32Array(ab,0,2);
  let o=8; const OFF=new Uint32Array(ab,o,nact+1); o+=(nact+1)*4;
  const PS=new Float32Array(ab,o,nact); o+=nact*4;
  const IDX=new Uint16Array(ab,o,nnz); o+=nnz*2; if(o%4) o+=4-o%4;
  // Uint16 の後ろは4バイト境界とは限らないので、コピーして読む
  const VAL=new Float32Array(buf.buffer.slice(buf.byteOffset+8+(nact+1)*4+nact*4+nnz*2, buf.byteOffset+8+(nact+1)*4+nact*4+nnz*2+nnz*4));
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'feat-p'+p+'.json'),'utf8'));
  return {OFF,PS,IDX:new Uint16Array(buf.buffer.slice(buf.byteOffset+8+(nact+1)*4+nact*4,buf.byteOffset+8+(nact+1)*4+nact*4+nnz*2)),VAL,meta,p};
}
const sets=perms.map(load);
const files=[...new Set(sets[0].meta.map(r=>r.file))].sort();
const testFiles=new Set(files.filter((f,i)=>i%5===2));
// 行 = {set, meta}
const trainRows=[], testRows=[];
for(const S of sets) S.meta.forEach(m=>{
  if(m.n<=1) return;
  const r={S,m};
  if(testFiles.has(m.file)){ if(S.p===0) testRows.push(r); if(ALL) trainRows.push(r); }
  else trainRows.push(r);
});
console.log('features',nF,'train rows',trainRows.length,'test rows',testRows.length,'perms',perms.join(','),'H',H);
function rng(seed){ let x=seed>>>0||1; return ()=>{ x^=x<<13; x>>>=0; x^=x>>>17; x^=x<<5; x>>>=0; return x/4294967296; }; }
const rnd=rng(20261026);
const P={lin:new Float64Array(nF),U:Array.from({length:H},()=>{ const u=new Float64Array(nF); for(let i=0;i<nF;i++) u[i]=(rnd()-0.5)*0.2; return u; }),b:new Float64Array(H).fill(0.05),v:Float64Array.from({length:H},()=>(rnd()-0.5)*0.2)};
const mk=()=>({lin:new Float64Array(nF),U:Array.from({length:H},()=>new Float64Array(nF)),b:new Float64Array(H),v:new Float64Array(H)});
function forward(S,a,act){ // act: Float64Array(H) に隠れ層の値を書く
  let z=0; const o0=S.OFF[a], o1=S.OFF[a+1];
  for(let q=o0;q<o1;q++) z+=P.lin[S.IDX[q]]*S.VAL[q];
  for(let h=0;h<H;h++){ let s=P.b[h]; const U=P.U[h]; for(let q=o0;q<o1;q++) s+=U[S.IDX[q]]*S.VAL[q]; act[h]=s; if(s>0) z+=P.v[h]*s; }
  return z;
}
function train(){
  const M=mk(), V=mk(); let t=0;
  const idx=trainRows.map((r,i)=>i);
  const acts=Array.from({length:64},()=>new Float64Array(H));
  for(let ep=1;ep<=EPOCHS;ep++){
    for(let i=idx.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; const x=idx[i]; idx[i]=idx[j]; idx[j]=x; }
    let loss=0;
    const lr=LR*(ep>EPOCHS*0.7? 0.3:1);
    for(let s0=0;s0<idx.length;s0+=B){
      const G=mk(); const bs=Math.min(B,idx.length-s0);
      for(let qq=s0;qq<s0+bs;qq++){
        const {S,m}=trainRows[idx[qq]];
        const n=m.n, z=new Float64Array(n);
        for(let j=0;j<n;j++) z[j]=forward(S,m.a0+j,acts[j]);
        let mx=-1e9; for(let j=0;j<n;j++) if(z[j]>mx) mx=z[j];
        let Z=0; for(let j=0;j<n;j++){ z[j]=Math.exp(z[j]-mx); Z+=z[j]; }
        for(let j=0;j<n;j++){
          const a=m.a0+j, p=z[j]/Z, y=S.PS[a], d=(p-y)/bs;
          if(y>0) loss-=y*Math.log(Math.max(p,1e-12));
          if(Math.abs(d)<1e-10) continue;
          const o0=S.OFF[a], o1=S.OFF[a+1], hv=acts[j];
          for(let q=o0;q<o1;q++) G.lin[S.IDX[q]]+=d*S.VAL[q];
          for(let h=0;h<H;h++){ if(hv[h]<=0) continue; G.v[h]+=d*hv[h]; const dv=d*P.v[h]; G.b[h]+=dv; const GU=G.U[h]; for(let q=o0;q<o1;q++) GU[S.IDX[q]]+=dv*S.VAL[q]; }
        }
      }
      t++;
      const upd=(w,g,mm,vv,reg)=>{ const c1=1-Math.pow(0.9,t), c2=1-Math.pow(0.999,t);
        for(let i=0;i<w.length;i++){ const gi=g[i]+reg*w[i]; if(gi===0&&mm[i]===0) continue; mm[i]=0.9*mm[i]+0.1*gi; vv[i]=0.999*vv[i]+0.001*gi*gi; w[i]-=lr*(mm[i]/c1)/(Math.sqrt(vv[i]/c2)+1e-8); } };
      upd(P.lin,G.lin,M.lin,V.lin,L2); upd(P.b,G.b,M.b,V.b,0); upd(P.v,G.v,M.v,V.v,L2);
      for(let h=0;h<H;h++) upd(P.U[h],G.U[h],M.U[h],V.U[h],L2);
    }
    console.error('epoch',ep,'loss',(loss/idx.length).toFixed(4));
    if(testRows.length&&(ep%5===0||ep===EPOCHS)) evaluate(testRows,'テスト epoch '+ep);
  }
}
let LAST=null;
function evaluate(rows,label){
  const by={}, conf={}; const act=new Float64Array(H);
  for(const {S,m} of rows){
    const n=m.n; let bi=0, bz=-1e18; const ps=[];
    for(let j=0;j<n;j++){ const z=forward(S,m.a0+j,act); if(z>bz){ bz=z; bi=j; } ps.push(S.PS[m.a0+j]); }
    const hi=m.keys.indexOf('hora'); if(hi>=0) bi=hi;
    const mine=m.keys[bi];
    const o=by[m.kind]=by[m.kind]||{n:0,top1:0,human:0,top2:0,mass:0};
    o.n++; if(mine===m.exp) o.top1++; if(m.act===m.exp) o.human++;
    const order=ps.map((p,j)=>j).sort((a,b)=>ps[b]-ps[a]);
    if(order.slice(0,2).indexOf(bi)>=0) o.top2++;
    o.mass+=ps[bi];
    const top=ps[order[0]], bk=top>=0.9?'>=90':top>=0.7?'70-90':top>=0.5?'50-70':'<50';
    const cb=conf[bk]=conf[bk]||{n:0,ok:0}; cb.n++; if(mine===m.exp) cb.ok++;
  }
  let N=0,T=0,Hh=0,Ms=0;
  console.log(`\n== ${label} ==`);
  for(const k of Object.keys(by).sort()){ const o=by[k]; N+=o.n; T+=o.top1; Hh+=o.human; Ms+=o.mass;
    console.log(k.padEnd(16),String(o.n).padStart(6),'一致'+(100*o.top1/o.n).toFixed(1)+'%','上位2手'+(100*o.top2/o.n).toFixed(1)+'%','人間'+(100*o.human/o.n).toFixed(1)+'%'); }
  console.log('確信度別: '+Object.entries(conf).map(([k,v])=>k+'% '+v.n+'件 一致'+(100*v.ok/v.n).toFixed(0)+'%').join(' / '));
  console.log('合計'.padEnd(16),String(N).padStart(6),'一致'+(100*T/N).toFixed(1)+'%','人間'+(100*Hh/N).toFixed(1)+'%');
  LAST={agree:T/N,n:N,by};
  return T/N;
}
train();
if(WRITE){
  const lin={}; AI.F.forEach((n,i)=>{ lin[n]=+P.lin[i].toFixed(4); });
  const meta={games:files.length,decisions:sets[0].meta.length,testAgree:LAST?(LAST.agree*100).toFixed(1)+'%':'-',
    testDahai:LAST&&LAST.by.dahai?(100*LAST.by.dahai.top1/LAST.by.dahai.n).toFixed(1)+'%':'-',
    testCall:LAST&&LAST.by.call?(100*LAST.by.call.top1/LAST.by.call.n).toFixed(1)+'%':'-',
    note:ALL?'全データで学習（一致率は全データ学習前のテスト値）':'テスト用の半荘を除いて学習',
    trainedAt:new Date().toISOString().slice(0,10),H,perms:perms.length};
  if(process.env.TEST_AGREE) meta.testAgree=process.env.TEST_AGREE;
  const out={meta,lin,mlp:{H,names:AI.F,U:P.U.map(u=>Array.from(u,x=>+x.toFixed(4))),b:Array.from(P.b,x=>+x.toFixed(4)),v:Array.from(P.v,x=>+x.toFixed(4))}};
  const js='/* Mortal代役AIの学習済み重み（tools/local-ai/train2.js が自動生成。手で編集しない）\n   学習データ: Mortal のレビュー '+meta.games+'半荘 / '+meta.decisions+'判断 */\n'
    +'(function(root){ root.MJ_AI_WEIGHTS='+JSON.stringify(out)+';\n'
    +'if(typeof module!=="undefined"&&module.exports) module.exports=root.MJ_AI_WEIGHTS; })(typeof window!=="undefined"?window:globalThis);\n';
  fs.writeFileSync(path.join(__dirname,'../../local/ai-weights.js'),js);
  console.log('wrote local/ai-weights.js',JSON.stringify(meta));
}
