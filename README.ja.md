# ZEN LAMP Memory Curator Extension

長いAI対話から「次に残す価値のある記憶」を整理し、**人間が承認する**ためのローカル動作ブラウザ拡張機能です。現在はRoom 3のContext Bridge Browser Runtimeも統合しています。

現在の拡張機能開発版は **MC-01 + CB-06 / v0.3.0** です。

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

Popupに **Open Context Bridge** を追加し、専用画面からCB-01〜CB-06を一続きで操作できます。

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

## Local First / Privacy

この拡張機能自身はAI APIを呼び出しません。

会話、Draft、ContextItems、CoreのGovernance Recordは `chrome.storage.local` に保存されます。ユーザー自身がコピー／手動引渡しを行うまでは、外部AIへ送信されません。

CB-03のローカル検出は補助機能です。メールアドレス、電話番号らしい文字列、IPv4、代表的なCredential-like文字列、完全一致Custom Literalを扱い、Core側にはHuman-selected Manual Rangeもあります。**PIIや氏名を完全自動判定できるとは扱いません。**

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

## インストール方法 Chrome / Edge

1. このリポジトリをダウンロードまたはクローンする。
2. `chrome://extensions/` または `edge://extensions/` を開く。
3. デベロッパーモードをオンにする。
4. **Load unpacked** を押す。
5. `manifest.json` が入っているフォルダを選択する。
6. Memory Curatorは通常のPopupから、Room 3は **Open Context Bridge** から開く。

## テスト

```bash
node --test tests/*.test.mjs
```

GitHub ActionsでもHuman Agency Core、MC-01 Contract、Context Bridge Core、CB-06 Browser Runtime Contractを検証します。

## ライセンス

MIT License
