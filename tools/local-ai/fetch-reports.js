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
// 牌譜データ.json / 牌譜データv2.txt / 牌譜データv3.txt … のように「牌譜データ」で始まるファイルをすべて読む
const tenhou=new Set();
for(const f of fs.readdirSync(root).filter(f=>/^牌譜データ.*\.(json|txt)$/.test(f))){
  const s=fs.readFileSync(path.join(root,f),'utf8'); add(s);
  (s.match(/https?:\/\/tenhou\.net\/\d+\/\?log=[\w-]+[^\s"]*/g)||[]).forEach(u=>tenhou.add(u)); }
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
  // Mortal の解析URLではなく天鳳の牌譜URLだけが書かれたものは、Mortal にかけるまで学習に使えない
  const json=fs.existsSync(path.join(root,'牌譜データ.json'))? fs.readFileSync(path.join(root,'牌譜データ.json'),'utf8') : '';
  const pending=[...tenhou].filter(u=>{ const m=u.match(/log=([\w-]+)/); return m&&json.indexOf(m[1])<0; });
  if(pending.length) console.log(`天鳳の牌譜URL（Mortal 未解析）: ${pending.length}件。Mortal にかけて結果URLを牌譜データに追加すると学習に使えます。`);
  // 天鳳の牌譜そのもの（tenhou.net/6 形式の JSON）を取得しておく（復習半荘で同じ手牌・同じ進行を再現するため）
  const tdir=path.join(out,'..','tenhou'); fs.mkdirSync(tdir,{recursive:true});
  let tn=0, tf=0;
  for(const u of tenhou){
    const m=u.match(/log=([\w-]+)/), tw=u.match(/[?&]tw=(\d)/); if(!m) continue;
    const f=path.join(tdir,m[1]+'.json'); if(fs.existsSync(f)) continue;
    try{ const b=await get('https://tenhou.net/5/mjlog2json.cgi?'+m[1]); const j=JSON.parse(b.toString('utf8'));
      if(!j.log) throw new Error('no log'); fs.writeFileSync(f,JSON.stringify({id:m[1],tw:tw?+tw[1]:0,url:u,file:'',data:j})); tn++; }
    catch(e){ tf++; console.error('× 天鳳',m[1],e.message); }
  }
  console.log(`天鳳の牌譜: 新規取得 ${tn} / 失敗 ${tf}`);
})();
