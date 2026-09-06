// 出す前の関門。これ1本で全部回し、1つでも落ちたら exit 1（push を止める）。
//   node tools/gate.mjs [port]
// 記憶に頼らないための仕組み。.githooks/pre-push から呼ばれる。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const PORT=process.argv[2]||'8137';
const env={...process.env};
const run=(label,args,opts={})=>{
  console.log(`\n━━━ ${label} ━━━`);
  const r=spawnSync(process.execPath,args,{stdio:['ignore','pipe','pipe'],env,encoding:'utf8',...opts});
  process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||'');
  return r.status??1;
};
// 0) サーバが居るか
const alive=spawnSync('bash',['-lc',`curl -sf -o /dev/null http://localhost:${PORT}/mics-609bc14b.html && echo up`],{encoding:'utf8'}).stdout.includes('up');
if(!alive){ console.error(`\n✖ http://localhost:${PORT} に本体が居ない。先に  python3 -m http.server ${PORT}  を起動すること`); process.exit(2); }
const fails=[];
// 1) 回帰（合否）
if(run('check.mjs（回帰・合否）',['tools/check.mjs',PORT])!==0) fails.push('check.mjs');
// 2) 押しても何も起きないコントロール（消したハンドラの検出）
if(run('dead-controls.mjs（無反応コントロール）',['tools/dead-controls.mjs',PORT])!==0) fails.push('dead-controls.mjs');
// 3) 消えた登録・関数・要素参照（意図した撤去は tools/removals-ok.txt に書く）
{
  const base=spawnSync('git',['rev-parse','--verify','-q','origin/main'],{encoding:'utf8'}).status===0?'origin/main':'HEAD~1';
  const r=spawnSync(process.execPath,['tools/lost-listeners.mjs',base],{encoding:'utf8'});
  console.log(`\n━━━ lost-listeners.mjs（${base} 比） ━━━`); process.stdout.write(r.stdout);
  const ok=new Set(fs.existsSync('tools/removals-ok.txt')?fs.readFileSync('tools/removals-ok.txt','utf8').split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')):[]);
  const gone=[...r.stdout.matchAll(/^   (.+)$/gm)].map(m=>m[1].trim()).filter(x=>!ok.has(x));
  if(gone.length){ console.error(`✖ 意図が記録されていない削除 ${gone.length}件（意図どおりなら tools/removals-ok.txt に理由つきで書く）:`); gone.forEach(g=>console.error('   '+g)); fails.push('lost-listeners.mjs'); }
  else console.log('✔ 記録なしの削除は無し');
}
// 4) 未使用CSS（レポート。落とさない）
{
  const a=spawnSync(process.execPath,['tools/deadcss.mjs',PORT],{encoding:'utf8',env});
  const b=spawnSync(process.execPath,['tools/deadcss-filter.mjs'],{input:a.stdout,encoding:'utf8'});
  console.log('\n━━━ deadcss（レポート） ━━━'); process.stdout.write(b.stdout.split('\n').slice(0,6).join('\n')+'\n');
}
// 5) UI規則スコア（レポート。落とさない）
run('ui-audit.mjs（スコア・レポート）',['tools/ui-audit.mjs',PORT]);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if(fails.length){ console.error(`✖ 関門で止めた: ${fails.join(', ')}`); process.exit(1); }
console.log('✔ 全関門クリア。出してよい。'); process.exit(0);
