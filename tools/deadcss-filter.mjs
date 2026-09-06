// deadcss.mjs の出力（0要素セレクタ）を受け取り、識別子がHTML/JSに実在しないものだけ残す。
//   node tools/deadcss.mjs | node tools/deadcss-filter.mjs
// 「セレクタが0件」＝「未使用」ではない（実行時に付く状態クラスが大半）ため、この二段目が要る。
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../mics-609bc14b.html',import.meta.url),'utf8');
const css=src.match(/<style>([\s\S]*?)<\/style>/)[1];
const rest=src.replace(css,'');
const used=t=>new RegExp(`(?<![\\w$-])${t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\w$-])`).test(rest);
const input=fs.readFileSync(0,'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const out=[];
for(const sel of input){
  const toks=new Set([...sel.matchAll(/\.([A-Za-z][\w-]*)/g),...sel.matchAll(/#([A-Za-z][\w-]*)/g)].map(m=>m[1]));
  const miss=[...toks].filter(t=>!used(t));
  for(const m of sel.matchAll(/\[([\w-]+)="([^"]+)"\]/g)) if(!rest.includes(`${m[1]}="${m[2]}"`)) miss.push(`${m[1]}="${m[2]}"`);
  if(miss.length) out.push(`  ${sel.padEnd(56)} 欠落: ${[...new Set(miss)].sort().join(', ')}`);
}
console.log(`== 使われていない候補 ${out.length} 件 ==`);
console.log(out.join('\n'));
console.log('\n※ クラスを「付ける側」のコードを必ず目視で確認すること（v0.3.84で .perf-rotate を誤って消しかけた）');
