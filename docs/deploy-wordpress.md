# WordPressサイトへの設置手順（MICS009一式）

MICS009はサーバー処理ゼロの静的ファイル。PHPもDBも不要＝WordPressのあるサーバーにフォルダを置くだけ。

## 必要ファイル（このリポジトリのルートから）
index.html / mics-609bc14b.html / guitar-strum.html / dj-scratch.html / default.mics / version.json / manifest.json

## 手順（セルフホストWPの場合）
1. GitHubの Code → Download ZIP でファイル取得
2. ホスティングのファイルマネージャー or FTPで、サーバーに `mics009/` フォルダを作って上記7ファイルをアップ
   - **置き場所は wp-content/uploads の外**（サイトルート直下推奨）。セキュリティプラグインがuploads内のHTML実行を止めることがある
3. `https://あなたのドメイン/mics009/` で起動（index.htmlが本体へリダイレクト）
4. WordPress側は固定ページやメニューに **リンクを張るだけ**（例:「APPをひらく」ボタン）
   - iframe埋め込みは非推奨: アプリはフルスクリーン設計＋マイク権限が必要（やるなら allow="microphone; autoplay" 必須）

## 前提・注意
- **HTTPS必須**（マイク録音の条件。通常のWPサイトなら満たしている）
- WordPress.com（ホスティング版）は任意ファイルを置けない → その場合は現行のGitHub Pages URLへリンクするだけでOK
- 更新時は7ファイルを上書き。version.jsonの仕組みでユーザー側に「更新」ボタンが出る
- ユーザーデータは各自のブラウザ内（保存は.micsファイルとして各自の端末へ）＝サーバーに何も溜まらない・個人情報なし
- ライセンスはMIT＝一般公開可
