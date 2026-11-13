# 夜間ブラウザCIの実行環境（2026-10-23）

導入時一覧は318件（WebKit 316件＋Chromium 2件）。分割・一覧照合は維持し、
件数を固定せず、新しいspecもPlaywrightの全project一覧から自動的に含める。
各runnerは1 worker、既存job時間上限・retry・trace/video設定を維持する。

run 39877929675のshard 2/4は、job metadata上でブラウザの
`install --with-deps`工程が15分以上継続し、テスト自体が未開始だった。
進行中jobのログAPIは404だったため、aptとブラウザdownloadのどちらが
停止したかは未確定である。ネットワーク原因や特定ミラー障害と断定しない。

nightly・Release・visualのブラウザjobだけ、Playwright公式の
`v1.61.1-noble`をdigest固定して使う。イメージはブラウザとOS依存関係を
含むため、毎回のapt／ブラウザdownload工程そのものをなくし、環境も固定する。
`npm ci`は残し、packageのPlaywright版とイメージ版の一致・両ブラウザの
preinstalled executableの存在を `scripts/check-playwright-container.js` で確認する。
版を更新する際はpackage・image digest・guardを同時に更新する。
コンテナpull・npm取得のネットワーク障害まで解消するものではない。

OS・フォント・ライブラリが固定環境へ変わるため、strict画像比較を改めて確認する。
PNG基準の自動更新・許容差の緩和で環境差を隠さない。
ブラウザを実行しないinventory/coverage・Node・simulation等のjobは変更しない。

参考：
- [公式Docker環境・版一致](https://playwright.dev/docs/docker)
- [公式GitHub Actionsコンテナ構成](https://playwright.dev/docs/ci#via-containers)

MCR manifest HEADで確認したdigest：
`sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`。
ローカルでイメージpullやブラウザ起動は行っていない。実行環境の最終確認はCIで行う。

## 網羅性と安定成功の別判定（2026-11-03）

`verifyReports` は全件の実行・ID和集合・許可済skipを検証する。これだけでは
初回timeout→retry成功も「実行済み」に含まれる。CLIの `verify` ではその後に
`assertStableExecution` を必ず実行し、各ケースが1回で期待する結果に到達したことも要求する。
再試行成功、最終失敗・timeout、複数attemptはNightlyを失敗にする。
意図して定義されたexpected failureと既存の許可済opt-in skipは区別して維持する。

Playwrightのretry設定は診断用に残す。再試行成功を安定成功へ読み替えず、
失敗時にも全attemptを含むJSON/HTML/画像をartifactへ保存する。
検査はshardごとと和集合の両方へ同じCLIから適用される。
ブラウザのassert・期限・出目・fixtureを変更する処理ではない。

過去の実artifactのcoverage JSONを改変せず再判定し、4eの2 retry成功は拒否、
c433の353初回成功＋許可済skip1は受理することを確認した。
[再判定記録](reviews/assets/nightly-quality/stability-gate-replay.json)を参照。
これは保存された実行結果に対するローカル検証で、新しいブラウザ対局ではない。
