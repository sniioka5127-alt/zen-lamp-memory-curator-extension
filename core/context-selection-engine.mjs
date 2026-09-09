import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { isReviewDue, normalizeTransferPolicy } from "./governance.mjs";
import { normalizeContextPackageTarget } from "./context-package-store.mjs";

export const CONTEXT_SELECTION_ENGINE_VERSION = "CB-02";

const KIND_BASE_SCORE = Object.freeze({
  constraint: 24,
  decision: 22,
  project_context: 20,
  avoid: 18,
  evidence_reference: 16,
  fact: 14,
  question: 12,
  discovery: 10,
  hypothesis: 8,
  style_anchor: 6,
  temporary: 4
});

function assertContextItemStore(store) {
  if (!store || typeof store.listByProject !== "function" || typeof store.get !== "function") {
    throw new TypeError("ContextSelectionEngine requires a ContextItemStore-compatible object");
  }
  return store;
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase();
}

function tokenizeForRelevance(value) {
  const text = normalizeText(value);
  const tokens = new Set();

  for (const match of text.matchAll(/[a-z0-9_][a-z0-9_.:/-]*/g)) {
    const token = match[0].replace(/^[._:/-]+|[._:/-]+$/g, "");
    if (token.length >= 2) tokens.add(token);
  }

  for (const match of text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu)) {
    const run = match[0];
    if (run.length === 1) tokens.add(run);
    for (let width = 2; width <= 3; width += 1) {
      for (let i = 0; i <= run.length - width; i += 1) {
        tokens.add(run.slice(i, i + width));
      }
    }
  }

  return tokens;
}

function lexicalScore(queryTokens, content) {
  if (!queryTokens.size) return { score: 0, overlap_count: 0 };
  const contentTokens = tokenizeForRelevance(content);
  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) overlap += 1;
  }
  return {
    score: Math.min(60, Math.round((overlap / queryTokens.size) * 60)),
    overlap_count: overlap
  };
}

function memoryAdjustment(policy) {
  if (policy === "keep") return 4;
  if (policy === "temporary") return -2;
  if (policy === "drop") return -8;
  return 0;
}

function classifyRecommendation(score) {
  if (score >= 35) return "suggest";
  if (score >= 20) return "review";
  return "available";
}

export function evaluateSelectionEligibility(item, {
  source_project_id,
  target_project_id,
  now = new Date()
} = {}) {
  const reasons = [];
  const warnings = [];

  if (!item || typeof item !== "object") {
    return { eligible: false, reasons: ["invalid_item"], warnings };
  }

  if (item.project_id !== source_project_id) reasons.push("outside_source_project");
  if (item.status !== "approved") reasons.push("context_item_not_approved");
  if (item.human_review?.state !== "approved") reasons.push("human_review_not_approved");

  const policy = normalizeTransferPolicy(item.transfer_policy || "manual_only");
  if (policy === "deny") reasons.push("transfer_denied_by_policy");
  if (policy === "project_only" && target_project_id !== item.project_id) {
    reasons.push("outside_project_scope");
  }

  if (item.freshness?.state === "stale") reasons.push("freshness_stale");
  if (isReviewDue(item, { now })) warnings.push("freshness_review_due");
  if (policy === "manual_only") warnings.push("manual_confirmation_required");
  if (item.memory_policy === "drop") warnings.push("memory_policy_drop");
  if (item.memory_policy === "temporary") warnings.push("memory_policy_temporary");

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings
  };
}

function buildCandidate(item, queryTokens, eligibility) {
  const lexical = lexicalScore(queryTokens, item.content);
  const kindScore = KIND_BASE_SCORE[item.kind] ?? 0;
  const score = Math.max(
    0,
    Math.min(100, kindScore + lexical.score + memoryAdjustment(item.memory_policy))
  );

  const reasonCodes = [];
  if (lexical.overlap_count > 0) reasonCodes.push("purpose_overlap");
  if (["constraint", "decision", "project_context", "avoid"].includes(item.kind)) {
    reasonCodes.push("governance_anchor_kind");
  }
  if (item.memory_policy === "keep") reasonCodes.push("memory_policy_keep");

  return {
    context_item_id: item.id,
    kind: item.kind,
    score,
    recommendation: classifyRecommendation(score),
    reason_codes: reasonCodes,
    warning_codes: [...eligibility.warnings],
    transfer_policy: item.transfer_policy,
    freshness_state: item.freshness?.state ?? null,
    source_updated_at: item.updated_at ?? null
  };
}

function stableCandidateSort(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return a.context_item_id.localeCompare(b.context_item_id);
}

export class ContextSelectionEngine {
  constructor(contextItemStore, { clock = () => new Date() } = {}) {
    this.contextItemStore = assertContextItemStore(contextItemStore);
    this.clock = clock;
  }

  async propose({
    project_id,
    purpose,
    target = {},
    extra_keywords = [],
    max_suggestions = 12
  }) {
    const sourceProjectId = assertRequiredString(project_id, "project_id");
    const normalizedPurpose = assertRequiredString(purpose, "purpose");
    if (!Array.isArray(extra_keywords)) throw new TypeError("extra_keywords must be an array");
    if (!Number.isInteger(max_suggestions) || max_suggestions < 1) {
      throw new TypeError("max_suggestions must be a positive integer");
    }

    const normalizedTarget = normalizeContextPackageTarget(target, sourceProjectId);
    const queryTokens = tokenizeForRelevance(
      [normalizedPurpose, ...extra_keywords.map((value) => String(value ?? ""))].join(" ")
    );
    const now = this.clock();
    const items = await this.contextItemStore.listByProject(sourceProjectId);

    const candidates = [];
    const blocked = [];

    for (const item of items) {
      const eligibility = evaluateSelectionEligibility(item, {
        source_project_id: sourceProjectId,
        target_project_id: normalizedTarget.project_id,
        now
      });

      if (!eligibility.eligible) {
        blocked.push({
          context_item_id: item.id,
          kind: item.kind,
          reason_codes: [...eligibility.reasons],
          warning_codes: [...eligibility.warnings],
          source_updated_at: item.updated_at ?? null
        });
        continue;
      }

      candidates.push(buildCandidate(item, queryTokens, eligibility));
    }

    candidates.sort(stableCandidateSort);
    blocked.sort((a, b) => a.context_item_id.localeCompare(b.context_item_id));

    const recommended = candidates
      .filter((entry) => entry.recommendation === "suggest")
      .slice(0, max_suggestions)
      .map((entry) => entry.context_item_id);

    return {
      schema_version: "0.1",
      engine_version: CONTEXT_SELECTION_ENGINE_VERSION,
      id: makeId("sel"),
      project_id: sourceProjectId,
      purpose: normalizedPurpose,
      target: normalizedTarget,
      authority: "proposal_only",
      recommended_item_ids: recommended,
      review_item_ids: candidates
        .filter((entry) => entry.recommendation === "review")
        .map((entry) => entry.context_item_id),
      candidates,
      blocked,
      stats: {
        scanned: items.length,
        eligible: candidates.length,
        blocked: blocked.length,
        recommended: recommended.length
      },
      created_at: nowIso(() => now)
    };
  }

  async resolveSelectedItems(plan, selected_item_ids) {
    if (!plan || plan.engine_version !== CONTEXT_SELECTION_ENGINE_VERSION) {
      throw new TypeError("A CB-02 selection plan is required");
    }
    if (!Array.isArray(selected_item_ids) || selected_item_ids.length === 0) {
      throw new TypeError("selected_item_ids must contain at least one ContextItem id");
    }

    const allowed = new Map(
      plan.candidates.map((entry) => [entry.context_item_id, entry])
    );
    const seen = new Set();
    const resolved = [];

    for (const rawId of selected_item_ids) {
      const id = assertRequiredString(rawId, "selected ContextItem id");
      if (seen.has(id)) throw new Error(`Duplicate selected ContextItem: ${id}`);
      seen.add(id);

      const candidate = allowed.get(id);
      if (!candidate) {
        throw new Error(`ContextItem was not eligible in this selection plan: ${id}`);
      }

      const live = await this.contextItemStore.get(id);
      if (!live) throw new Error(`ContextItem no longer exists: ${id}`);
      if (live.updated_at !== candidate.source_updated_at) {
        throw new Error(`ContextItem changed after selection proposal: ${id}`);
      }

      const eligibility = evaluateSelectionEligibility(live, {
        source_project_id: plan.project_id,
        target_project_id: plan.target.project_id,
        now: this.clock()
      });
      if (!eligibility.eligible) {
        throw new Error(`ContextItem is no longer eligible for selection: ${id}`);
      }
      resolved.push(deepClone(live));
    }

    return resolved;
  }
}
