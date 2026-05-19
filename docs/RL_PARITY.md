# RL Parity Notes

作成日: 2026-05-19

## 方針

実ゲームの正本は JavaScript の `GameManager` です。Python RL 環境は学習速度と状態表現のために一部を集約近似しているため、採用判断では次を分けて扱います。

- JS runtime / browser export の不一致: バグとして扱う。
- Python training env の既知近似: 診断 report に明示し、勝率や方策傾向を見るときの注意点として扱う。

## 追加した診断

`scripts/rl/parity_report.py` は軽量な parity report を出力します。

```sh
python3 -m scripts.rl.parity_report
python3 -m scripts.rl.parity_report --format text
```

現在は、ワイナリーの集約近似を明示します。Browser `GameManager` はカード実体単位で休業復帰と発動を処理しますが、Python RL 環境はカード枚数を集約しているため、休業ワイナリーが混じる局面では gain / dormant count がずれることがあります。

## 運用

- RL model adoption review では、`npm run test:rl` と合わせて parity report を確認する。
- ワイナリー寄りのモデルを評価する場合は、report の known approximation を registry / review の注意点に含める。
- 未知の trace 差分が出た場合は `npm run compare-rl-match-trace` で最初にズレた step を確認し、既知近似か実装バグかを分ける。
