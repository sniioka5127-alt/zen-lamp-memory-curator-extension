# WS-01 — Integrated Project Workspace / One House Shell v0.1

Status: **Implementation candidate**

## 目的

WS-01は、HIRAKUの4つのRoomを1つのHuman Project中心画面から見渡し、行き来できる共通Workspaceを作ります。

採用済みの基本原則は、

> **Product is integrated. Architecture is separated.**

です。

One House Workspaceは「一つの家の共通玄関・廊下」に相当します。第5のAI Roomではなく、各ModuleのCore Authorityを上書きする上位AIでもありません。

## Product Model

```text
Human Project
 ├ Room 1 — Chat Atlas       / 見る
 ├ Room 2 — Memory Curator   / 残す
 ├ Room 3 — Context Bridge   / 渡す
 ├ Room 4 — Roundtable AI    / 比べる
 └ Human Gate                / 決める
```

中心はAI ProviderでもChat Threadでもなく、Humanが定義したProjectです。

## WS-01が行うこと

WS-01は次を行えます。

- `ProjectStore`から非Archive Projectを一覧表示する;
- Human Projectを新規作成する;
- 既存Human Gateを通じてProject Statusを`active` / `paused` / `completed`へ変更する;
- 現在選択中のProject IDだけを軽量Workspace Stateとして保存する;
- Project単位で既存Governed Core Recordの件数を表示する;
- 選択中Projectを指定してRoom 2 / 3 / 4を開く;
- Room 4の後にHuman Gateの状況を見せる。

一方、WS-01は次を行いません。

- ContextItemの承認;
- Memory Policy / Transfer Policyの変更;
- ContextPackage / TransferViewの承認;
- Providerへの自動送信;
- Provider Responseの解釈・順位付け;
- 多数派をTruthへ変換すること;
- Human DecisionをAIが作成・確定すること;
- Decisionの自動実行;
- Governed Artifact本文を新しいWorkspace Cacheへ複製すること。

## Project Center

Project Authorityには既存の`ProjectStore`だけを使います。

WS-01専用の第2 Project Schemaは作りません。

Workspaceでは、

- Project ID;
- Status;
- Local First;
- Human Gate Required;
- 各Roomに存在するGoverned Artifact件数

を表示します。

WS-01 v0.1ではArchive操作は画面に出しません。現行CoreではArchive済みProjectはImmutableになるため、Dashboard上の気軽な操作にしないためです。

## Room Navigation

選択したProject IDをLocal Extension URLへ`?project=<project_id>`として渡します。

- Room 2: `popup.html?project=...`
- Room 3: `context-bridge.html?project=...`
- Room 4: `roundtable.html?project=...`
- Human Gate: `roundtable.html?project=...#human-decision-gate`

Room 2 / 3 / 4のGovernance責任は従来どおり各Module側に残ります。

### Room 1境界

Chat AtlasはWS-01時点では`sniioka5127-alt/zen-lamp-chat-atlas`で別Version管理を続けます。

One House ShellはRoom 1をProduct Architecture上の一室として表示しますが、そのRuntime実装をHuman Agency Core Repoへコピーしません。

将来のAT / WS工程でProject-aware Handoff Contractを定義できますが、WS-01ではRepo境界を崩しません。

## Workspace Summary

Workspaceは既存Core Storeの件数だけを読みます。Artifact本文をWorkspace Stateへ複製しません。

現在の対象Prefixは、

- `context-item:`
- `context-package:`
- `redaction-view:`
- `roundtable-response:`
- `roundtable-interpretive-review:`
- `human-decision-record:`

です。

WS-01独自の永続Keyは、

```text
ws01CurrentProjectId
```

だけです。

これはUI用の軽量Stateであり、Memory・Evidence・Decision・ProvenanceはCore Objectへ保持するというProject Schemaの原則を維持します。

## Human Agency Invariants

```text
Projectを選択した
≠ Contextを承認した
≠ Contextを渡した
≠ Provider Responseを検証した
≠ InterpretationをTruthとして認定した
≠ Human Decisionを確定した
≠ Decisionを実行した
```

統合Workspaceになっても、これらの状態を一つに潰してはいけません。

## Local First / Network境界

Workspace自身はAI APIを呼びません。Project内容を外部へ自動送信しません。

Chat Atlas Repositoryを開く操作はHumanによる明示的Navigationです。外部URLへProject内容を付加しません。

Room 2 / 3 / 4はLocal Extension URLであり、渡すのはLocal Project IDだけです。

## Version

WS-01でIntegrated Browser LineをManifest **v0.6.0**へ進めます。

## Test境界

自動テストでは、

- One House Shell構造;
- 4 Room + Human Gate;
- 既存ProjectStore Authorityの再利用;
- 選択Project IDだけの軽量保存;
- Governed Store PrefixによるProject Summary;
- Room 2〜4のProject Deep Link;
- Workspace内にProvider `fetch()` / XHR / 自動実行経路がないこと;
- Room 2 / 3 / 4のProject-aware Bootstrap;
- Manifest v0.6.0;
- JavaScript Syntax

を確認します。

実Chrome / Edgeで全工程をクリックする実ブラウザSmoke Testは別工程です。
