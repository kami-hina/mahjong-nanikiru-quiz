/* 牌譜データ（牌譜データ.json / 牌譜データv2.txt）に書かれた Mortal のレポートをまとめてダウンロードする
   node fetch-reports.js <保存先ディレクトリ>
   ・すでに保存済みのものは取り直さない
   ・mjai.ekyu.moe/report/<id>.json を取得する（学習に必要なのはこのJSONだけ） */
const fs=require('fs'), path=require('path'), https=require('https');
const root=path.join(__dirname,'..','..');
const out=process.argv[2]; if(!out){ console.error('usage: node fetch-reports.js <dir>'); process.exit(1); }
fs.mkdirSync(out,{recursive:true});
const ids=new Set();
const add=s=>{ const re=/report\/([0-9a-f]{6,})\.json/g; let m; while((m=re.exec(s))) ids.add(m[1]); };
for(const f of ['牌譜データ.json','牌譜データv2.txt']){ const p=path.join(root,f); if(fs.existsSync(p)) add(fs.readFileSync(p,'utf8')); }
const get=url=>new Promise((res,rej)=>{ https.get(url,r=>{ if(r.statusCode!==200){ r.resume(); return rej(new Error('HTTP '+r.statusCode)); }
  const ch=[]; r.on('data',c=>ch.push(c)); r.on('end',()=>res(Buffer.concat(ch))); }).on('error',rej); });
(async()=>{
  let n=0, skip=0, fail=0;
  for(const id of ids){
    const f=path.join(out,id+'.json');
    if(fs.existsSync(f)&&fs.statSync(f).size>1000){ skip++; continue; }
    try{ const b=await get('https://mjai.ekyu.moe/report/'+id+'.json'); JSON.parse(b.toString('utf8')); fs.writeFileSync(f,b); n++; }
    catch(e){ fail++; console.error('×',id,e.message); }
  }
  console.log(`レポート ${ids.size}件: 新規 ${n} / 取得済み ${skip} / 失敗 ${fail}`);
})();
