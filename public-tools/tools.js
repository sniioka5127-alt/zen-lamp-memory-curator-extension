(() => {
  "use strict";

  const STORAGE_KEY = "zenLampToolsLanguage";

  const COPY = {
    ja: {
      heroTitle: "一つの家に、四つの部屋。",
      heroLead: "AIが高度化しても、人間が判断者であり続けるための道具群です。製品は一つ、役割は分離し、最後に決めるのは人間です。",
      openAtlas: "Chat Atlasを開く",
      viewExtension: "One House拡張機能を見る",
      principleLabel: "設計原則",
      principle1: "中心はAIではなくHuman Project",
      principle2: "AIは提案し、人間が承認する",
      principle3: "Local First / Provenance First",
      flowEyebrow: "HUMAN AGENCY FLOW",
      flowTitle: "見る → 残す → 渡す → 比べる → 決める",
      see: "見る",
      remember: "残す",
      transfer: "渡す",
      compare: "比べる",
      decide: "決める",
      roomsEyebrow: "FOUR ROOMS",
      roomsTitle: "四つの部屋は、仕事を混ぜません。",
      roomsLead: "同じHuman Projectを軸にしながら、それぞれの責任範囲を明確に分けます。",
      publicWeb: "PUBLIC WEB",
      browserExtension: "BROWSER EXTENSION",
      atlasDesc: "長いAIチャットを、要約ではなく思考の地図として見直します。枝分かれ、転換点、未解決の問いを残します。",
      memoryDesc: "AI会話から残す価値のある記憶候補を作り、人間がApprove / Rejectしてから保存します。AIが勝手に記憶を確定しません。",
      bridgeDesc: "承認済みContextから、目的に必要なものだけを選び、削減・秘匿して次のAIへ渡します。MemoryとContextを分離します。",
      roundtableDesc: "GPT / Claude / Geminiなどへ同じContextを渡し、一致・相違・前提・対立候補を比較します。多数決を真実にはしません。",
      sourceCode: "Source",
      gateTitle: "最後に決めるのは、人間です。",
      gateLead: "Roundtableの比較結果は判断材料です。採用・保留・却下、理由、代替案、再検討条件をHuman Decision Recordとして人間が記録します。",
      gateRuleA: "AIの一致",
      gateRuleB: "真実・決定",
      promiseEyebrow: "BOUNDARIES",
      promiseTitle: "One Houseが守る境界",
      promise1Title: "提案と承認を分ける",
      promise1Body: "PROPOSEDはAPPROVEDではありません。",
      promise2Title: "記憶と転送を分ける",
      promise2Body: "残すものと、次のAIへ渡すものは別に選びます。",
      promise3Title: "比較と決定を分ける",
      promise3Body: "複数AIが一致しても、自動で結論にはしません。",
      footerNote: "Human Agencyを保つための公開ツール群。Local Firstを基本に設計しています。",
      zenLampHome: "ZEN LAMP Home"
    },
    en: {
      heroTitle: "One house. Four rooms.",
      heroLead: "A set of tools designed so humans can remain the decision-makers even as AI becomes more capable. One product, separated responsibilities, and a final Human Gate.",
      openAtlas: "Open Chat Atlas",
      viewExtension: "View One House Extension",
      principleLabel: "Architecture principle",
      principle1: "The center is the Human Project, not an AI provider",
      principle2: "AI proposes; humans review and approve",
      principle3: "Local First / Provenance First",
      flowEyebrow: "HUMAN AGENCY FLOW",
      flowTitle: "See → Remember → Transfer → Compare → Decide",
      see: "See",
      remember: "Remember",
      transfer: "Transfer",
      compare: "Compare",
      decide: "Decide",
      roomsEyebrow: "FOUR ROOMS",
      roomsTitle: "Four rooms. No blurred responsibilities.",
      roomsLead: "All rooms belong to the same Human Project while keeping their authority boundaries separate.",
      publicWeb: "PUBLIC WEB",
      browserExtension: "BROWSER EXTENSION",
      atlasDesc: "Review long AI conversations as a map of thinking, not just a summary. Preserve branches, turning points, and unresolved questions.",
      memoryDesc: "Create memory candidates from AI conversations, then let a human Approve or Reject them before they persist. AI does not confirm memory on its own.",
      bridgeDesc: "Select only the approved context needed for the next task, reduce or redact it, and transfer it without collapsing Memory into Context.",
      roundtableDesc: "Give GPT, Claude, Gemini, or other models the same Context and compare agreements, differences, assumptions, and possible conflicts. Majority is not truth.",
      sourceCode: "Source",
      gateTitle: "The final decision stays human.",
      gateLead: "Roundtable results are decision material, not the decision itself. Humans record adoption, rejection, deferral, rationale, alternatives, and revisit conditions in a Human Decision Record.",
      gateRuleA: "AI agreement",
      gateRuleB: "truth or decision",
      promiseEyebrow: "BOUNDARIES",
      promiseTitle: "Boundaries One House preserves",
      promise1Title: "Separate proposal from approval",
      promise1Body: "PROPOSED is not APPROVED.",
      promise2Title: "Separate memory from transfer",
      promise2Body: "What remains and what travels are chosen separately.",
      promise3Title: "Separate comparison from decision",
      promise3Body: "Even when several AIs agree, no conclusion is adopted automatically.",
      footerNote: "Public tools for preserving Human Agency, designed around a Local First approach.",
      zenLampHome: "ZEN LAMP Home"
    },
    zh: {
      heroTitle: "一座房子，四个房间。",
      heroLead: "这是一组为了让人在AI不断进步的时代仍然保持最终判断权而设计的工具。产品是一体的，职责是分离的，最后由人来决定。",
      openAtlas: "打开 Chat Atlas",
      viewExtension: "查看 One House 扩展",
      principleLabel: "设计原则",
      principle1: "中心是 Human Project，而不是AI提供商",
      principle2: "AI提出建议，人类审核并批准",
      principle3: "Local First / Provenance First",
      flowEyebrow: "HUMAN AGENCY FLOW",
      flowTitle: "看见 → 保留 → 传递 → 比较 → 决定",
      see: "看见",
      remember: "保留",
      transfer: "传递",
      compare: "比较",
      decide: "决定",
      roomsEyebrow: "FOUR ROOMS",
      roomsTitle: "四个房间，不混淆职责。",
      roomsLead: "所有房间围绕同一个 Human Project 工作，同时严格区分各自的权限边界。",
      publicWeb: "PUBLIC WEB",
      browserExtension: "BROWSER EXTENSION",
      atlasDesc: "把长篇AI对话作为思考地图重新查看，而不只是做摘要。保留分支、转折点和未解决的问题。",
      memoryDesc: "从AI对话中生成记忆候选项，由人类批准或拒绝后才保存。AI不会自行确认记忆。",
      bridgeDesc: "只选择下一项任务真正需要的已批准Context，进行精简或遮蔽后再传递，并保持Memory与Context分离。",
      roundtableDesc: "把同一份Context交给GPT、Claude、Gemini等模型，比较一致点、差异、前提和潜在冲突。多数意见不等于真相。",
      sourceCode: "Source",
      gateTitle: "最后作决定的人，是人类。",
      gateLead: "Roundtable的比较结果只是判断材料。采用、拒绝、暂缓、理由、替代方案和重新审视条件，都由人类记录在Human Decision Record中。",
      gateRuleA: "AI一致",
      gateRuleB: "真相或决定",
      promiseEyebrow: "BOUNDARIES",
      promiseTitle: "One House守住的边界",
      promise1Title: "区分建议与批准",
      promise1Body: "PROPOSED 不等于 APPROVED。",
      promise2Title: "区分记忆与传递",
      promise2Body: "要保留的内容与要交给下一个AI的内容分别选择。",
      promise3Title: "区分比较与决定",
      promise3Body: "即使多个AI意见一致，也不会自动形成结论。",
      footerNote: "为了维护Human Agency而公开的工具，采用Local First的基本设计。",
      zenLampHome: "ZEN LAMP Home"
    },
    ko: {
      heroTitle: "하나의 집, 네 개의 방.",
      heroLead: "AI가 더 강력해져도 인간이 최종 판단자로 남을 수 있도록 설계한 도구 모음입니다. 제품은 하나지만 책임은 분리되고, 마지막 결정은 Human Gate에서 사람이 내립니다.",
      openAtlas: "Chat Atlas 열기",
      viewExtension: "One House 확장 보기",
      principleLabel: "설계 원칙",
      principle1: "중심은 AI가 아니라 Human Project",
      principle2: "AI는 제안하고 인간이 검토·승인",
      principle3: "Local First / Provenance First",
      flowEyebrow: "HUMAN AGENCY FLOW",
      flowTitle: "보기 → 남기기 → 전달하기 → 비교하기 → 결정하기",
      see: "보기",
      remember: "남기기",
      transfer: "전달하기",
      compare: "비교하기",
      decide: "결정하기",
      roomsEyebrow: "FOUR ROOMS",
      roomsTitle: "네 개의 방은 책임을 섞지 않습니다.",
      roomsLead: "같은 Human Project를 중심에 두되 각 방의 권한과 책임 경계를 분명하게 유지합니다.",
      publicWeb: "PUBLIC WEB",
      browserExtension: "BROWSER EXTENSION",
      atlasDesc: "긴 AI 대화를 단순 요약이 아니라 사고의 지도로 다시 봅니다. 분기, 전환점, 해결되지 않은 질문을 보존합니다.",
      memoryDesc: "AI 대화에서 기억 후보를 만들고 사람이 Approve / Reject한 뒤에만 저장합니다. AI가 스스로 기억을 확정하지 않습니다.",
      bridgeDesc: "승인된 Context 중 다음 작업에 필요한 것만 선택하고 축소·가림 처리한 뒤 전달합니다. Memory와 Context는 분리합니다.",
      roundtableDesc: "GPT, Claude, Gemini 등에 동일한 Context를 주고 일치점, 차이, 전제, 잠재 충돌을 비교합니다. 다수 의견을 진실로 취급하지 않습니다.",
      sourceCode: "Source",
      gateTitle: "마지막 결정은 사람이 내립니다.",
      gateLead: "Roundtable의 비교 결과는 판단 자료일 뿐 결정 자체가 아닙니다. 채택, 거절, 보류, 이유, 대안, 재검토 조건을 사람이 Human Decision Record에 기록합니다.",
      gateRuleA: "AI의 일치",
      gateRuleB: "진실 또는 결정",
      promiseEyebrow: "BOUNDARIES",
      promiseTitle: "One House가 지키는 경계",
      promise1Title: "제안과 승인을 분리",
      promise1Body: "PROPOSED는 APPROVED가 아닙니다.",
      promise2Title: "기억과 전달을 분리",
      promise2Body: "남길 것과 다음 AI로 보낼 것을 따로 선택합니다.",
      promise3Title: "비교와 결정을 분리",
      promise3Body: "여러 AI가 동의해도 자동으로 결론을 채택하지 않습니다.",
      footerNote: "Human Agency를 지키기 위한 공개 도구 모음으로, Local First를 기본 원칙으로 설계했습니다.",
      zenLampHome: "ZEN LAMP Home"
    }
  };

  const NORMALIZED_LANG = {
    ja: "ja",
    en: "en",
    zh: "zh",
    "zh-cn": "zh",
    "zh-tw": "zh",
    ko: "ko"
  };

  function normalizeLanguage(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return null;
    if (NORMALIZED_LANG[raw]) return NORMALIZED_LANG[raw];
    const base = raw.split("-")[0];
    return NORMALIZED_LANG[base] || null;
  }

  function applyLanguage(lang, { persist = true } = {}) {
    const normalized = normalizeLanguage(lang) || "ja";
    const copy = COPY[normalized] || COPY.ja;

    document.documentElement.lang = normalized === "zh" ? "zh-CN" : normalized;

    for (const node of document.querySelectorAll("[data-i18n]")) {
      const key = node.dataset.i18n;
      if (Object.prototype.hasOwnProperty.call(copy, key)) node.textContent = copy[key];
    }

    for (const button of document.querySelectorAll("[data-lang]")) {
      button.setAttribute("aria-pressed", String(button.dataset.lang === normalized));
    }

    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, normalized); } catch (_) { /* local preference only */ }
    }

    return normalized;
  }

  function initialLanguage() {
    try {
      const stored = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch (_) { /* local preference only */ }

    return normalizeLanguage(navigator.language) || "ja";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const lang = applyLanguage(initialLanguage(), { persist: false });

    for (const button of document.querySelectorAll("[data-lang]")) {
      button.addEventListener("click", () => applyLanguage(button.dataset.lang));
    }

    if (lang !== "ja") {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* local preference only */ }
    }
  });

  window.ZenLampToolsWS02 = Object.freeze({
    version: "WS-02",
    normalizeLanguage,
    applyLanguage
  });
})();
