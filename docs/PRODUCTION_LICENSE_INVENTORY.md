# 本番依存パッケージのライセンス台帳

`node scripts/report-production-licenses.js` でローカルのlockfileとインストール済みパッケージから生成。

package-lock.json SHA-256: `1a6fc57893decab67e94112ac5481235be3785f1b30c54bfea9878f0ae0703be`

対象: lockfileでdev/devOptionalとされていない87件。推移的依存も含む。

これは宣言情報とファイル存在の一覧であり、ライセンス本文の審査や配布物への通知同梱を完了した記録ではない。ブラウザ配信bundleに含まれるコード、外部配信物、図版、ゲームの名称・文言の権利は別途確認する。

| パッケージ位置 | 固定バージョン | 宣言ライセンス | インストール版との一致 | 直下のライセンス・通知ファイル |
| --- | --- | --- | --- | --- |
| node_modules/@socket.io/component-emitter | 3.1.2 | MIT | 一致 | LICENSE |
| node_modules/@types/cors | 2.8.19 | MIT | 一致 | LICENSE |
| node_modules/@types/node | 25.5.0 | MIT | 一致 | LICENSE |
| node_modules/@types/ws | 8.18.1 | MIT | 一致 | LICENSE |
| node_modules/accepts | 2.0.0 | MIT | 一致 | LICENSE |
| node_modules/base64id | 2.0.0 | MIT | 一致 | LICENSE |
| node_modules/body-parser | 2.2.2 | MIT | 一致 | LICENSE |
| node_modules/bytes | 3.1.2 | MIT | 一致 | LICENSE |
| node_modules/call-bind-apply-helpers | 1.0.2 | MIT | 一致 | LICENSE |
| node_modules/call-bound | 1.0.4 | MIT | 一致 | LICENSE |
| node_modules/content-disposition | 1.0.1 | MIT | 一致 | LICENSE |
| node_modules/content-type | 1.0.5 | MIT | 一致 | LICENSE |
| node_modules/cookie | 0.7.2 | MIT | 一致 | LICENSE |
| node_modules/cookie-signature | 1.2.2 | MIT | 一致 | LICENSE |
| node_modules/cors | 2.8.6 | MIT | 一致 | LICENSE |
| node_modules/debug | 4.4.3 | MIT | 一致 | LICENSE |
| node_modules/depd | 2.0.0 | MIT | 一致 | LICENSE |
| node_modules/dunder-proto | 1.0.1 | MIT | 一致 | LICENSE |
| node_modules/ee-first | 1.1.1 | MIT | 一致 | LICENSE |
| node_modules/encodeurl | 2.0.0 | MIT | 一致 | LICENSE |
| node_modules/engine.io | 6.6.6 | MIT | 一致 | LICENSE |
| node_modules/engine.io-parser | 5.2.3 | MIT | 一致 | LICENSE |
| node_modules/engine.io/node_modules/accepts | 1.3.8 | MIT | 一致 | LICENSE |
| node_modules/engine.io/node_modules/mime-db | 1.52.0 | MIT | 一致 | LICENSE |
| node_modules/engine.io/node_modules/mime-types | 2.1.35 | MIT | 一致 | LICENSE |
| node_modules/engine.io/node_modules/negotiator | 0.6.3 | MIT | 一致 | LICENSE |
| node_modules/es-define-property | 1.0.1 | MIT | 一致 | LICENSE |
| node_modules/es-errors | 1.3.0 | MIT | 一致 | LICENSE |
| node_modules/es-object-atoms | 1.1.1 | MIT | 一致 | LICENSE |
| node_modules/escape-html | 1.0.3 | MIT | 一致 | LICENSE |
| node_modules/etag | 1.8.1 | MIT | 一致 | LICENSE |
| node_modules/express | 5.2.1 | MIT | 一致 | LICENSE |
| node_modules/finalhandler | 2.1.1 | MIT | 一致 | LICENSE |
| node_modules/forwarded | 0.2.0 | MIT | 一致 | LICENSE |
| node_modules/fresh | 2.0.0 | MIT | 一致 | LICENSE |
| node_modules/function-bind | 1.1.2 | MIT | 一致 | LICENSE |
| node_modules/get-intrinsic | 1.3.0 | MIT | 一致 | LICENSE |
| node_modules/get-proto | 1.0.1 | MIT | 一致 | LICENSE |
| node_modules/gopd | 1.2.0 | MIT | 一致 | LICENSE |
| node_modules/has-symbols | 1.1.0 | MIT | 一致 | LICENSE |
| node_modules/hasown | 2.0.2 | MIT | 一致 | LICENSE |
| node_modules/http-errors | 2.0.1 | MIT | 一致 | LICENSE |
| node_modules/iconv-lite | 0.7.2 | MIT | 一致 | LICENSE |
| node_modules/inherits | 2.0.4 | ISC | 一致 | LICENSE |
| node_modules/ipaddr.js | 1.9.1 | MIT | 一致 | LICENSE |
| node_modules/is-promise | 4.0.0 | MIT | 一致 | LICENSE |
| node_modules/math-intrinsics | 1.1.0 | MIT | 一致 | LICENSE |
| node_modules/media-typer | 1.1.0 | MIT | 一致 | LICENSE |
| node_modules/merge-descriptors | 2.0.0 | MIT | 一致 | license |
| node_modules/mime-db | 1.54.0 | MIT | 一致 | LICENSE |
| node_modules/mime-types | 3.0.2 | MIT | 一致 | LICENSE |
| node_modules/ms | 2.1.3 | MIT | 一致 | license.md |
| node_modules/negotiator | 1.0.0 | MIT | 一致 | LICENSE |
| node_modules/object-assign | 4.1.1 | MIT | 一致 | license |
| node_modules/object-inspect | 1.13.4 | MIT | 一致 | LICENSE |
| node_modules/on-finished | 2.4.1 | MIT | 一致 | LICENSE |
| node_modules/once | 1.4.0 | ISC | 一致 | LICENSE |
| node_modules/parseurl | 1.3.3 | MIT | 一致 | LICENSE |
| node_modules/path-to-regexp | 8.3.0 | MIT | 一致 | LICENSE |
| node_modules/proxy-addr | 2.0.7 | MIT | 一致 | LICENSE |
| node_modules/qs | 6.15.0 | BSD-3-Clause | 一致 | LICENSE.md |
| node_modules/range-parser | 1.2.1 | MIT | 一致 | LICENSE |
| node_modules/raw-body | 3.0.2 | MIT | 一致 | LICENSE |
| node_modules/router | 2.2.0 | MIT | 一致 | LICENSE |
| node_modules/safer-buffer | 2.1.2 | MIT | 一致 | LICENSE |
| node_modules/send | 1.2.1 | MIT | 一致 | LICENSE |
| node_modules/serve-static | 2.2.1 | MIT | 一致 | LICENSE |
| node_modules/setprototypeof | 1.2.0 | ISC | 一致 | LICENSE |
| node_modules/side-channel | 1.1.0 | MIT | 一致 | LICENSE |
| node_modules/side-channel-list | 1.0.0 | MIT | 一致 | LICENSE |
| node_modules/side-channel-map | 1.0.1 | MIT | 一致 | LICENSE |
| node_modules/side-channel-weakmap | 1.0.2 | MIT | 一致 | LICENSE |
| node_modules/socket.io | 4.8.3 | MIT | 一致 | LICENSE |
| node_modules/socket.io-adapter | 2.5.6 | MIT | 一致 | LICENSE |
| node_modules/socket.io-parser | 4.2.6 | MIT | 一致 | LICENSE |
| node_modules/socket.io/node_modules/accepts | 1.3.8 | MIT | 一致 | LICENSE |
| node_modules/socket.io/node_modules/mime-db | 1.52.0 | MIT | 一致 | LICENSE |
| node_modules/socket.io/node_modules/mime-types | 2.1.35 | MIT | 一致 | LICENSE |
| node_modules/socket.io/node_modules/negotiator | 0.6.3 | MIT | 一致 | LICENSE |
| node_modules/statuses | 2.0.2 | MIT | 一致 | LICENSE |
| node_modules/toidentifier | 1.0.1 | MIT | 一致 | LICENSE |
| node_modules/type-is | 2.0.1 | MIT | 一致 | LICENSE |
| node_modules/undici-types | 7.18.2 | MIT | 一致 | LICENSE |
| node_modules/unpipe | 1.0.0 | MIT | 一致 | LICENSE |
| node_modules/vary | 1.1.2 | MIT | 一致 | LICENSE |
| node_modules/wrappy | 1.0.2 | ISC | 一致 | LICENSE |
| node_modules/ws | 8.18.3 | MIT | 一致 | LICENSE |
