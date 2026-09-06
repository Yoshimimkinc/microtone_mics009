// 「うっかり消した実行コード」を見つける。範囲指定の削除は隣の生きたコードを巻き込む。
//   node tools/lost-listeners.mjs [比較元のリビジョン]   （既定: origin/main）
// 消えた addEventListener 登録・関数宣言・トップレベルの実行文を並べる。
// 出てきたものが「意図した削除か」は人間が判断する（このツールは落ちない）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const base=process.argv[2]||'origin/main';
const cur=fs.readFileSync(new URL('../mics-609bc14b.html',import.meta.url),'utf8');
const old=execFileSync('git',['show',`${base}:mics-609bc14b.html`],{encoding:'utf8',maxBuffer:1<<28});
const js=t=>t.match(/<script>([\s\S]*?)<\/script>/)[1];
const O=js(old), N=js(cur);
const ev=t=>new Set([...t.matchAll(/([\w$.\[\]"'#()-]{1,60})\.addEventListener\(\s*["'](\w+)["']/g)].map(m=>`${m[1].trim()} [${m[2]}]`));
const fn=t=>new Set([...t.matchAll(/^\s*function\s+([\w$]+)/gm)].map(m=>m[1]));
const decl=t=>new Set([...t.matchAll(/^\s*(?:const|let|var)\s+([\w$]+)\s*=\s*document\.getElementById/gm)].map(m=>m[1]));
const show=(label,set)=>{ const a=[...set].sort(); console.log(`\n${label} ${a.length}件`); a.forEach(x=>console.log('   '+x)); };
const diff=(a,b)=>new Set([...a].filter(x=>!b.has(x)));
console.log(`=== ${base} → 現在 ===`);
show('消えたリスナ登録', diff(ev(O),ev(N)));
show('消えた関数', diff(fn(O),fn(N)));
show('消えた要素参照(const x=getElementById)', diff(decl(O),decl(N)));
console.log('\n※ ここに出たものが全部バグとは限らない（意図した撤去も出る）。');
console.log('※ ただし「消したつもりが無いのに出ている」ものは巻き込み事故。v0.3.96はこれで見つけた。');
