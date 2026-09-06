// 静的検査（ブラウザ不要・1秒）。関門（gate.mjs）から呼ばれる。
//   node tools/static-check.mjs
// 1) 暗黙グローバル：宣言されていないのに参照されている識別子。id を持つ要素は window の暗黙
//    グローバルになるので「宣言を消しても動いてしまう」（v0.3.84〜0.3.95 の gPatSeg/gBarSeg 事故）。
// 2) 存在しない id への参照（getElementById / querySelector("#…")）。
// 3) バージョン3点一致（APP_VERSION / version.json / splashVer）。
// 検出器は検査ワーカーW6（v0.3.97）の implicit-scope.mjs を取り込んだもの。
// 関数スコープを考慮した版：宣言が別の関数の中にしか無く、外から参照している識別子を出す
import ts from '/opt/node22/lib/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../mics-609bc14b.html',import.meta.url),'utf8');
const browser=new Set(JSON.parse(fs.readFileSync(new URL('./browser-globals.json',import.meta.url),'utf8')));
const m=html.match(/<script>([\s\S]*?)<\/script>/); const code=m[1]; const base=html.slice(0,m.index).split('\n').length;
const ids=new Set(); const idre=/\sid="([^"]+)"/g; let mm; while((mm=idre.exec(html))) ids.add(mm[1]);
const sf=ts.createSourceFile('x.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const isFn=n=>ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n);
const decls=new Map(); // name -> [ [start,end] ranges of function scope ]  ('top' = [0,len])
const refs=new Map();
const addDecl=(name,scope)=>{ if(!decls.has(name)) decls.set(name,[]); decls.get(name).push(scope); };
const declBinding=(bn,scope)=>{ if(!bn) return; if(ts.isIdentifier(bn)) addDecl(bn.text,scope); else if(ts.isObjectBindingPattern(bn)||ts.isArrayBindingPattern(bn)) bn.elements.forEach(e=>{ if(ts.isBindingElement(e)) declBinding(e.name,scope); }); };
const visit=(n,scope)=>{
  // 関数名は外側スコープに属する（function declaration）。式の名前は内側。
  if(ts.isFunctionDeclaration(n)&&n.name) addDecl(n.name.text,scope);
  if(ts.isClassDeclaration(n)&&n.name) addDecl(n.name.text,scope);
  let inner=scope;
  if(isFn(n)){ inner=[n.getStart(sf),n.getEnd()]; if((ts.isFunctionExpression(n)||ts.isClassExpression(n))&&n.name) addDecl(n.name.text,inner); }
  if(ts.isVariableDeclaration(n)) declBinding(n.name,inner);
  if(ts.isParameter(n)) declBinding(n.name,inner);
  if(ts.isCatchClause(n)&&n.variableDeclaration) declBinding(n.variableDeclaration.name,inner);
  if(ts.isIdentifier(n)){
    const p=n.parent; let isRef=true;
    if(ts.isPropertyAccessExpression(p)&&p.name===n) isRef=false;
    if(ts.isPropertyAssignment(p)&&p.name===n) isRef=false;
    if((ts.isMethodDeclaration(p)||ts.isPropertyDeclaration(p)||ts.isGetAccessor(p)||ts.isSetAccessor(p))&&p.name===n) isRef=false;
    if(ts.isBindingElement(p)&&p.propertyName===n) isRef=false;
    if(ts.isLabeledStatement(p)||ts.isBreakOrContinueStatement(p)) isRef=false;
    if(ts.isVariableDeclaration(p)&&p.name===n) isRef=false;
    if((ts.isFunctionDeclaration(p)||ts.isFunctionExpression(p)||ts.isClassDeclaration(p))&&p.name===n) isRef=false;
    if(ts.isParameter(p)&&p.name===n) isRef=false;
    if(ts.isMetaProperty(p)) isRef=false;
    if(isRef){ if(!refs.has(n.text)) refs.set(n.text,[]); refs.get(n.text).push(n.getStart(sf)); }
  }
  ts.forEachChild(n,c=>visit(c,inner));
};
visit(sf,[0,code.length]);
const line=pos=>sf.getLineAndCharacterOfPosition(pos).line+base;
let count=0;
for(const [name,poss] of refs){
  if(browser.has(name)||['undefined','NaN','Infinity','globalThis','arguments'].includes(name)) continue;
  const d=decls.get(name)||[];
  const outside=poss.filter(p=>!d.some(([s,e])=>p>=s&&p<=e));
  if(outside.length){ count++; const tag=ids.has(name)?'【idの暗黙グローバル】':'【未定義!】'; console.log(`${tag} ${name}: 宣言スコープ外からの参照 ${outside.length}箇所 行 ${[...new Set(outside.map(line))].slice(0,6).join(',')}  （宣言は ${d.length?d.map(([s,e])=>(s===0?'top':'関数内 行'+line(s))).slice(0,3).join('/'):'無し'}）`); }
}
console.log(`暗黙グローバル/未定義: ${count}件`);
let fails=count;

// ---- 2) 存在しない id への参照 ----
{
  const dyn=new Set(); let m2;
  const dre=/\.id\s*=\s*["'`]([^"'`$]+)["'`]/g; while((m2=dre.exec(html))) dyn.add(m2[1]);
  const dre2=/id=\\?["'`]([^"'`$\\]+)\\?["'`]/g; while((m2=dre2.exec(html))) dyn.add(m2[1]);
  const dre3=/\bid:\s*["'`]([^"'`$]+)["'`]/g; while((m2=dre3.exec(html))) dyn.add(m2[1]);   // CL_PAGES の b:[{id:"clLearn"}] 等（テンプレートで生成）
  const scriptStart=html.slice(0,m.index).split('\n').length;
  const out=[];
  html.split('\n').forEach((ln,i)=>{ const n=i+1; if(n<scriptStart) return;
    let r=/getElementById\(\s*["'`]([^"'`$]+)["'`]\s*\)/g, mm;
    while((mm=r.exec(ln))){ if(!ids.has(mm[1])&&!dyn.has(mm[1])) out.push({id:mm[1],line:n,src:ln.trim().slice(0,110)}); }
    r=/querySelector(?:All)?\(\s*["'`]([^"'`]+)["'`]/g;
    while((mm=r.exec(ln))){ for(const x of mm[1].matchAll(/#([A-Za-z_][\w-]*)/g)){ if(!ids.has(x[1])&&!dyn.has(x[1])) out.push({id:x[1],line:n,src:ln.trim().slice(0,110)}); } }
  });
  const unguarded=out.filter(o=>!/if\s*\(\s*!?\w+\s*\)|\?\.|&&|typeof/.test(o.src));
  out.forEach(o=>console.log(`  #${o.id} 行${o.line}${unguarded.includes(o)?'  【ガード無し】':''}  ${o.src}`));
  console.log(`存在しないid参照: ${out.length}件（ガード無し ${unguarded.length}件）`);
  fails+=unguarded.length;
}

// ---- 3) バージョン3点一致 ----
{
  const app=(html.match(/const APP_VERSION\s*=\s*"([^"]+)"/)||[])[1];
  const splash=(html.match(/id="splashVer">v([^<]+)</)||[])[1];
  const vj=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8')).version;
  const ok=app&&app===splash&&app===vj;
  console.log(`バージョン: APP_VERSION=${app} splash=${splash} version.json=${vj} → ${ok?'一致':'【不一致】'}`);
  if(!ok) fails++;
}
console.log(fails?`✖ static-check: ${fails}件`:'✔ static-check: 問題なし');
process.exit(fails?1:0);
