// ファイル間の論理依存を検査する（ブラウザ不要・1秒）。関門（gate.mjs）の静的検査に続けて走る。
//   node tools/module-check.mjs            検査（落ちれば exit 1）
//   node tools/module-check.mjs --print    実装から導いた正しいヘッダを全ファイル分表示
//   node tools/module-check.mjs --write    ヘッダ（@module/@provides/@uses/@depends）を実装に合わせて書き直す
//   node tools/module-check.mjs --report   Markdown の一覧（docs 用）
//
// 役割分担（docs/maintainability-modularization-plan.md Phase 1）：
//   static-check.mjs … 暗黙グローバル・存在しない id・版の一致（ファイルの中）
//   module-check.mjs … ファイル間の契約（どのファイルが何を提供し、何を使い、何より後に読まれる必要があるか）
//
// ヘッダの意味：
//   @module   論理モジュール名（ファイル名から番号を除いたもの。重複不可）
//   @provides このファイルが最上位で宣言する関数・変数（他ファイルから見える名前）。static-check と同じ AST で導く
//   @uses     他ファイルが提供する名前のうち、このファイルが参照するもの
//   @depends  読み込み時（最上位の文・即時実行関数・forEach 等の同期コールバックの中）に参照する他モジュール
//             ＝manifest でこのファイルより前に無いと壊れる
//             関数の中からの参照は実行が後なので @uses だけに載る（連結順に縛られない）
//
// 検査：1) @module 重複  2) @depends の不在  3) manifest 順で依存先が前に無い  4) @provides（＝最上位宣言）の重複
//       5) ヘッダの無い JS  6) ヘッダと実装の不一致（provides / uses / depends の過不足）
// 「コメントと実装の不一致を作らない」を人の注意に頼らず、--write で機械的に揃える。
import fs from 'node:fs';
import path from 'node:path';

let ts=null;
for(const cand of [process.env.TS_PATH,'typescript','/opt/node22/lib/node_modules/typescript/lib/typescript.js'].filter(Boolean)){
  try{ const m=await import(cand); ts=m.default||m; if(ts&&ts.createSourceFile) break; ts=null; }catch(e){}
}
if(!ts){ console.error('✖ typescript が見つからない。`npm i --no-save typescript` するか TS_PATH にパスを指定すること'); process.exit(2); }

const ROOT=new URL('../',import.meta.url);
const SRC=new URL('src/',ROOT);
const manifest=JSON.parse(fs.readFileSync(new URL('src/manifest.json',ROOT),'utf8'));
const jsParts=manifest.parts.filter(p=>p.startsWith('js/')&&p.endsWith('.js'));
const argv=process.argv.slice(2);
const MODE=argv.includes('--write')?'write':argv.includes('--print')?'print':argv.includes('--report')?'report':argv.includes('--tracks')?'tracks':'check';

// ---------- ヘッダの読み書き ----------
const TAGS=['module','provides','uses','depends'];
function parseHeader(code){
  const lines=code.split('\n'); const meta={}; let i=0, last=null, end=0;
  for(;i<lines.length;i++){
    const ln=lines[i];
    const m=ln.match(/^\/\/ @(module|provides|uses|depends)\b\s*(.*)$/);
    if(m){ meta[m[1]]=(meta[m[1]]?meta[m[1]]+' ':'')+m[2].trim(); last=m[1]; end=i+1; continue; }
    const c=ln.match(/^\/\/ {3,}(\S.*)$/);          // 続き行（3つ以上の空白でインデント）
    if(c&&last){ meta[last]+=' '+c[1].trim(); end=i+1; continue; }
    break;                                            // ヘッダ以外の行が来たら終わり
  }
  if(!('module' in meta)) return null;
  const list=s=>(s||'').split(/[,\s]+/).map(x=>x.trim()).filter(x=>x&&x!=='-');
  return {module:meta.module.trim(), provides:list(meta.provides), uses:list(meta.uses), depends:list(meta.depends), endLine:end};
}
function formatHeader(h){
  const wrap=(tag,items)=>{
    if(!items.length) return [`// @${tag} -`];
    const out=[]; let cur=`// @${tag} `;
    items.forEach((it,i)=>{ const piece=it+(i<items.length-1?', ':'');
      if(cur.length+piece.length>110 && cur.trim()!==`// @${tag}`){ out.push(cur.replace(/\s+$/,'')); cur='//    '+piece; }
      else cur+=piece; });
    out.push(cur.replace(/\s+$/,'')); return out;
  };
  return [`// @module ${h.module}`, ...wrap('provides',h.provides), ...wrap('uses',h.uses), ...wrap('depends',h.depends)].join('\n');
}

// ---------- 実装の解析 ----------
const isFn=n=>ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n);
// 即時実行される関数（IIFE）は読み込み時に走るので「最上位」と同じ扱い
function isIIFE(n){
  if(!(ts.isFunctionExpression(n)||ts.isArrowFunction(n))) return false;
  let p=n.parent; while(p&&ts.isParenthesizedExpression(p)) p=p.parent;
  return !!(p&&ts.isCallExpression(p)&&(p.expression===n||(ts.isParenthesizedExpression(p.expression)&&unparen(p.expression)===n)));
}
function unparen(n){ while(ts.isParenthesizedExpression(n)) n=n.expression; return n; }
// 読み込み時に同期で呼ばれるコールバック：PADS.forEach(p=>…) のような配列の同期メソッドの引数。
// addEventListener / setTimeout / requestAnimationFrame / MutationObserver の引数は後で呼ばれるので含めない
const SYNC_METHODS=new Set(['forEach','map','filter','some','every','reduce','reduceRight','find','findIndex','findLast','flatMap','sort']);
function isSyncCallback(n){
  if(!(ts.isFunctionExpression(n)||ts.isArrowFunction(n))) return false;
  let p=n.parent; while(p&&ts.isParenthesizedExpression(p)) p=p.parent;
  if(!(p&&ts.isCallExpression(p)&&p.arguments.some(a=>unparen(a)===n))) return false;
  const callee=unparen(p.expression);
  return ts.isPropertyAccessExpression(callee)&&SYNC_METHODS.has(callee.name.text);
}

function analyze(code){
  const sf=ts.createSourceFile('x.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const top=new Map();            // 最上位宣言 name → kind
  const fnDecls=new Map();        // name → [ [start,end] ] 関数の中の宣言（影の判定用）
  const refs=[];                  // {name, pos, load:bool}
  const writes=[];                // {name, pos} 代入（x= / x+= / x++）の左辺が識別子のもの
  const propWrites=[];            // {root:'tracks'|'PADS', prop, pos} tracks[i].xxx= / PADS[i].xxx=（別名 const t=tracks[i] も追う）
  const aliases=[];               // {name, root, scope:[s,e]} tracks[i] / PADS[i] / tracks.forEach((t)=>…) の別名
  const addFn=(name,scope)=>{ if(!fnDecls.has(name)) fnDecls.set(name,[]); fnDecls.get(name).push(scope); };
  const bind=(bn,kind,scope,atTop)=>{ if(!bn) return;
    if(ts.isIdentifier(bn)){ if(atTop) top.set(bn.text,kind); else addFn(bn.text,scope); }
    else if(ts.isObjectBindingPattern(bn)||ts.isArrayBindingPattern(bn)) bn.elements.forEach(e=>{ if(ts.isBindingElement(e)) bind(e.name,kind,scope,atTop); }); };
  const visit=(n,scope,load)=>{
    const atTop=scope===null;
    if(ts.isFunctionDeclaration(n)&&n.name){ if(atTop) top.set(n.name.text,'function'); else addFn(n.name.text,scope); }
    if(ts.isClassDeclaration(n)&&n.name){ if(atTop) top.set(n.name.text,'class'); else addFn(n.name.text,scope); }
    let inner=scope, innerLoad=load;
    if(isFn(n)){ inner=[n.getStart(sf),n.getEnd()]; innerLoad=load&&(isIIFE(n)||isSyncCallback(n));
      if((ts.isFunctionExpression(n)||ts.isClassExpression(n))&&n.name) addFn(n.name.text,inner); }
    if(ts.isVariableDeclaration(n)){ const kind=(n.parent.flags&ts.NodeFlags.Const)?'const':(n.parent.flags&ts.NodeFlags.Let)?'let':'var';
      // let/const はブロックスコープ：ファイル直下の文だけが「提供」。for(let s…) や if{…} の中のものは
      // そのブロックの範囲だけ影になる（var は関数の外なら全部ファイル級）
      const list=n.parent, holder=list.parent;   // VariableDeclarationList → VariableStatement | For*Statement
      const fileLevel = kind==='var' ? atTop : (atTop && ts.isVariableStatement(holder) && ts.isSourceFile(holder.parent));
      if(fileLevel) bind(n.name,kind,inner,true);
      else if(atTop){ const blk=ts.isVariableStatement(holder)?holder.parent:holder; bind(n.name,kind,[blk.getStart(sf),blk.getEnd()],false); }
      else bind(n.name,kind,inner,false); }
    if(ts.isParameter(n)) bind(n.name,'param',inner,false);
    // tracks / PADS の別名：const t=tracks[i] ／ tracks.forEach((t,i)=>…) ／ for(const t of tracks)
    const rootOf=(e)=>{ e=unparen(e); if(ts.isElementAccessExpression(e)&&ts.isIdentifier(e.expression)&&(e.expression.text==='tracks'||e.expression.text==='PADS')) return e.expression.text; return null; };
    if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){ const r=rootOf(n.initializer); if(r) aliases.push({name:n.name.text,root:r,scope:inner||[0,code.length]}); }
    if(ts.isForOfStatement(n)&&ts.isVariableDeclarationList(n.initializer)){ const d=n.initializer.declarations[0]; const e=unparen(n.expression);
      if(d&&ts.isIdentifier(d.name)&&ts.isIdentifier(e)&&(e.text==='tracks'||e.text==='PADS')) aliases.push({name:d.name.text,root:e.text,scope:[n.getStart(sf),n.getEnd()]}); }
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&ts.isIdentifier(n.expression.expression)&&(n.expression.expression.text==='tracks'||n.expression.expression.text==='PADS')
       &&['forEach','map','some','every','filter','find'].includes(n.expression.name.text)&&n.arguments[0]&&isFn(unparen(n.arguments[0]))){
      const fn=unparen(n.arguments[0]), p0=fn.parameters[0]; if(p0&&ts.isIdentifier(p0.name)) aliases.push({name:p0.name.text,root:n.expression.expression.text,scope:[fn.getStart(sf),fn.getEnd()]}); }
    if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&ts.isPropertyAccessExpression(n.left)){
      const obj=unparen(n.left.expression); let r=rootOf(obj); const pos=n.getStart(sf);
      if(!r&&ts.isIdentifier(obj)){ const a=aliases.filter(a=>a.name===obj.text&&pos>=a.scope[0]&&pos<=a.scope[1]).pop(); if(a) r=a.root; }
      if(r) propWrites.push({root:r,prop:n.left.name.text,pos}); }
    if(ts.isCatchClause(n)&&n.variableDeclaration) bind(n.variableDeclaration.name,'catch',inner,false);
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
      if(isRef) refs.push({name:n.text,pos:n.getStart(sf),load});
      if(isRef){ let w=false;
        if(ts.isBinaryExpression(p)&&p.left===n){ const k=p.operatorToken.kind; w = k>=ts.SyntaxKind.FirstAssignment && k<=ts.SyntaxKind.LastAssignment; }
        if((ts.isPrefixUnaryExpression(p)||ts.isPostfixUnaryExpression(p))&&(p.operator===ts.SyntaxKind.PlusPlusToken||p.operator===ts.SyntaxKind.MinusMinusToken)) w=true;
        if(w) writes.push({name:n.text,pos:n.getStart(sf)}); }
    }
    ts.forEachChild(n,c=>visit(c,inner,innerLoad));
  };
  visit(sf,null,true);
  // 影：関数の中で同名を宣言していればその中の参照は外を見ていない
  const shadowed=(name,pos)=>(fnDecls.get(name)||[]).some(([s,e])=>pos>=s&&pos<=e);
  return {top, refs:refs.filter(r=>!shadowed(r.name,r.pos)), writes:writes.filter(r=>!shadowed(r.name,r.pos)), propWrites, sf};
}

// ---------- 全ファイル ----------
const files=jsParts.map((rel,idx)=>{
  const code=fs.readFileSync(new URL(rel,SRC),'utf8');
  const a=analyze(code);
  const header=parseHeader(code);
  const defaultModule=rel.replace(/^js\//,'').replace(/\.js$/,'').replace(/(^|\/)\d+-/,'$1');   // js/ui/pads-view.js → ui/pads-view、js/30-x.js → x
  return {rel, idx, code, header, module:defaultModule, top:a.top, refs:a.refs, writes:a.writes, propWrites:a.propWrites, sf:a.sf};   // @module はパス由来（動かしたら --write で追従）
});
const provider=new Map();   // name → file（最上位宣言の持ち主）
const dupProvides=[];
for(const f of files) for(const name of f.top.keys()){
  if(provider.has(name)) dupProvides.push({name, a:provider.get(name).rel, b:f.rel}); else provider.set(name,f);
}
for(const f of files){
  const uses=new Map();   // name → {load:boolean}
  for(const r of f.refs){
    if(f.top.has(r.name)) continue;                    // 自分の最上位宣言
    const g=provider.get(r.name); if(!g||g===f) continue;
    const u=uses.get(r.name)||{load:false}; u.load=u.load||r.load; uses.set(r.name,u);
  }
  f.uses=[...uses.keys()].sort();
  const dep=new Set(); for(const [name,u] of uses) if(u.load) dep.add(provider.get(name).module);
  f.depends=[...dep].sort((a,b)=>files.find(x=>x.module===a).idx-files.find(x=>x.module===b).idx);
  f.provides=[...f.top.keys()].sort();
  f.loadRefs=[...uses].filter(([,u])=>u.load).map(([n])=>n);
}
const byModule=new Map(); files.forEach(f=>{ if(!byModule.has(f.module)) byModule.set(f.module,[]); byModule.get(f.module).push(f); });

if(MODE==='print'){ for(const f of files){ console.log(`\n### ${f.rel}\n${formatHeader({module:f.module,provides:f.provides,uses:f.uses,depends:f.depends})}`); } process.exit(0); }
if(MODE==='write'){
  let n=0;
  for(const f of files){
    const h=formatHeader({module:f.module,provides:f.provides,uses:f.uses,depends:f.depends});
    const lines=f.code.split('\n');
    const body=f.header?lines.slice(f.header.endLine):lines;
    const next=h+'\n'+body.join('\n');
    if(next!==f.code){ fs.writeFileSync(new URL(f.rel,SRC),next); n++; console.log(`書き直した: ${f.rel}`); }
  }
  console.log(`✔ module-check --write: ${n}件のヘッダを実装に合わせた${n?'（node tools/build.mjs を忘れずに）':''}`);
  process.exit(0);
}
if(MODE==='tracks'){   // tracks[i].xxx= / PADS[i].xxx= の書き手（Phase 3「tracks / PADS は最後に扱う」の下調べ。Markdown）
  const tbl=new Map();   // root.prop → Map(module → count)
  for(const f of files) for(const w of f.propWrites){ const k=w.root+'.'+w.prop; if(!tbl.has(k)) tbl.set(k,new Map()); const m=tbl.get(k); m.set(f.module,(m.get(f.module)||0)+1); }
  console.log('| 書かれる属性 | 書き手（モジュール：回数） | 書き手の数 |'); console.log('|---|---|---:|');
  for(const [k,m] of [...tbl].sort((a,b)=>b[1].size-a[1].size||a[0].localeCompare(b[0]))) console.log(`| \`${k}\` | ${[...m].map(([md,c])=>`${md}:${c}`).join(', ')} | ${m.size} |`);
  console.log(`\n属性 ${tbl.size} 種 / 代入 ${[...tbl.values()].reduce((s,m)=>s+[...m.values()].reduce((a,b)=>a+b,0),0)} 箇所`);
  process.exit(0);
}
if(MODE==='report'){
  console.log('| ファイル | @module | 提供 | 使用 | 読み込み時に依存（@depends） |');
  console.log('|---|---|---:|---:|---|');
  for(const f of files) console.log(`| \`${f.rel}\` | ${f.module} | ${f.provides.length} | ${f.uses.length} | ${f.depends.length?f.depends.join(', '):'—'} |`);
  console.log(`\n最上位宣言 ${[...provider.keys()].length} 個 / 重複 ${dupProvides.length} 件`);
  process.exit(0);
}

// ---------- 検査 ----------
const fails=[]; const warn=[];
// 1) @module 重複
for(const [m,fs_] of byModule) if(fs_.length>1) fails.push(`@module "${m}" が重複: ${fs_.map(f=>f.rel).join(', ')}`);
// 4) 最上位宣言の重複（同名を2ファイルで宣言＝後勝ちで静かに壊れる）
for(const d of dupProvides) fails.push(`最上位宣言 "${d.name}" が2ファイルにある: ${d.a} と ${d.b}`);
for(const f of files){
  // 5) ヘッダ無し
  if(!f.header){ fails.push(`${f.rel}: ヘッダ（@module/@provides/@uses/@depends）が無い → node tools/module-check.mjs --write`); continue; }
  const h=f.header;
  if(h.module!==f.module) fails.push(`${f.rel}: @module "${h.module}" はパス由来の "${f.module}" と違う → --write で揃う`);
  // 2) @depends の不在
  for(const d of h.depends) if(!byModule.has(d)) fails.push(`${f.rel}: @depends "${d}" というモジュールは無い`);
  // 3) manifest 順：依存先が前に無い
  for(const d of h.depends){ const g=(byModule.get(d)||[])[0]; if(g&&g.idx>=f.idx) fails.push(`${f.rel}: @depends "${d}"（${g.rel}）が manifest で後ろにある＝読み込み時に未定義になる`); }
  // 6) ヘッダと実装の不一致
  const diff=(label,decl,real)=>{ const D=new Set(decl), R=new Set(real);
    const extra=decl.filter(x=>!R.has(x)), missing=real.filter(x=>!D.has(x));
    if(extra.length||missing.length) fails.push(`${f.rel}: @${label} が実装と違う${missing.length?`  不足: ${missing.join(', ')}`:''}${extra.length?`  余分: ${extra.join(', ')}`:''}  → --write で揃う`); };
  diff('provides',h.provides,f.provides); diff('uses',h.uses,f.uses); diff('depends',h.depends,f.depends);
}
// 追加：読み込み時に後ろのファイルの let/const/class を参照（TDZ）＝ヘッダに関係なく実装の問題
for(const f of files) for(const name of f.loadRefs){ const g=provider.get(name); const kind=g.top.get(name);
  if(g.idx>f.idx && kind!=='function') fails.push(`${f.rel}: 読み込み時に ${g.rel} の ${kind} "${name}" を参照している（連結順で未初期化）`);
  else if(g.idx>f.idx) warn.push(`${f.rel}: 読み込み時に後ろの ${g.rel} の関数 "${name}" を呼ぶ（巻き上げで動くが順序依存）`); }

// 7) app/state の @writers：状態を書いてよいモジュールは宣言行の @writers に挙げたものだけ（Phase 3「入口を限定する」）
{ const st=files.find(f=>f.module==='app/state');
  if(st){ const allow=new Map();   // name → Set(module)
    for(const line of st.code.split('\n')){ const m=line.match(/^let\s+([^/]+?);?\s*\/\/.*@writers\s+(.+?)\s*$/); if(!m) continue;
      const names=m[1].split(',').map(x=>x.trim().split('=')[0].trim()).filter(Boolean);
      const mods=new Set(m[2]==='-'?[]:m[2].split(',').map(x=>x.trim()).filter(Boolean));
      for(const nm of names) allow.set(nm,mods); }
    for(const name of st.top.keys()) if(!allow.has(name)) fails.push(`${st.rel}: "${name}" の行に @writers が無い（書いてよいモジュールを列挙する。無ければ "-"）`);
    const seen=new Map(); for(const [n,mods] of allow) seen.set(n,new Set());
    for(const f of files){ if(f===st) continue; for(const w of f.writes){ if(!allow.has(w.name)||f.top.has(w.name)) continue;
      seen.get(w.name).add(f.module);
      if(!allow.get(w.name).has(f.module)){ const {line}=ts.getLineAndCharacterOfPosition(f.sf,w.pos);
        fails.push(`${f.rel}:${line+1}: app/state の "${w.name}" を書いている。入口は ${[...allow.get(w.name)].join(', ')||'（無し）'} → 入口関数を呼ぶか、app/state.js の @writers に足す`); } } }
    for(const [n,mods] of allow) for(const md of mods) if(!seen.get(n).has(md)) warn.push(`app/state: "${n}" の @writers にある ${md} はもう書いていない（列挙を減らせる）`);
  } }
for(const w of warn) console.log('  ⚠ '+w);
for(const x of fails) console.log('  ✖ '+x);
console.log(`モジュール ${files.length} / 最上位宣言 ${provider.size} / 警告 ${warn.length} / 問題 ${fails.length}`);
console.log(fails.length?`✖ module-check: ${fails.length}件`:'✔ module-check: 問題なし');
process.exit(fails.length?1:0);
