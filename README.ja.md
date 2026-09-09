# ZEN LAMP Memory Curator Extension

長いAI対話を「次に使える記憶」に整理するための、ローカル動作の簡易ブラウザ拡張機能です。

ZEN LAMP PROJECT の初期PoCです。

## できること

長いAIチャットには、次のような情報が混ざります。

- 固定ルール
- プロジェクト前提
- 発見メモ
- 一時メモ
- 持ち越さない情報
- 次チャット用引継ぎ

通常の要約だけでは不十分です。

目的は、すべてを残すことではありません。

**何を次に持ち越すかを、人間が選べるようにすることです。**

必要なのは、ただ大きな記憶ではありません。
記憶の選別です。

## プライバシー

この拡張機能は、会話データを外部サーバーへ送信しません。

AI APIも呼び出しません。

入力したテキストは、ユーザー自身がAIツールへコピーしない限り、ブラウザ内に留まります。

## 使い方

1. 長いAI対話を拡張機能に貼り付ける。
2. **Simple** または **Power User** を選ぶ。
3. **INITIAL** または **UPDATE** を選ぶ。
4. Memory Curatorプロンプトを生成する。
5. ChatGPT、Gemini、Claudeなどに貼り付ける。
6. AIが返した構造化された記憶候補を、人間が確認する。

## 新アーキテクチャ方針 — HIRAKU Tools

Memory Curatorは今後、より大きなHuman Agency workspaceの**「第2の部屋」**として整理します。

> 一つの家に、四つの部屋。

- **Chat Atlas** — 何が起きたかを見る・理解する
- **Memory Curator** — 何を残すか決める
- **Context Bridge** — 何を今回渡すか決める
- **Roundtable AI** — 複数AIを比較し、人間の判断を残す

製品体験は一つのWorkspaceへ統合しても、内部アーキテクチャでは4モジュールの責任を混ぜません。

v0.1の基礎仕様は以下です。

- [`Human Agency Core v0.1`](docs/HUMAN_AGENCY_CORE_v0.1.md)
- [`Project Schema v0.1`](docs/PROJECT_SCHEMA_v0.1.md)
- [`ContextItem Schema v0.1`](docs/CONTEXT_ITEM_SCHEMA_v0.1.md)
- [`4 Module Boundary Spec v0.1`](docs/MODULE_BOUNDARY_SPEC_v0.1.md)

### 移行上の注意

現在公開中の拡張機能には、旧設計として **Next Chat Handoff** の生成責任がMemory Curator内に残っています。新設計では、この責任を **Context Bridge** へ移します。

ただし、いきなり既存コードを書き換えず、まずHuman Agency Coreと4モジュール境界を仕様として固定してから段階的に移行します。

## インストール方法 Chrome / Edge

1. このリポジトリをダウンロードまたはクローンする。
2. `chrome://extensions/` または `edge://extensions/` を開く。
3. デベロッパーモードをオンにする。
4. **Load unpacked** を押す。
5. `manifest.json` が入っているフォルダを選択する。

## 思想

これは答えを出す道具ではありません。

AIとの長い会話から、何を記憶し、何を更新し、何を忘れるかを人間が選ぶための補助ツールです。

AIに勝手に覚えさせるのではなく、人間が持ち越す記憶を選ぶ。

## ライセンス

MIT License
