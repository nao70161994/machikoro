# 施設アート画像リソースの比較実験

このディレクトリの生成物は、カード卓で共有 SVG の描画再利用方法を比較するための候補です。採用済みの性能改善ではありません。既存実装も共有 defs と各カードの svg/use を使っており、path DOM の削減を目的とはしません。

オフラインで Python 3 標準ライブラリだけを使用します。

```sh
python3 scripts/generate-facility-art-images.py
python3 scripts/generate-facility-art-images.py --check
```

正本は `icons/facility-art.svg`。全50 symbolについて `icons/facility-art-images/<symbol-id>.svg` を生成します。元symbolの要素・属性・座標・色を保持し、参照するgradient等を再帰的に同じdefsへ収録します。rootのviewBoxは `0 0 160 80`、描画は元symbolへの `use`（width/height各100%）です。カード固有のトリミングは従来の外側viewBoxで扱い、生成物側で絵を変更しません。

外部参照、script、イベント属性、style属性、DOCTYPE/ENTITY、参照切れ、重複idを拒否します。元SVGの変更後は再生成が必要です。`--check` は書き込まず、全生成物のバイト一致と余分なSVGの有無を検査します。

生成のみでは描画・読み込み成功や性能改善を保証しません。WebKitでの初回読み込み、クローン、ズーム、特殊viewBox、同一画質と描画時間の比較は別途必要です。ランタイム、Service Worker、他表示モードはこの生成処理では変更しません。

## 実行時の比較候補

卓の所有カード・ランドマークと、にぎわい広場での共通市場だけ`renderTableFacilityArt`を使う。他モード・詳細・景観は従来`renderFacilityArt`を維持する。外側SVGのclass/viewBoxを保持し、中身を自己完結SVGのimageへ置き換える。読込エラーは既存useへ戻し、そのmotifはreloadまで再要求しない（失敗cache上限64件）。ゲーム状態・演出480ms・2RAF準備・既存1500ms観測条件は変更しない。

元useとimageの百分率/特殊viewBoxの意味は推測で同一扱いにせず、全施設/ランドマークを同位置で描画しthreshold0/maxDiffPixels0で比較する。SVG2の[use layout](https://www.w3.org/TR/SVG2/struct.html#UseElement)・[symbol geometry](https://www.w3.org/TR/SVG2/struct.html#SymbolElement)も確認した。fallback後のuse描画と次renderで失敗画像を再要求しないことを検査する。SWへのprecache追加と初回オフライン移行はまだ行っていないため、採用前の追加確認が必要。

native診断はceb2693fの3ファイルを戻した旧版1440建設3回、候補3回、画素比較/読込検査を同jobで順に実行する。DPR/画面/480ms/観測期限/判定は維持。先に旧版を行う固定順・少数試行の限界を明記し、全成功でも全Nightlyや長期安定の代替とはしない。既にpassした画像基準を自動更新する目的ではない。
