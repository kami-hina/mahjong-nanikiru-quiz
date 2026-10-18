/* 何切るクイズ ⇔ 磯部さんへの質問用アプリ の共通処理（Firestore REST・SDK不使用）
   データ：rooms/{合言葉}/threads/{tid}            … 質問1件（牌譜の図・局面情報・最終更新）
          rooms/{合言葉}/threads/{tid}/msgs/{mid} … やり取りの1通（from: hina / isobe）
   合言葉（24〜64文字）を知っている人だけが読み書きできる（Firestore のセキュリティルールで制御）。
   合言葉はリポジトリには置かず、URL の # で各端末に渡す。 */
const FB={
  key:'AIzaSyBwznKFKtNumGPNBdbV9it75fiX7kGdgAE',
  base:'https://firestore.googleapis.com/v1/projects/mahjong-isobe-qa/databases/(default)/documents'
};
const fsVal=v=>typeof v==='number'? {integerValue:String(Math.round(v))} : {stringValue:String(v==null?'':v)};
function fsObj(doc){
  const o={id:doc.name.split('/').pop()};
  for(const [k,v] of Object.entries(doc.fields||{})) o[k]=v.integerValue!=null? +v.integerValue : v.stringValue;
  return o;
}
// mask を渡すとその項目だけ更新（渡さないと文書ごと置き換え）
async function fsPatch(path,obj,mask){
  const f={}; for(const k in obj) f[k]=fsVal(obj[k]);
  const qs=(mask||[]).map(m=>'updateMask.fieldPaths='+m+'&').join('');
  const r=await fetch(`${FB.base}/${path}?${qs}key=${FB.key}`,
    {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:f})});
  if(!r.ok) throw new Error('送信に失敗しました（'+r.status+'）');
}
async function fsGet(path){
  const r=await fetch(`${FB.base}/${path}?key=${FB.key}`);
  if(!r.ok) throw new Error('読み込みに失敗しました（'+r.status+'）');
  return fsObj(await r.json());
}
// fields を渡すとその項目だけ取得（牌譜の図などの大きい項目を省ける）
async function fsList(path,fields){
  let out=[], tok='';
  do{
    const qs=(fields||[]).map(m=>'mask.fieldPaths='+m+'&').join('');
    const r=await fetch(`${FB.base}/${path}?${qs}pageSize=300${tok?'&pageToken='+encodeURIComponent(tok):''}&key=${FB.key}`);
    if(!r.ok) throw new Error('読み込みに失敗しました（'+r.status+'）');
    const j=await r.json();
    out=out.concat((j.documents||[]).map(fsObj));
    tok=j.nextPageToken||'';
  }while(tok);
  return out;
}
const newId=at=>(at||Date.now()).toString(36)+'-'+Math.random().toString(36).slice(2,8);
