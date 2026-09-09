# ZEN LAMP Memory Curator Extension

長いAI対話から「次に残す価値のある記憶」を整理し、**人間が承認する**ためのローカル動作ブラウザ拡張機能です。現在はRoom 3のContext Bridge Browser Runtimeと、Room 4のRoundtable Core証跡／比較／解釈提案層まで統合しています。

現在の拡張機能／Core開発ラインは **MC-01 + CB-06 + RT-04 / v0.3.0** です。

## 基本思想

目的は、すべてを覚えさせることではありません。

**AIが記憶候補を提案し、人間が何を残すかを決める。**

> 一つの家に、四つの部屋。

- **Chat Atlas** — 見る・理解する
- **Memory Curator** — 残す
- **Context Bridge** — 渡す
- **Roundtable AI** — 比べる
- **Human Gate** — 決める

## Room 2 — Memory Curator

1. 長いAI対話を貼り付ける、またはWebページ上の選択テキストを取得する。
2. MC-01のMemory Curatorプロンプトを生成する。
3. AIが返した `context_items` JSONを拡張機能へ戻す。
4. 各候補を `PROPOSED` ContextItemとしてローカル保存する。
5. 人間が各候補を **Approve / Reject** し、Memory Policyを決める。

AI側がJSONに `status` や承認情報を書いても、ContextItemのAuthorityとしては採用しません。

## Room 3 — Context Bridge

Popupの **Open Context Bridge** から、CB-01〜CB-06を一続きで操作できます。

Browser Runtimeの流れは、

`目的指定 → proposal_only候補 → HumanがContextItemを選択 → ContextPackage Human Gate → Exclusion / Redaction Human Gate → Canonical Provider Render → Copy Attempt → Human-confirmed Manual Handoff`

です。

Room 3には現在、以下を実装しています。

- **CB-01** — ContextPackage Schema、Lifecycle、Revision-bound Human Gate、Source Integrity、Freshness確認、Transfer Policy強制。
- **CB-02** — ローカル・決定論的なContext Selection Engine。順位付けは説明可能で、Authorityは `proposal_only`。
- **CB-03** — Exclusion / Redaction Layer。Humanが「伏せる／明示的に残す／項目全体を除外」を決定。
- **CB-04** — Generic / GPT / Claude / Gemini向けCanonical Renderer。同一Semantic Payload / Fingerprintを保持。
- **CB-05** — Transfer Audit / Outbound Handoff Boundary。`rendered_not_sent`、`attempted_not_confirmed`、Human-confirmed handoffを分離し、Provider側の実受領は `unverified` のまま扱う。
- **CB-06** — 上記を実ブラウザ画面へ統合するBrowser Runtime。Providerへの自動送信機能は追加しない。

CB-06の任意Session保存は、Project ID、ContextPackage ID、RedactionPlan ID、TransferView ID、画面設定などの**参照情報だけ**を保存し、Canonical JSONやRendered Provider PromptをSession Cacheへ重複保存しません。

## Room 4 — Roundtable AI

### RT-01 — Canonical Context Input

複数AIの回答を比較する前に、RT-01は全参加Providerが、同一のHuman承認済みContextPackage Revision、TransferView、Canonical JSON、Semantic Fingerprint、CB-04 Provider Renderingに結び付いていることを検証します。Provider構成もHuman承認済みRoundtable Targetと完全一致している必要があります。

RT-01が作る `RoundtableCanonicalInput` は、

- `status = prepared_not_executed`
- 1つのCanonical Semantic Payload
- 同じPayloadから導かれたProvider別Presentation Input
- 任意のCB-05 Human-confirmed Handoff Evidence

を持ちます。

RT-01では、**勝者、モデル順位、回答解釈、多数決、Human Decisionを作りません。**

### RT-02 — Provider Response Capture / Provenance

RT-02では、各Providerから返ってきた回答を、**解釈する前の生の証拠**として、対応するRT-01 Inputへ固定して保存します。

RT-02 v0.1は手動取得のみです。

- `manual_paste`
- `manual_file`
- `other_manual`

Provider名は人間が手動で帰属させるため、CaptureはHuman actorのみが実行できます。記録される主な状態は、

- `status = captured_raw_uninterpreted`
- `authority = evidence_only_no_interpretation`
- `source_authenticity = human_attested_unverified`

です。

`raw_response` は先頭・末尾の空白や改行を含め、**入力された文字列をそのまま保存**します。Trim、書き換え、要約、翻訳、分類は行いません。

各Responseは、RT-01 Input ID、Provider、CB-04 Rendering ID、ContextPackage Revision、TransferView ID、Canonical Semantic Fingerprintへ結び付けられます。

誤って取り込んだResponseを修正する場合、古い記録を上書きせず、新しいResponseを `supersedes_response_id` で結び付けます。過去のRaw Evidenceは残ります。

RT-02では、**回答の比較、要約、Agreement判定、モデル採点、多数決、勝者選定、Human Decisionを行いません。**

### RT-03 — Response Comparison / Disagreement Matrix

RT-03では、RT-01の参加Providerそれぞれについて**完全なRT-02 Responseを1件ずつ**選び、ローカル・決定論的に横比較します。

出力状態は、

- `status = compared_not_decided`
- `authority = descriptive_no_truth_claim`

です。

比較するのは、

- 全Providerに存在するExact Normalized Wording
- Providerごとに固有のWording Segment
- Provider間のPairwise Lexical Overlap
- Exact Shared Segment数
- Response LengthとLength Ratio

です。

日本語など空白で単語分割しづらい文章では、通常のWord Tokenに加えて**CJK Bigram**を使います。

ただし、Exact Shared Wordingは「同じ正規化文字列が存在する」という意味に限ります。Lexical Overlapも診断値であって、**意味的一致、事実の正しさ、モデル品質を表す値ではありません。**

そのためRT-03は必ず、

```text
interpretive_review.required = true
```

とします。

また、`winner`、`decision`、`truth`、`majority_choice`、`model_ranking`、`recommended_provider` といった決定フィールドを作りません。

**多数派であることを真実やHuman Authorityへ昇格させない**ことを、RT-03の不変条件にします。

### RT-04 — Claim / Assumption / Conflict Extraction

RT-04は、Room 4で初めて意味解釈を扱う層です。ただし、出力はあくまで**解釈候補**です。

RT-01 / RT-02 / RT-03の正規な証跡チェーンから外部解釈AI向けのGoverned Promptを生成し、返ってきたJSONを契約に沿って取り込みます。拡張機能自身がAI APIを自動実行するわけではありません。

取り込まれたRT-04 Outputは、

- `status = proposed_not_human_reviewed`
- `authority = interpretive_proposal_only`
- `source_authenticity = unverified_interpretive_output`
- `human_review.required = true`
- `human_review.state = pending`

です。

各Claim / Assumptionには、対応ProviderのRT-02 Raw Responseから**完全一致する原文Quoteを最低1つ**付ける必要があります。Core側がQuoteをRaw Response内で照合し、Response ID・文字位置を自分で確定します。存在しないQuoteは拒否します。同じQuoteが複数回ある場合は `occurrence` 指定が必須です。

Conflict候補は最低2Providerを含み、それぞれのProvider Sideは**同じProvider自身のEvidence-bound Claim / Assumption**だけを参照できます。

Conflictは必ず、

- `resolution = unresolved`
- `truth_status = not_evaluated`

のままです。

RT-04では `winner`、`decision`、`truth`、`model_ranking`、`recommended_provider`、`final_answer` などのフィールドを禁止します。

**3モデル一致でも真実にはしない。少数意見も落とさない。解釈候補はHuman Reviewを通す。** これをRT-04の基本境界とします。

## Local First / Privacy

この拡張機能自身はAI APIを呼び出しません。

会話、Draft、ContextItems、CoreのGovernance Recordは `chrome.storage.local` に保存されます。ユーザー自身がコピー／手動引渡しを行うまでは、外部AIへ送信されません。

CB-03のローカル検出は補助機能です。メールアドレス、電話番号らしい文字列、IPv4、代表的なCredential-like文字列、完全一致Custom Literalを扱い、Core側にはHuman-selected Manual Rangeもあります。**PIIや氏名を完全自動判定できるとは扱いません。**

RT-01自身はCanonical JSONやRendered Provider Promptを新しい永続Storeへ複製しません。RT-02は「そのResponse本文自体が証拠」であるためRaw Responseを意図的に保存します。RT-03はそのGoverned ResponseからRuntime Comparisonを生成し、RT-04はRuntime Interpretive Proposalを生成します。RT-04のAudit LogにはClaim本文、Assumption本文、Conflict説明、Evidence Quote、Raw Responseを重複保存せず、ID・Fingerprint・件数などのメタデータだけを記録します。

## Human Agency Core v0.1

共通基盤として以下を実装しています。

- [`Human Agency Core v0.1`](docs/HUMAN_AGENCY_CORE_v0.1.md)
- [`Project Schema v0.1`](docs/PROJECT_SCHEMA_v0.1.md)
- [`ContextItem Schema v0.1`](docs/CONTEXT_ITEM_SCHEMA_v0.1.md)
- [`4 Module Boundary Spec v0.1`](docs/MODULE_BOUNDARY_SPEC_v0.1.md)
- [`MC-01 Migration Plan`](docs/MC01_PLAN_v0.1.md)
- [`CB-01 ContextPackage / State Machine / Human Gate`](docs/CB01_CONTEXT_PACKAGE_v0.1.md)
- [`CB-02 Context Selection Engine`](docs/CB02_CONTEXT_SELECTION_ENGINE_v0.1.md)
- [`CB-03 Exclusion / Redaction Layer`](docs/CB03_EXCLUSION_REDACTION_v0.1.md)
- [`CB-04 Context Renderer`](docs/CB04_CONTEXT_RENDERER_v0.1.md)
- [`CB-05 Transfer Audit / Outbound Handoff Boundary`](docs/CB05_TRANSFER_AUDIT_OUTBOUND_BOUNDARY_v0.1.md)
- [`CB-06 Browser Runtime Integration`](docs/CB06_BROWSER_RUNTIME_v0.1.md)
- [`RT-01 Roundtable Canonical Context Input`](docs/RT01_ROUNDTABLE_CANONICAL_CONTEXT_INPUT_v0.1.md)
- [`RT-02 Provider Response Capture / Provenance`](docs/RT02_PROVIDER_RESPONSE_CAPTURE_v0.1.md)
- [`RT-03 Response Comparison / Disagreement Matrix`](docs/RT03_RESPONSE_COMPARISON_MATRIX_v0.1.md)
- [`RT-04 Claim / Assumption / Conflict Extraction`](docs/RT04_CLAIM_ASSUMPTION_CONFLICT_EXTRACTION_v0.1.md)

## インストール方法 Chrome / Edge

1. このリポジトリをダウンロードまたはクローンする。
2. `chrome://extensions/` または `edge://extensions/` を開く。
3. デベロッパーモードをオンにする。
4. **Load unpacked** を押す。
5. `manifest.json` が入っているフォルダを選択する。
6. Memory Curatorは通常のPopupから、Room 3は **Open Context Bridge** から開く。

RT-01〜RT-04は現時点ではCore Contractです。Room 4専用Browser Runtimeは後続工程で実装します。

## テスト

```bash
node --test tests/*.test.mjs
```

GitHub ActionsでもHuman Agency Core、MC-01 Contract、Context Bridge Core／CB-06 Browser Runtime、RT-01〜RT-04のRoundtable Contractを検証します。

## ライセンス

MIT License
