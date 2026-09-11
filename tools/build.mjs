#!/usr/bin/env node
// build.mjs — 開発はモジュール、公開は1ファイル。
//   src/manifest.json の順に src/ を連結して mics-609bc14b.html を生成する。
//   バージョンは version.json だけが正（__APP_VERSION__ に差し込む）＝3箇所を手で揃える作業が消える。
//   --check: 生成結果と現物を突き合わせ、ズレていたら exit 1（HTMLを直接いじった事故を関門で止める）
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const man = JSON.parse(readFileSync(join(ROOT, 'src/manifest.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`✖ version.json の version が不正: ${version}`); process.exit(1); }

const missing = man.parts.filter(p => !existsSync(join(ROOT, 'src', p)));
if (missing.length) { console.error('✖ manifest にあって src に無い部品:\n  ' + missing.join('\n  ')); process.exit(1); }

const pieces = man.parts.map(p => readFileSync(join(ROOT, 'src', p), 'utf8'));
const out = pieces.join('').split(man.placeholder).join(version);
const outPath = join(ROOT, man.out);

if (process.argv.includes('--check')) {
  const cur = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (cur === out) { console.log(`✔ build: ${man.out} は src と一致（${man.parts.length}部品 / v${version}）`); process.exit(0); }
  // どの部品までが一致しているかを示す＝直すべき場所が分かる
  let acc = '', culprit = '(先頭)';
  for (let i = 0; i < pieces.length; i++) {
    const next = acc + pieces[i].split(man.placeholder).join(version);
    if (!cur.startsWith(next)) { culprit = man.parts[i]; break; }
    acc = next;
  }
  console.error(`✖ build: ${man.out} が src と食い違う（最初にズレる部品: src/${culprit}）`);
  console.error('  HTML を直接いじった場合は src/ 側へ移し、`node tools/build.mjs` で作り直すこと。');
  process.exit(1);
}

writeFileSync(outPath, out);
console.log(`✔ build: ${man.out} を生成（${man.parts.length}部品 / v${version} / ${out.length.toLocaleString()} bytes）`);
