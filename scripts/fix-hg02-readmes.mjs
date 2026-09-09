import fs from "node:fs";

function patch(path, replacements) {
  let text = fs.readFileSync(path, "utf8");
  for (const [from, to] of replacements) {
    if (typeof from === "string") {
      if (text.includes(from)) text = text.replace(from, to);
    } else {
      text = text.replace(from, to);
    }
  }
  fs.writeFileSync(path, text);
}

patch("README.md", [
  [
    '- [`HG-01 Human Decision Record / Decision Gate`](docs/HG01_HUMAN_DECISION_RECORD_v0.1.md)\n',
    '- [`HG-01 Human Decision Record / Decision Gate`](docs/HG01_HUMAN_DECISION_RECORD_v0.1.md)\n- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.md)\n'
  ],
  [
    'HG-01 is currently a Core contract; a dedicated Human Decision browser surface can be added as a later phase without turning Human Gate into a fifth room.\n',
    'HG-02 integrates the Human Decision Gate directly into the existing Roundtable workspace after RT-05; Human Gate remains a system boundary rather than a fifth AI room.\n'
  ],
  [
    'GitHub Actions validates the Human Agency Core, MC-01 contract, Context Bridge Core / browser runtime, RT-01 through RT-06 Roundtable contracts, and HG-01 Human Decision Gate.',
    'GitHub Actions validates the Human Agency Core, MC-01 contract, Context Bridge Core / browser runtime, RT-01 through RT-06 Roundtable contracts, and HG-01 / HG-02 Human Decision Gate contracts.'
  ]
]);

patch("README.ja.md", [
  [
    '- [`RT-05 Interpretive Review / Human Gate`](docs/RT05_INTERPRETIVE_REVIEW_HUMAN_GATE_v0.1.md)\n',
    '- [`RT-05 Interpretive Review / Human Gate`](docs/RT05_INTERPRETIVE_REVIEW_HUMAN_GATE_v0.1.md)\n- [`RT-06 Roundtable Browser Runtime Integration`](docs/RT06_ROUNDTABLE_BROWSER_RUNTIME_v0.1.md)\n- [`HG-01 Human Decision Record / Decision Gate`](docs/HG01_HUMAN_DECISION_RECORD_v0.1.ja.md)\n- [`HG-02 Decision Gate Browser Integration`](docs/HG02_DECISION_GATE_BROWSER_INTEGRATION_v0.1.ja.md)\n'
  ],
  [
    '6. Memory Curatorは通常のPopupから、Room 3は **Open Context Bridge** から開く。',
    '6. Memory Curatorは通常のPopupから、Room 3は **Open Context Bridge**、Room 4とHuman Decision Gateは **Open Roundtable AI** から開く。'
  ],
  [
    'RT-01〜RT-05は現時点ではCore Contractです。Room 4専用Browser Runtimeは後続工程で実装します。\n',
    'RT-06でRoom 4専用Browser Runtimeを実装済みで、HG-02によりRT-05直後へHuman Decision Gateも統合済みです。\n'
  ],
  [
    'GitHub ActionsでもHuman Agency Core、MC-01 Contract、Context Bridge Core／CB-06 Browser Runtime、RT-01〜RT-05のRoundtable Contractを検証します。',
    'GitHub ActionsではHuman Agency Core、MC-01、Context Bridge Core／CB-06 Browser Runtime、RT-01〜RT-06 Roundtable Contract、HG-01／HG-02 Human Decision Gate Contractを検証します。'
  ],
  [
    'RT-01自身はCanonical JSONやRendered Provider Promptを新しい永続Storeへ複製しません。RT-02は「そのResponse本文自体が証拠」であるためRaw Responseを意図的に保存します。RT-03はそのGoverned ResponseからRuntime Comparisonを生成し、RT-04はRuntime Interpretive Proposalを生成します。RT-05はHuman Reviewの決定Artifactを保存しますが、Claim本文、Assumption本文、Conflict説明、Evidence Quote、Raw ResponseをReview RecordやAudit Logへ重複保存しません。',
    'RT-01自身はCanonical JSONやRendered Provider Promptを新しい永続Storeへ複製しません。RT-02は「そのResponse本文自体が証拠」であるためRaw Responseを意図的に保存します。RT-03はそのGoverned ResponseからRuntime Comparisonを生成し、RT-04はRuntime Interpretive Proposalを生成します。RT-05はHuman Reviewの決定Artifactを保存しますが、Claim本文、Assumption本文、Conflict説明、Evidence Quote、Raw ResponseをReview RecordやAudit Logへ重複保存しません。HG-01はHuman判断本文そのものをGoverned Artifactとして保存しますが、Audit Logには判断本文や理由を重複保存しません。'
  ]
]);

console.log("HG-02 README consistency migration applied.");
