# ADR Index

Last updated: 2026-07-19

この索引は設計判断の入口です。実装の現在地は `MAINTENANCE_BACKLOG.md`、段階移行計画は `ARCHITECTURE_REFACTOR_PLAN.md` を正本とします。

## Current / Accepted

| ADR | Status | Current decision |
| --- | --- | --- |
| [Hostless restore design](HOSTLESS_RESTORE_DESIGN.md) | Accepted / provisional | Host-first recovery remains normal; an absent room may use the exact-agreement quorum fallback. Existing-room replacement and durable-authority claims remain forbidden. |
| [Modal stack policy](ADR_MODAL_STACK_POLICY.md) | Accepted | blocking modalはdeny-by-default。例外のないmodal lifecycle全面統合は行わない。 |
| [Restore trust boundary](ADR_RESTORE_TRUST_BOUNDARY.md) | Accepted | casual-trustとhost-only restore境界を維持。durable canonical state、hostless restore、追加のauthority変更は別設計とする。 |

今回のpure helper抽出、read-only reconnect state観測、実機結果の記録は既存Accepted判断の範囲内であり、新しいprotocol・restore authority・modal policyのADR変更はありません。

Current override (2026-07-19): the additive provisional hostless event surface
is implemented under the accepted design above. It does not add durable authority.

## Rejected

現在、独立ADRとしてRejectedに分類された文書はありません。検討案の不採用理由は各Accepted ADR内のoptionsに残します。

## Historical / Superseded

次の文書は履歴・棚卸しとして有用ですが、現在地の正本ではありません。

- `PROJECT_ISSUES.md`: historical issue inventory。
- `IMPLEMENTATION_ROADMAP.md`: historical implementation roadmap。
- `POST_IMPLEMENTATION_AUDIT.md`: 監査時点のsnapshot。
- `REFACTOR_PLAN.md`: 実施済みphaseログを含む。今後の優先順位は `MAINTENANCE_BACKLOG.md` と `ARCHITECTURE_REFACTOR_PLAN.md` を優先する。

## Status rules

- Current / Accepted: 現在の実装判断として有効。
- Rejected: 採用しない判断を独立記録したもの。
- Historical / Superseded: 文脈保存用。新しい実装根拠には単独で使わない。

