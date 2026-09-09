# HG-01｜Human Decision Record / Decision Gate v0.1

Status: **Implementation candidate**

## 目的

HG-01は、Roundtable AIの比較・解釈レビューを受けたあとに、**最終判断そのものを人間の権限として記録するHuman Gate**です。

Human Gateは第5のRoomではありません。

```text
RT-05 finalized Human review
        ↓
HG-01 Human Decision draft
        ↓
人間が判断・理由・代替案・留保を記録
        ↓
Human Gate finalize
        ↓
finalized_human_decision
```

## 最重要不変条件

```text
RT-05 accept
≠ 真実
≠ AIの勝者
≠ 最終意思決定

HG-01 finalized decision
= 人間が行った判断の正式記録
≠ 外部アクション実行済み
≠ 事実の独立検証済み
```

## 前提

HG-01は**有効なRT-05 finalized Human review**からのみ開始できます。

Decision Recordは次の証跡へ固定されます。

- Human Project
- RT-01 Input ID
- RT-03 Comparison ID
- RT-04 Extraction ID
- RT-05 Review ID / Revision
- ContextPackage ID / Revision
- TransferView ID
- Semantic Fingerprint
- Interpretation Fingerprint
- RT-05 Review Fingerprint

元となるRT-05 Reviewが後からRevokeされた場合、HG-01 Recordは履歴として残りますが、現在有効な最終判断としてのIntegrity Checkは通りません。

## 状態

```text
draft_human_decision
        ↓
finalized_human_decision
        ↓
revoked_human_decision
```

確定済み・取消済みRecordは上書きしません。判断を変える場合は新しいRecordを作り、必要に応じて `supersedes_decision_id` で旧Recordへ接続します。

## Disposition

HG-01 v0.1は次を持ちます。

- `pending` — Draftのみ
- `decided` — 人間が判断を確定
- `deferred` — 人間が明示的に判断を延期
- `no_action` — 何もしないことを人間が判断

Finalizeには `decision_text` と `rationale` が必須です。

`deferred` の場合はさらに、

- `revisit.trigger`
- `revisit.at`

のどちらかを必須にします。単なる「保留」のまま放置されることを避けるためです。

## 人間が記録できる内容

- `decision_question`
- `disposition`
- `decision_text`
- `rationale`
- `supporting_subject_refs`
- `alternatives_considered`
- `unresolved_questions`
- `conditions`
- `revisit`

これらはHuman Decision領域です。AI / system actorはHG-01の作成・更新・確定・取消・差し替えを実行できません。

## RT-05参照

`supporting_subject_refs` は本文の複製ではなく参照だけを保存します。

Supporting Referenceとして使えるのは、RT-05でHumanが `accept` したClaim / Assumption / Conflictだけです。

`reject` / `hold` された解釈を、後から「判断を支えた採用済み論点」として勝手に昇格させることはできません。

ただしHumanはRoundtable参照を1件も使わずに判断することもできます。Roundtableは判断材料であり、判断者ではありません。

## Authorityと実行境界

HG-01 Recordは常に、

```text
authority = human_authored_decision_record
decision_scope = human_judgment_only
truth_status = not_independently_verified
execution_status = not_executed_by_hg01
```

を持ちます。

したがって `finalized_human_decision` は「人間の判断が正式に記録された」という意味であり、

- 外部システムへの送信
- 契約・発注・公開
- Policy変更
- Memoryへの自動登録

などが実行済みという意味ではありません。

## Revision-bound Human Gate

更新のたびにRevisionを上げます。

Finalize時は、

- `human_gate.state = finalized`
- `human_gate.finalized_revision = record.revision`
- `human_gate.finalized_at`
- `human_gate.finalized_by`

を固定します。

確定後の同一Record編集は禁止です。

## Audit / Privacy

HG-01本体は判断そのものが証跡なので、Decision TextやRationaleを保存します。

一方Audit Logは本文を重複保存しません。

Auditへ複製しないもの：

- Decision Question
- Decision Text
- Rationale
- Alternatives
- Unresolved Questions
- Conditions
- Revoke理由の自由記述

AuditはID、Revision、Disposition、Fingerprint、件数、Execution Statusなどのメタデータだけを保持します。

## HG-01で行わないこと

- AIの勝者決定
- 多数決＝真実
- 事実確認の代行
- 判断内容の自動実行
- Memory Policy変更
- Decision ContextItemの自動承認
- 他AIへの自動転送

これらは別の明示的なGovernance境界で扱います。
