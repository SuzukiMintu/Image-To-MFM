# このリポジトリのアカウント設定

このリポジトリでは、作者・コミッター・プッシュ認証をSuzukiMintuに揃えます。
他のプロジェクトのGit設定は変更しません。

新しくcloneした場合、リポジトリのフォルダーで次を実行してください。
Node.js 22以降とGitが必要です。

```console
node tools/setup-identity.mjs
```

これにより、リポジトリ内の `user.name`、`user.email`、`origin`、
`core.hooksPath` を設定します。既存の別のhooksPathがある場合は停止します。
Gitフックはcloneしただけでは自動で有効になりません。

コミット時に、実際の作者・コミッター情報とCo-authored-byを確認します。
プッシュ時には、送信先、送信範囲内の全コミット、実際のGitHub認証を確認します。
認証はGitと同じCredential Managerから取得し、GitHubの `/user` で照合します。
トークンをファイルやログに保存しません。通信・認証確認が失敗した場合もプッシュを停止します。

認証がない場合は、利用者が次を実行してください。

```console
git credential-manager github login --username SuzukiMintu --device
```

これは誤操作の防止です。フックは `--no-verify` 等で迂回でき、作者情報も本人認証ではありません。
GitHub側の書き込みを所有者だけに限定するには、Settings → Collaboratorsと、
書き込み可能なDeploy keys・GitHub Apps等の権限を管理してください。
GitHub Actionsからの公開処理は、その専用のワークフロー権限で動作します。
