import {
  CONTEXT_KIND,
  FRESHNESS_STATE,
  MEMORY_POLICY,
  TRANSFER_POLICY,
  assertOneOf,
  assertRequiredString
} from "../core/types.mjs";
import {
  normalizeFreshness,
  normalizeProvenance,
  normalizeSource
} from "../core/governance.mjs";

export const MEMORY_CURATOR_CONTRACT_VERSION = "mc-01";

const SIMPLE_MAX = 12;
const POWER_MAX = 30;

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function formatExisting(existingMemory) {
  if (!existingMemory || !String(existingMemory).trim()) return "[No existing approved memory provided]";
  return String(existingMemory).trim();
}

export function buildCuratorPrompt({
  depth = "simple",
  mode = "initial",
  projectName = "Untitled Project",
  existingMemory = "",
  conversation
} = {}) {
  const input = assertRequiredString(conversation, "conversation");
  const maxItems = depth === "power" ? POWER_MAX : SIMPLE_MAX;
  const isUpdate = mode === "update";

  return `You are the Memory Curator for a Human Agency system.

Your job is NOT to summarize everything and NOT to create a handoff prompt.
Your job is to propose which pieces of context may deserve to remain as structured memory candidates.

Human Authority rule:
- You may propose memory candidates.
- You may NOT mark anything as human-approved.
- Do not invent missing facts.
- Separate facts, decisions, constraints, hypotheses, questions, and temporary notes.
- If uncertain, prefer \"hypothesis\", \"question\", or memory_policy \"review\".
- Keep the candidate set selective. Maximum ${maxItems} items.
- Do NOT generate \"Next Chat Handoff\" or provider-specific handoff text. Context Bridge owns transfer/handoff.

Project: ${projectName}
Mode: ${isUpdate ? "UPDATE" : "INITIAL"}

${isUpdate ? `Existing approved memory / legacy memory input:\n${formatExisting(existingMemory)}\n\n` : ""}Conversation:\n${input}

Return exactly one JSON code block and no other code blocks. You may add a short plain-language note after the JSON if useful.

Use this JSON shape:

\`\`\`json
{
  \"contract_version\": \"${MEMORY_CURATOR_CONTRACT_VERSION}\",
  \"context_items\": [
    {
      \"content\": \"one reusable memory candidate\",
      \"kind\": \"fact | decision | constraint | project_context | style_anchor | discovery | question | hypothesis | temporary | avoid | evidence_reference\",
      \"memory_policy\": \"keep | temporary | review | drop\",
      \"transfer_policy\": \"manual_only\",
      \"freshness\": {
        \"state\": \"current | review_due | stale | not_applicable\",
        \"review_after\": null,
        \"reason\": null
      },
      \"source\": {
        \"actor_type\": \"human | ai | document | unknown\",
        \"actor_name\": null,
        \"platform\": null,
        \"model\": null,
        \"conversation_id\": null,
        \"document_id\": null,
        \"timestamp\": null
      },
      \"provenance\": {
        \"original_text\": null,
        \"source_refs\": []
      },
      \"rationale\": \"brief reason this may deserve human review\"
    }
  ],
  \"conflicts\": [],
  \"questions_for_human\": []
}
\`\`\`

Rules for fields:
- kind must use one of the listed values.
- memory_policy is only a recommendation; the human decides later.
- transfer_policy must default to \"manual_only\" in MC-01.
- Do not output status, approval state, approved_at, or approved_by. The application controls those.
- If the conversation contains conflicting claims, preserve the conflict instead of silently choosing one.
- Keep original_text short and only when it materially helps provenance.
- Use the same natural language as the conversation for content and rationale.`;
}

export function extractJsonObject(text) {
  const raw = assertRequiredString(text, "AI result");
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Could not parse Memory Curator JSON: ${error.message}`);
  }
}

export function normalizeCandidate(candidate = {}) {
  const content = assertRequiredString(candidate.content, "context item content");
  const kind = assertOneOf(candidate.kind, CONTEXT_KIND, "context item kind");
  const memory_policy = safeEnum(candidate.memory_policy, MEMORY_POLICY, "review");
  const transfer_policy = safeEnum(candidate.transfer_policy, TRANSFER_POLICY, "manual_only");
  const freshnessInput = candidate.freshness || {};
  const freshness = normalizeFreshness({
    ...freshnessInput,
    state: safeEnum(freshnessInput.state || "current", FRESHNESS_STATE, "current")
  });

  const source = normalizeSource(candidate.source || {});
  const provenance = normalizeProvenance({
    ...(candidate.provenance || {}),
    derived: true,
    derived_by: "memory_curator"
  });

  return {
    content,
    kind,
    memory_policy,
    transfer_policy,
    freshness,
    source,
    provenance,
    rationale: candidate.rationale == null ? null : String(candidate.rationale)
  };
}

export function parseCuratorResponse(text) {
  const parsed = extractJsonObject(text);
  if (!Array.isArray(parsed.context_items)) {
    throw new TypeError("Memory Curator output must contain context_items[]");
  }
  return {
    contract_version: parsed.contract_version || null,
    context_items: parsed.context_items.map(normalizeCandidate),
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
    questions_for_human: Array.isArray(parsed.questions_for_human) ? parsed.questions_for_human : []
  };
}

export function toContextItemInput(candidate, { projectId } = {}) {
  assertRequiredString(projectId, "projectId");
  const normalized = normalizeCandidate(candidate);
  return {
    project_id: projectId,
    content: normalized.content,
    kind: normalized.kind,
    source: normalized.source,
    provenance: normalized.provenance,
    memory_policy: normalized.memory_policy,
    transfer_policy: normalized.transfer_policy,
    freshness: normalized.freshness
  };
}
