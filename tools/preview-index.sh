#!/usr/bin/env bash
# プレビュー一覧ページを作る（標準出力）。使い方: bash tools/preview-index.sh <siteディレクトリ>
# スマホから1つのブックマークで「いま触れる枝」に辿り着けるようにするための入口。
set -euo pipefail
SITE="${1:-site}"
mkdir -p "$SITE/preview"
cat <<'HEAD'
<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>microtone — プレビュー</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;padding:24px 16px;background:#0d1013;color:#e8e4d8;
      font:16px/1.6 -apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
 h1{font-size:19px;letter-spacing:.02em;margin:0 0 4px}
 h1 b{color:#ff5d5d;font-weight:700}
 p{margin:0 0 20px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6c7480}
 a{display:flex;align-items:center;min-height:56px;padding:10px 16px;margin-bottom:10px;
   border:1px solid #2a3039;border-radius:10px;background:#141a20;color:#e8e4d8;text-decoration:none}
 a:active{border-color:#3dd6c4}
 a.main{border-color:#3dd6c4;color:#3dd6c4}
 small{display:block;margin-top:18px;font-size:11px;color:#6c7480;letter-spacing:.08em}
</style></head><body>
<h1>micro<b>tone</b> MICS009</h1><p>Preview</p>
<a class="main" href="../">本番（main）</a>
HEAD
found=0
for d in "$SITE"/preview/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  printf '<a href="./%s/">%s</a>\n' "$name" "$name"
  found=1
done
[ "$found" = 0 ] && echo '<small>いま公開中のプレビューはありません。</small>'
cat <<'FOOT'
<small>各ブランチに push すると自動で並びます。ブランチを消すと消えます。</small>
</body></html>
FOOT
