// @module data/dropbox
// @provides DB_CONFIG_KEY, DB_PENDING_KEY, DB_SESSION_KEY, _dbAsciiJSON, _dbB64, _dbBusy, _dbCallback,
//    _dbConfig, _dbRun, _dbSaveConfig, _dbSession, _dbStatus, dropboxConnect, dropboxDisconnect,
//    dropboxList, dropboxLoad, dropboxRequest, dropboxSave
// @uses applyProject, autosaveNow, buildProject, buildSaveFile
// @depends -
// Public browser client: OAuth code + PKCE, short-lived token in sessionStorage only.
// References: https://developers.dropbox.com/oauth-guide
// https://www.dropbox.com/developers/documentation/http/documentation
const DB_CONFIG_KEY='mics009.dropbox.config', DB_SESSION_KEY='mics009.dropbox.session', DB_PENDING_KEY='mics009.dropbox.pkce';
let _dbBusy=false;
function _dbConfig(){try{return JSON.parse(localStorage.getItem(DB_CONFIG_KEY)||'{}');}catch(_){return {};}}
function _dbSession(){try{const s=JSON.parse(sessionStorage.getItem(DB_SESSION_KEY)||'null');return s&&s.expires>Date.now()?s:null;}catch(_){return null;}}
function _dbStatus(s){document.getElementById('dbStatus').textContent=s;}
function _dbB64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function _dbAsciiJSON(obj){return JSON.stringify(obj).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
function _dbSaveConfig(){
  const appKey=document.getElementById('dbAppKey').value.trim(),folder=document.getElementById('dbFolder').value.trim().replace(/\/+$/,'');
  if(folder&&(!folder.startsWith('/')||folder.split('/').some(x=>x==='.'||x==='..')))throw new Error('共有フォルダは /から始まるパスで指定してください');
  localStorage.setItem(DB_CONFIG_KEY,JSON.stringify({appKey,folder}));return {appKey,folder};
}
async function dropboxConnect(){
  const {appKey}=_dbSaveConfig();if(!appKey)throw new Error('DropboxのApp keyを設定してください');
  const verifier=_dbB64(crypto.getRandomValues(new Uint8Array(48))),state=_dbB64(crypto.getRandomValues(new Uint8Array(24)));
  const redirect=location.origin+location.pathname;
  const challenge=_dbB64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  sessionStorage.setItem(DB_PENDING_KEY,JSON.stringify({verifier,state,redirect,appKey,time:Date.now()}));
  await autosaveNow(true);
  const u=new URL('https://www.dropbox.com/oauth2/authorize');u.search=new URLSearchParams({client_id:appKey,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state,redirect_uri:redirect,token_access_type:'online',scope:'files.metadata.read files.content.read files.content.write'});
  location.assign(u.href);
}
async function _dbCallback(){
  const q=new URLSearchParams(location.search);if(!q.has('code')&&!q.has('error'))return;
  let pending;try{pending=JSON.parse(sessionStorage.getItem(DB_PENDING_KEY)||'null');}catch(_){}
  if(!pending)return;sessionStorage.removeItem(DB_PENDING_KEY);
  try{
    if(q.get('state')!==pending.state||Date.now()-pending.time>10*60*1000)throw new Error('認証要求が一致しないか期限切れです。再接続してください');
    if(q.has('error'))throw new Error('接続がキャンセルされました');
    const res=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',body:new URLSearchParams({code:q.get('code'),grant_type:'authorization_code',client_id:pending.appKey,code_verifier:pending.verifier,redirect_uri:pending.redirect})});
    if(!res.ok)throw new Error('認証できませんでした（'+res.status+'）');const s=await res.json();if(!s.access_token||!s.expires_in)throw new Error('認証応答が不正です');
    sessionStorage.setItem(DB_SESSION_KEY,JSON.stringify({token:s.access_token,expires:Date.now()+s.expires_in*1000-30000}));_dbStatus('接続しました。共有フォルダを確認してください');
  }catch(e){_dbStatus(e.message);}
  finally{const u=new URL(location.href);['code','state','error','error_description'].forEach(k=>u.searchParams.delete(k));history.replaceState(null,'',u.pathname+u.search+u.hash);}
}
async function dropboxRequest(endpoint,args,body){
  const s=_dbSession();if(!s)throw new Error('Dropboxへ接続してください（認証には有効期限があります）');
  const content=endpoint==='files/upload'||endpoint==='files/download';
  const headers={Authorization:'Bearer '+s.token};let payload;
  if(content){headers['Dropbox-API-Arg']=_dbAsciiJSON(args);if(body){headers['Content-Type']='application/octet-stream';payload=body;}}
  else{headers['Content-Type']='application/json';payload=JSON.stringify(args);}
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60000);
  try{
    const res=await fetch('https://'+(content?'content':'api')+'.dropboxapi.com/2/'+endpoint,{method:'POST',headers,body:payload,signal:abort.signal});
    if(res.status===401){sessionStorage.removeItem(DB_SESSION_KEY);throw new Error('認証期限切れです。再接続してください');}
    if(res.status===409)throw new Error(endpoint==='files/upload'?'同じ名前が存在するか保存先を利用できません。別名で保存してください':'ファイル／フォルダへアクセスできません。共有への参加とパスを確認してください');
    if(!res.ok)throw new Error('Dropbox通信エラー（'+res.status+'）');
    return endpoint==='files/download'?res.text():res.json();
  }finally{clearTimeout(timer);}
}
async function dropboxList(){
  const {folder}=_dbSaveConfig(), entries=[];let page=await dropboxRequest('files/list_folder',{path:folder||'',recursive:false,limit:200});
  entries.push(...page.entries);while(page.has_more){page=await dropboxRequest('files/list_folder/continue',{cursor:page.cursor});entries.push(...page.entries);if(entries.length>10000)throw new Error('フォルダ内の項目が多すぎます。専用フォルダを選んでください');}
  const list=document.getElementById('dbFiles');list.replaceChildren();
  for(const f of entries.filter(f=>f['.tag']==='file'&&/\.mics$/i.test(f.name)).sort((a,b)=>b.server_modified.localeCompare(a.server_modified))){
    const row=document.createElement('div'),b=document.createElement('button');b.textContent=f.name+' · '+new Date(f.server_modified).toLocaleString();b.addEventListener('click',()=>_dbRun(()=>dropboxLoad(f)));row.appendChild(b);list.appendChild(row);
  }
  _dbStatus('ステージ '+list.children.length+'件');return entries;
}
async function dropboxSave(){
  const {folder}=_dbSaveConfig();let name=document.getElementById('dbFilename').value.trim();if(!name)name=buildSaveFile('stage').name;
  if(/[\/\\\x00-\x1f]/.test(name)||name==='.'||name==='..')throw new Error('ファイル名に / や制御文字は使えません');if(!/\.mics$/i.test(name))name+='.mics';
  const blob=new Blob([JSON.stringify(buildProject())],{type:'application/json'});if(blob.size>100*1024*1024)throw new Error('ステージは100MB以内にしてください');
  const result=await dropboxRequest('files/upload',{path:(folder||'')+'/'+name,mode:'add',autorename:false,strict_conflict:true,mute:false},blob);
  _dbStatus('保存しました：'+result.name);return result;
}
async function dropboxLoad(file){
  if(file.size>100*1024*1024)throw new Error('ステージは100MB以内にしてください');
  const raw=await dropboxRequest('files/download',{path:file.id});const obj=JSON.parse(raw);
  if(!obj||obj.kind||![2,3].includes(obj.version)||!(Array.isArray(obj.sets)||Array.isArray(obj.tracks)))throw new Error('有効なSTAGEファイルではありません');
  if(!confirm('編集中のステージを「'+file.name+'」に置き換えます。先に必要なデータを保存してください。'))return;
  // applyProjectは全音声の復号成功後にのみ現在のステージを変更する。
  await applyProject(obj);await autosaveNow(true);_dbStatus('読み込みました：'+file.name);
}
function dropboxDisconnect(){sessionStorage.removeItem(DB_SESSION_KEY);sessionStorage.removeItem(DB_PENDING_KEY);document.getElementById('dbFiles').replaceChildren();_dbStatus('この端末の接続を解除しました');}
async function _dbRun(fn){
  if(_dbBusy)return;_dbBusy=true;document.querySelectorAll('#dropboxPanel button').forEach(b=>b.disabled=true);_dbStatus('通信中…');
  try{await fn();}catch(e){_dbStatus(e.name==='AbortError'?'通信がタイムアウトしました。再試行してください':e.message);}finally{_dbBusy=false;document.querySelectorAll('#dropboxPanel button').forEach(b=>b.disabled=false);}
}
(function(){
  const c=_dbConfig();document.getElementById('dbAppKey').value=c.appKey||'';document.getElementById('dbFolder').value=c.folder||'';
  document.getElementById('dbConnect').addEventListener('click',()=>_dbRun(dropboxConnect));document.getElementById('dbList').addEventListener('click',()=>_dbRun(dropboxList));document.getElementById('dbSave').addEventListener('click',()=>_dbRun(dropboxSave));document.getElementById('dbDisconnect').addEventListener('click',dropboxDisconnect);
  _dbStatus(_dbSession()?'接続中':'未接続：初回はDropboxアプリの設定が必要です');_dbCallback();
})();
