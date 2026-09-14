# RL failure fixtures

ゲーム中の「対局を書き出す」で作成した匿名JSONを、次のコマンドで回帰fixtureへ変換します。

```sh
node scripts/import-rl-match-fixture.js \
    --input /path/to/machikoro-match.json \
    --output tests/fixtures/rl-failures/<label>.json \
    --label <label> \
    --note "再現した失敗"
```

新規fixtureは `expectation.status=pending-review` で入り、再現testと期待結果を追加してから採用します。
既存fixtureは `--force` を明示しない限り上書きされません。
