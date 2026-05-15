# Manual Test Plan

## 使い方

注記:
- 「自動確認」は Node テストで主要な分岐や拒否条件を検査している範囲です。
- 「手動確認」は複数タブ、Service Worker 更新、実ブラウザの install prompt など、実行環境依存で手動確認が必要な範囲です。
- 変更種別別の確認コマンド、復元 schema、RL parity fixture への入口は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) です。復元 field の詳細だけを確認する場合は [`docs/online-restore-schema.md`](docs/online-restore-schema.md) を参照してください。
- 変更内容に近いカテゴリから確認してください。複数カテゴリにまたがる変更では、該当する見出しを組み合わせて使います。

| カテゴリ | 主な確認項目 | 補足 docs |
| --- | --- | --- |
| ゲームルール / カード効果 / 表示 | 休業、交換、譲渡、在庫、対象選択、カード表示順 | 変更種別別の自動確認は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) |
| オンライン同期 / 再接続 / 保存 | CPU 進行、ホスト復元、非ホスト追従、Undo、ロビー、再接続失敗 | 復元 schema は [`docs/online-restore-schema.md`](docs/online-restore-schema.md) |
| CPU / RL | CPU（最強）、5人以上の RL CPU、保存/復元/オンライン同期 | RL parity fixture は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) |
| PWA / 更新 / バージョン | Service Worker 更新、オフライン、install prompt、バージョン不一致 | PWA 変更時の確認は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) |
| 保存 / 再接続 UI | onlineSession 表示、壊れた保存データ、有効データからの復帰導線 | 復元 schema は [`docs/online-restore-schema.md`](docs/online-restore-schema.md) |
| CI / Android packaging | TWA APK artifact、署名、fingerprint、upload-artifact | 変更種別別の自動確認は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) |

## ゲームルール / カード効果 / 表示

1. `清掃業` + `ビジネスセンター`
   - ローカル対戦で同名カードを休業にする。
   - 休業中カードを `ビジネスセンター` で交換する。
   - 期待結果: 交換後も新しい所持者側で休業状態が維持される。

2. `引越し屋` で休業カードを譲渡
   - ローカル対戦で休業中カードを作る。
   - `引越し屋` で別プレイヤーへ渡す。
   - 期待結果: 渡した先でもそのカードは休業中のまま。

3. `ワイナリー` 複数枚
   - `ワイナリー` を複数枚持つ状態を作る。
   - 発動条件を満たして収入処理を行う。
   - 期待結果: 発動した1枚だけ休業し、他の同名カードは巻き込まれない。

4. `高級フレンチ` の休業解除
   - `清掃業` などで `高級フレンチ` を休業にする。
   - 休業中の `高級フレンチ` を持つプレイヤー以外が5を出す。
   - 期待結果: 休業中の `高級フレンチ` は休業解除だけ行い、その出目ではコインを奪わない。

5. 休業中 `高級フレンチ` と2枚目購入
   - 休業中の `高級フレンチ` を持ったまま、同じプレイヤーが別の `高級フレンチ` を購入する。
   - その後、条件を満たす相手が5を出す。
   - 期待結果: 新しく購入した `高級フレンチ` は休業扱いにならず発動し、元の休業中カードは休業解除される。

6. カード表示順と休業枚数表示
   - 購入順が混ざるように複数色・複数出目のカードを購入する。
   - 所持カード一覧、建設メニュー、カード選択モーダルを確認する。
   - 期待結果: カードは色順（青、緑、赤、紫）→出目順で表示され、休業カードは `（休1）` のように枚数で表示される。

## オンライン同期 / 再接続 / 保存

このカテゴリでは、複数クライアントでの表示一致、ホスト主導の CPU action、保存済み `onlineSession`、サーバー再起動後の復元を確認します。復元 payload の互換性を変える場合は [`docs/online-restore-schema.md`](docs/online-restore-schema.md) も確認してください。

7. オンライン CPU 進行
   - 自動確認: `tests/online.test.js` / `tests/online-integration.test.js` で action 適用、CPU 手番、再接続まわりの主要分岐を検査する。
   - 手動確認: 複数クライアントで実際に同期表示とCPU進行タイミングを見る。
   - 人間1人 + CPU の部屋を作る。
   - CPUターンを数回進める。
   - 期待結果: 手番、建設、ターン終了が通常進行する。

8. ホスト再接続中の CPU
   - 自動確認: 再接続・ホスト復元の状態再構築は `tests/online-integration.test.js` / `tests/storage.test.js` で検査する。
   - 手動確認: ブラウザ再読込中にCPUが止まらないこと、二重実行されないことを見る。
   - オンラインでCPUターン中にホストを再読込する。
   - 再接続後しばらく観察する。
   - 期待結果: CPUが止まらず、同じ行動を二重に実行しない。

9. サーバー再起動後のホスト復元
   - 自動確認: snapshot / actionLog 復元の主要経路と、無効化 stock・重複休業 index・小数 coin の拒否、landmark key・旧 field 欠落の補完は `tests/server.test.js`, `tests/online-integration.test.js`, `tests/storage.test.js` で検査する。
   - 手動確認: 実サーバープロセス再起動後のブラウザ再接続と表示一致を見る。
   - オンライン対戦を開始し、数ターン進める。
   - サーバープロセスを再起動する。
   - ホスト側で再接続を行う。
   - 期待結果: 盤面、在庫、ログ、手番、pending 状態が復元される。

10. サーバー再起動後の非ホスト追従
   - 自動確認: `ROOM_NOT_FOUND` 待機や再接続データ処理は `tests/online-integration.test.js` / `tests/storage.test.js` で検査する。
   - 手動確認: ホスト復元前後で非ホスト画面が追従することを見る。
   - 上記の復元中に非ホスト側でも再接続を行う。
   - 期待結果: `ROOM_NOT_FOUND` 待機後に復帰し、ホスト復元後の状態へ同期する。

11. オンライン `Undo`
   - 自動確認: action 適用・同期拒否の一部は `tests/online.test.js` / `tests/main.test.js` で検査する。
   - 手動確認: 複数クライアントでUndo後の盤面、在庫、ログが一致することを見る。
   - 建設後に `Undo` を実行する。
   - 別クライアントでも盤面を見る。
   - 期待結果: コイン、在庫、建設状態、ログが全員で一致して戻る。

12. 在庫切れカード
   - 同じカードを在庫0まで購入する。
   - さらに購入を試す。
   - 期待結果: ローカルでもオンラインでも購入できない。

13. ロビー切断
   - オンライン部屋作成後、開始前に参加者を1人抜けさせる。
   - 期待結果: 空き枠と表示人数が正しく戻る。

14. 再接続失敗
   - 自動確認: session 保存/削除と再開表示は `tests/storage.test.js`、オンラインエラー処理は `tests/online.test.js` で検査する。
   - 手動確認: 実ブラウザで古い session を持つ状態から復帰失敗時の表示と次回接続を確認する。
   - 無効な `onlineSession` 相当の状態で再接続を試す。
   - 期待結果: `appError` によるエラー表示後、再接続データが消え、次の接続に影響しない。

15. ホスト移譲後の CPU 進行
   - 人間1人 + CPU を含む部屋を作る。
   - ホストを切断して別の人間プレイヤーへホスト移譲させる。
   - 期待結果: 新ホスト側で CPU ターンが継続し、停止しない。

16. 特殊対象選択の防御
   - `テレビ局`、`ビジネスセンター`、`引越し屋` を使う。
   - 無効な相手や対象が混ざるケースを確認する。
   - 期待結果: クラッシュせず、無効操作は拒否される。

## CPU / RL

CPU 判断の変更は、ローカル進行だけでなく保存/復元とオンライン同期も確認してください。RL runtime、export、trace parity の補助確認は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) を参照してください。

17. CPU（最強）live既定
   - ローカル対戦で CPU（最強）を含む2〜5人戦を開始し、ダイス選択、pending効果、建設、ターン終了まで数ターン進める。
   - CPU（最強）を含むローカル対戦を保存/復元し、復元後もCPU手番が停止しないことを確認する。
   - オンライン対戦でホスト側CPU（最強）を含め、CPU action が全クライアントへ同期されることを確認する。
   - 期待結果: CPU（最強）が停止・二重実行・フェーズ不整合を起こさず、ローカル/復元/オンラインで通常進行する。

18. 5人以上のRL CPU
   - 自動確認: `tests/main.test.js` / `tests/online.test.js` で5人以上でも `AI（深層学習・ランダム）` を選択でき、`rl` のままCPU生成されることを検査する。
   - 手動確認: ローカルの5人以上設定で `AI（深層学習・ランダム）` を選び、数ターン進めても停止しないことを見る。
   - 手動確認: オンライン部屋作成で5人以上のRL CPUを含め、参加者一覧と開始後のCPU action が `rl` として同期されることを見る。
   - 期待結果: RL CPU は5人以上でも自分 + 脅威度上位3人の相手を見て判断し、保存/復元/オンライン同期で停止しない。

## PWA / 更新 / バージョン

Service Worker 更新、install prompt、オフライン表示、バージョン不一致は実ブラウザ依存のため、Node テストだけで完結しません。変更種別別の最低確認は [`docs/maintenance-checklists.md`](docs/maintenance-checklists.md) も参照してください。

19. PWA 更新通知（ゲーム中）
   - 自動確認: なし。Service Worker の waiting / controllerchange とゲーム中 reload 抑止は実ブラウザ依存のため手動で見る。
   - 手動確認: 更新通知が出てもゲーム中に自動 reload されないこと、手動更新で安全に戻れることを見る。
   - 既存タブでゲームを開始し、別ビルド相当の Service Worker 更新を検知させる。
   - ゲーム中に更新通知が表示されても自動 reload されないことを確認する。
   - 期待結果: 手動更新操作まで盤面・手番・pending 状態が維持され、更新操作後に安全に再読込される。

20. PWA 更新通知（タイトル画面）
   - 自動確認: なし。Service Worker 更新検知と reload は実ブラウザ依存のため手動で見る。
   - 手動確認: タイトル画面では更新が安全に適用され、古い asset と新しい asset が混在しないことを見る。
   - タイトル画面またはゲーム未開始状態で Service Worker 更新を検知させる。
   - 初回インストール時に controllerchange が発火しても不要な reload が起きないことを確認する。
   - 初回インストール後、同じタブで更新を検知させた場合は controllerchange によって reload されることを確認する。
   - controllerchange が複数回発火しても reload が1回だけになることを確認する。
   - 期待結果: ゲーム中でなければ更新が自動適用または安全に reload され、古いUIと新しい asset が混在しない。

21. オフライン / インストール表示
   - 自動確認: `tests/main.test.js` で online/offline 時のオンライン操作無効化・復帰、`beforeinstallprompt` の抑止、standalone / dismiss 済み時の購読抑止を検査する。
   - 手動確認: 実ブラウザの install prompt 表示、dismiss 後の挙動、オフライン時の画面表示を確認する。
   - 一度アプリを読み込んだ後、ネットワークを切って再表示する。
   - PWA install prompt またはインストールバナーが出る環境では、表示・dismiss 後の再表示を確認する。
   - dismiss 済みの状態で `beforeinstallprompt` が再発火してもブラウザ標準 prompt が出ず、独自バナーも再表示されないことを確認する。
   - 期待結果: オフライン表示がクラッシュせず、インストール導線がゲーム進行やオンライン接続を妨げない。

22. オンライン参加者のバージョン不一致警告
   - 自動確認: `tests/online.test.js` / `tests/server.test.js` で client version 収集と不一致時ログの主要経路を検査する。
   - 手動確認: 古いタブや古い Service Worker 制御下のクライアントを混ぜた実ブラウザで、警告表示と継続動作を確認する。
   - 片方のクライアントだけ古いタブまたは古い Service Worker 制御下に残した状態でオンライン対戦を開始する。
   - 期待結果: ゲーム開始後のログにバージョン不一致警告が出て、全員に reload を促す。警告後もアプリ固有エラーは `appError` として扱われ、Socket.IO の transport error と混ざらない。

## 保存 / 再接続 UI

タイトル画面の復帰導線や localStorage の扱いを触る場合は、オンライン復元項目と合わせて確認してください。保存形式の詳細は [`docs/online-restore-schema.md`](docs/online-restore-schema.md) を参照してください。

23. オンライン再接続 UI
   - 自動確認: `tests/storage.test.js` で有効な再接続データだけ表示し、部屋IDとプレイヤー名を表示することを検査する。
   - 手動確認: オンライン対戦中にタブを閉じてタイトルへ戻り、再接続通知の部屋ID・プレイヤー名が正しいことを見る。
   - 壊れた `onlineSession` 相当の localStorage を入れてタイトルを表示する。
   - 期待結果: 壊れた再接続データでは再接続 UI が出ず、有効データでは再接続ボタンからオンラインタブへ移動して復帰を試行する。

## CI / Android packaging

Android/TWA workflow を触る場合は、artifact が欠落しても成功扱いにならないことを確認してください。ドキュメントのみの変更では `git diff --check` で十分です。

24. TWA APK artifact 失敗検知
   - 自動確認: `.github/workflows/build-apk.yml` で `app-release-signed.apk` の存在と非空を検査し、upload-artifact は missing artifact を error にする。
   - 手動確認: GitHub Actions の手動実行で keystore secret 不足時は早期失敗し、APK 未生成時も成功扱いにならないことを見る。
   - 期待結果: 署名・fingerprint・APK 生成のどれかが失敗した場合、workflow が緑にならない。
