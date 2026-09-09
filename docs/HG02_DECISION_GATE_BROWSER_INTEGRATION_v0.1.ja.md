# HG-02 — Decision Gate Browser Integration v0.1

Status: **Implementation candidate**

## 目的

HG-02は、HG-01 Human Decision Recordを既存のRoundtable Browser Workspaceへ統合します。**第5のAI Roomは作りません。**

画面上でも次の境界を明示します。

```text
RT-05 確定済みHuman Interpretive Review
        ↓
──────── AIによる比較・解釈はここまで ────────
        ↓
Human Decision Gate
        ↓
HG-01 Human Decision Record
```

Roundtable AIの責任は「比べる」までで、最終的に「決める」のはHumanです。

## Browser Flow

1. 既存Roundtable RuntimeでRT-01〜RT-04を完了する。
2. RT-05でHumanが全Claim / Assumption / Conflictを明示的にレビューする。
3. RT-05が`finalized_human_review`になるまでDecision Gateは開かない。
4. HumanがDecision Questionを入力し、明示的にHG-01 Draftを開始する。
5. Humanが必要に応じて次を記録する。
   - `decided` / `deferred` / `no_action`;
   - 判断本文;
   - 判断理由;
   - RT-05でHumanがacceptした論点への任意参照;
   - 検討した代替案;
   - 未解決事項;
   - 条件・安全策;
   - 再検討条件または時点。
6. Humanが明示的にFinalizeする。
7. 確定済み判断はHumanがRevokeでき、変更する場合はSuperseding HG-01 Recordを新規作成する。

## Human Authority境界

HG-02は判断Authorityを`HumanDecisionRecordStore`へ委譲し、UIだけの簡易Decisionロジックを作りません。

次のものから最終判断を自動生成しません。

- Provider間の一致;
- Provider多数派;
- Lexical Overlap;
- RT-04の解釈候補;
- RT-05の`accept`。

RT-05の`accept`は「後続の検討材料としてHumanが採用した」という意味に限定されます。事実認定でも最終判断でもありません。

Decision Gateで補助論点として選択可能なのは、RT-05で`decision = accept`になった項目だけです。ただし、HumanはRoundtableの論点を一件も引用せずに判断を確定することもできます。

## Decision Semantics

有効な確定済みHG-01 Recordは、次を維持します。

```text
authority = human_authored_decision_record
decision_scope = human_judgment_only
truth_status = not_independently_verified
execution_status = not_executed_by_hg01
```

したがって、

```text
Humanが判断を記録した
≠ 客観的真実として独立検証された
≠ 外部で実行された
```

です。HG-02にはDecision Execution Connectorを追加しません。

## Upstream変更時の無効化

Provider Response、Comparison、Extraction、Human Interpretive Reviewなど上流Roundtable Chainが変わった場合、Browser Runtime上の現在Decision参照をクリアします。

これは既に永続保存されたHG-01 Recordを削除する処理ではありません。過去のDecision RecordはCore Storageに履歴として残ります。

新しいRT-05 Reviewを開始した場合も、古いReviewに結び付いたDecisionを「現在の判断」として画面に残さないため、Runtime上のDecision参照を解除します。

## Revoke / Supersede

確定済みHG-01 RecordはImmutableです。

- Human Revokeでも過去のRecordは履歴として保持する。
- 判断を変更する場合は`supersedes_decision_id`を持つ新Recordを作る。
- Browser UIから既存の確定済み／取消済みRecordを直接書き換えない。

## Local First / Transport境界

HG-02はProvider TransportやDecision Executionを追加しません。

追加しないもの：

- `fetch()`によるProvider呼び出し;
- XHR;
- Providerサイトへの自動送信;
- Provider API実行;
- 判断の自動実行;
- Model Winner;
- 多数派からの自動Decision。

GovernedなProvider / Interpretation表示についても`innerHTML`ではなくDOM text/value APIを維持します。

## Persistence境界

HG-01 Human Decision RecordはGoverned Core Storeへ永続保存されます。

一方、HG-02は新しいFull Roundtable Session Recoveryを追加しません。現行RT-06契約のとおり、RT-01、RT-03、RT-04はRuntime Artifactです。そのため未完了工程の途中で画面を閉じた場合、Roundtable Chain全体を完全復元できるとは扱いません。

将来のProject / Workspace Session Schemaで正式にRecoveryを設計し、安易なBrowser Cacheへ証跡を重複保存しない方針とします。

## Version

統合Browser LineはManifest **v0.5.0** へ進みます。

## Test境界

HG-02の自動テスト対象は、

- RT-05後への視覚的配置;
- HG-01 CoreへのAuthority委譲;
- Human Decision項目とLifecycle Control;
- Human-accepted Support Referenceだけの表示;
- Upstream変更時のRuntime Decision無効化;
- 自動Network / Execution経路がないこと;
- Manifest Version;
- JavaScript Syntax。

です。

これはCore / Browser ContractおよびStatic Testです。実Chrome / Edgeで最初から最後までクリックする実ブラウザSmoke Testではありません。
