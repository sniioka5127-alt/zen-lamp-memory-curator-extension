# ZEN LAMP Memory Curator Extension

長いAI対話から「次に残す価値のある記憶」を整理し、**人間が承認する**ためのローカル動作ブラウザ拡張機能です。

現在の開発版は **MC-01 / v0.2.0** です。

## 基本思想

目的は、すべてを覚えさせることではありません。

**AIが記憶候補を提案し、人間が何を残すかを決める。**

Memory Curatorは HIRAKU Tools / Human Agency Workspace の「第2の部屋」です。

> 一つの家に、四つの部屋。

- **Chat Atlas** — 見る・理解する
- **Memory Curator** — 残す
- **Context Bridge** — 渡す
- **Roundtable AI** — 比べる
- **Human Gate** — 決める

## MC-01でできること

1. 長いAI対話を貼り付ける、またはWebページ上の選択テキストを取得する。
2. **Simple / Power User** と **INITIAL / UPDATE** を選ぶ。
3. Memory Curatorプロンプトを生成する。
4. ChatGPT、Claude、Geminiなど任意のAIへコピーする。
5. AIが返した `context_items` JSONを拡張機能へ戻す。
6. 各候補を `PROPOSED` ContextItemとしてローカル保存する。
7. 人間が各候補を **Approve / Reject** し、Memory Policyを選ぶ。
8. 承認済みContextItemsをJSONとしてコピーできる。

### UPDATEモード

既存Memory欄を空欄にした場合、そのProjectですでにHuman承認済みのローカルContextItemsを自動的に既存Memoryとして利用します。

旧形式のMemoryを持っている場合は、既存Memory欄へ貼り付けて段階移行できます。

## Human Gate

MC-01では、外部AIが返した内容を自動承認しません。

- AI出力 → `proposed`
- 人間のApprove → `approved`
- 人間のReject → `rejected`
- 承認済み内容を変更 → `needs_review`

AI側がJSONに `status` や承認状態を書いても、Memory CuratorはそれをContextItem承認情報として採用しません。

## MemoryとContextを分離

Memory Curatorは「何を残すか」だけを担当します。

旧版にあった **Next Chat Handoff / AI-specific Handoff** はMC-01のPrompt Contractから外しました。

次のAIへ何を渡すかは、今後 **Context Bridge** が担当します。

## Local First / Privacy

この拡張機能自身はAI APIを呼び出しません。

会話・ドラフト・ContextItemsは `chrome.storage.local` に保存されます。ユーザー自身がコピーしてAIサービスへ貼り付けるまでは外部AIへ送信されません。

## Human Agency Core v0.1

共通基盤として以下を実装しています。

- [`Human Agency Core v0.1`](docs/HUMAN_AGENCY_CORE_v0.1.md)
- [`Project Schema v0.1`](docs/PROJECT_SCHEMA_v0.1.md)
- [`ContextItem Schema v0.1`](docs/CONTEXT_ITEM_SCHEMA_v0.1.md)
- [`4 Module Boundary Spec v0.1`](docs/MODULE_BOUNDARY_SPEC_v0.1.md)
- [`MC-01 Migration Plan`](docs/MC01_PLAN_v0.1.md)

Reference Coreには、Project Store、ContextItem Store、Provenance、Memory / Transfer Policy、Freshness、Audit Logが含まれます。

## インストール方法 Chrome / Edge

1. このリポジトリをダウンロードまたはクローンする。
2. `chrome://extensions/` または `edge://extensions/` を開く。
3. デベロッパーモードをオンにする。
4. **Load unpacked** を押す。
5. `manifest.json` が入っているフォルダを選択する。

## テスト

```bash
node --test tests/*.test.mjs
```

GitHub ActionsでもHuman Agency CoreとMC-01 Contractを検証します。

## ライセンス

MIT License
