# RL Model Compression Report

- generatedAt: 2026-09-13
- method: gzip level 9, Brotli quality 9 (text)
- recommendation: JSON schema and runtime remain unchanged. Prefer HTTP Brotli with gzip fallback; keep raw artifact SHA-256 verification after decompression.

| Model | Active | Raw | gzip | Brotli | gzip/raw | Brotli/raw |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| RL（多人数・上位3） | yes | 11.47 MiB | 5.06 MiB | 4.74 MiB | 44.1% | 41.3% |
| RL（4人・目標判断強化） | yes | 12.08 MiB | 5.14 MiB | 4.82 MiB | 42.5% | 39.9% |
| RL（4人・strength） | no | 12.08 MiB | 5.14 MiB | 4.82 MiB | 42.5% | 39.9% |
| RL（農業・ワイナリー） | yes | 10.40 MiB | 4.59 MiB | 4.31 MiB | 44.2% | 41.4% |
| RL（寿司・倉庫） | no | 10.41 MiB | 4.59 MiB | 4.31 MiB | 44.1% | 41.4% |
| RL（バーガー・倉庫） | no | 10.38 MiB | 4.59 MiB | 4.30 MiB | 44.2% | 41.4% |

## Production total

- raw: 33.96 MiB
- gzip: 14.79 MiB (43.5%)
- Brotli: 13.87 MiB (40.8%)

This report evaluates transport/precompression only. It does not quantize weights or change model/runtime semantics.
