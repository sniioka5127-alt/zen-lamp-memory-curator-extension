import {
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertRoundtableResponseIntegrity } from "./roundtable-response-store.mjs";

export const ROUNDTABLE_COMPARISON_VERSION = "RT-03";

function normalizeProvider(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("provider must be a non-empty string");
  return value.trim().toLowerCase();
}

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function normalizeSegment(text) {
  return String(text)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function splitSegments(raw) {
  const text = String(raw).replace(/\r\n?/g, "\n");
  const blocks = text
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/(?<=[。！？.!?])\s+/u))
    .map((segment) => segment.trim())
    .filter(Boolean);
  return blocks.length ? blocks : [text];
}

function cjkNgrams(text) {
  const chars = [...text.replace(/\s+/g, "")];
  if (chars.length < 2) return chars;
  const grams = [];
  for (let i = 0; i < chars.length - 1; i += 1) grams.push(chars.slice(i, i + 2).join(""));
  return grams;
}

function hybridTokens(text) {
  const normalized = normalizeSegment(text);
  const tokens = new Set();
  const words = normalized.match(/[\p{L}\p{N}_-]+/gu) || [];
  for (const word of words) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(word)) {
      for (const gram of cjkNgrams(word)) tokens.add(`c:${gram}`);
    } else {
      tokens.add(`w:${word}`);
    }
  }
  if (!tokens.size && normalized) for (const gram of cjkNgrams(normalized)) tokens.add(`c:${gram}`);
  return tokens;
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function preview(text, max = 180) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function relationshipFromOverlap(value) {
  if (value >= 0.7) return "high_lexical_overlap";
  if (value >= 0.35) return "mixed_lexical_overlap";
  return "low_lexical_overlap";
}

function assertResponseSet(input, responses) {
  if (!input || input.input_version !== "RT-01" || input.status !== "prepared_not_executed") {
    throw new Error("RT-03 requires an intact RT-01 canonical input");
  }
  if (!Array.isArray(responses) || responses.length < 2) {
    throw new TypeError("RT-03 requires at least two RT-02 responses");
  }

  const configured = input.providers.map(normalizeProvider);
  const seen = new Set();
  for (const response of responses) {
    assertRoundtableResponseIntegrity(response, input);
    const provider = normalizeProvider(response.provider);
    if (seen.has(provider)) throw new Error(`RT-03 requires exactly one selected response per provider: ${provider}`);
    seen.add(provider);
  }
  if (seen.size !== configured.length || configured.some((provider) => !seen.has(provider))) {
    throw new Error("RT-03 response coverage must exactly match the RT-01 provider set");
  }
  return configured;
}

function buildComparisonData(input, responses) {
  const providers = assertResponseSet(input, responses);
  const byProvider = new Map(responses.map((response) => [normalizeProvider(response.provider), response]));
  const ordered = providers.map((provider) => byProvider.get(provider));

  const segmentMaps = new Map();
  for (const response of ordered) {
    const segments = splitSegments(response.raw_response).map((raw, index) => {
      const normalized = normalizeSegment(raw);
      return {
        index,
        normalized,
        signature: fnv1a32(normalized),
        preview: preview(raw)
      };
    });
    segmentMaps.set(response.provider, segments);
  }

  const normalizedPresence = new Map();
  for (const provider of providers) {
    for (const segment of segmentMaps.get(provider)) {
      if (!segment.normalized) continue;
      if (!normalizedPresence.has(segment.normalized)) normalizedPresence.set(segment.normalized, []);
      normalizedPresence.get(segment.normalized).push({ provider, index: segment.index });
    }
  }

  const exactSharedWording = [];
  for (const [normalized, occurrences] of normalizedPresence) {
    const occurrenceProviders = new Set(occurrences.map((entry) => entry.provider));
    if (occurrenceProviders.size === providers.length) {
      exactSharedWording.push({
        signature: fnv1a32(normalized),
        preview: preview(normalized),
        occurrences
      });
    }
  }
  exactSharedWording.sort((a, b) => a.signature.localeCompare(b.signature));

  const providerUniqueSegments = [];
  for (const provider of providers) {
    const entries = segmentMaps.get(provider)
      .filter((segment) => (normalizedPresence.get(segment.normalized) || []).every((entry) => entry.provider === provider))
      .map((segment) => ({
        segment_index: segment.index,
        signature: segment.signature,
        preview: segment.preview
      }));
    providerUniqueSegments.push({ provider, segments: entries });
  }

  const pairwiseMatrix = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      const overlap = jaccard(hybridTokens(a.raw_response), hybridTokens(b.raw_response));
      const aSegments = new Set(segmentMaps.get(a.provider).map((entry) => entry.normalized));
      const bSegments = new Set(segmentMaps.get(b.provider).map((entry) => entry.normalized));
      let sharedSegments = 0;
      for (const segment of aSegments) if (bSegments.has(segment)) sharedSegments += 1;
      pairwiseMatrix.push({
        provider_a: a.provider,
        provider_b: b.provider,
        lexical_overlap: round4(overlap),
        relationship: relationshipFromOverlap(overlap),
        exact_shared_segment_count: sharedSegments,
        response_length_a: a.raw_response.length,
        response_length_b: b.raw_response.length,
        length_ratio_short_to_long: round4(Math.min(a.raw_response.length, b.raw_response.length) / Math.max(a.raw_response.length, b.raw_response.length))
      });
    }
  }

  return {
    providers,
    source_responses: ordered.map((response) => ({
      provider: response.provider,
      response_id: response.id,
      response_fingerprint: deepClone(response.response_fingerprint),
      rendering_id: response.rendering_id
    })),
    exact_shared_wording: exactSharedWording,
    provider_unique_segments: providerUniqueSegments,
    pairwise_matrix: pairwiseMatrix,
    interpretive_review: {
      required: true,
      reason: "RT-03 measures wording and structural divergence only; semantic agreement, factual correctness, and decision relevance require later review."
    }
  };
}

export function assertRoundtableComparisonIntegrity(comparison, input, responses) {
  const expected = buildComparisonData(input, responses);
  if (!comparison || comparison.comparison_version !== ROUNDTABLE_COMPARISON_VERSION) {
    throw new Error("Roundtable comparison was not produced by RT-03");
  }
  if (comparison.status !== "compared_not_decided" || comparison.authority !== "descriptive_no_truth_claim") {
    throw new Error("RT-03 comparison authority or status was modified");
  }
  if (comparison.roundtable_input_id !== input.id ||
      comparison.package_id !== input.package_id ||
      comparison.package_revision !== input.package_revision ||
      comparison.transfer_view_id !== input.transfer_view_id ||
      comparison.semantic_fingerprint?.algorithm !== input.semantic_fingerprint?.algorithm ||
      comparison.semantic_fingerprint?.value !== input.semantic_fingerprint?.value) {
    throw new Error("RT-03 comparison does not match its RT-01 canonical source");
  }
  for (const key of ["providers", "source_responses", "exact_shared_wording", "provider_unique_segments", "pairwise_matrix", "interpretive_review"]) {
    if (JSON.stringify(comparison[key]) !== JSON.stringify(expected[key])) {
      throw new Error(`RT-03 comparison data was modified: ${key}`);
    }
  }
  for (const forbidden of ["winner", "decision", "truth", "majority_choice", "model_ranking", "recommended_provider"]) {
    if (forbidden in comparison) throw new Error(`RT-03 must not contain decision field: ${forbidden}`);
  }
  return true;
}

export class RoundtableComparisonEngine {
  constructor({ auditLog = null, clock = () => new Date() } = {}) {
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async compare(input, responses, { actor = { type: "system" } } = {}) {
    const data = buildComparisonData(input, responses);
    const comparison = {
      schema_version: "0.1",
      comparison_version: ROUNDTABLE_COMPARISON_VERSION,
      id: makeId("rtc"),
      status: "compared_not_decided",
      authority: "descriptive_no_truth_claim",
      comparison_basis: [
        "exact_normalized_wording",
        "hybrid_lexical_overlap",
        "response_length_structure"
      ],
      project_id: input.project_id,
      roundtable_input_id: input.id,
      package_id: input.package_id,
      package_revision: input.package_revision,
      transfer_view_id: input.transfer_view_id,
      semantic_fingerprint: deepClone(input.semantic_fingerprint),
      ...data,
      compared_at: nowIso(this.clock)
    };

    assertRoundtableComparisonIntegrity(comparison, input, responses);

    await this.auditLog?.append({
      project_id: comparison.project_id,
      action: "roundtable_responses_compared",
      actor,
      entity_type: "roundtable_comparison",
      entity_id: comparison.id,
      metadata: {
        roundtable_input_id: comparison.roundtable_input_id,
        package_id: comparison.package_id,
        package_revision: comparison.package_revision,
        providers: deepClone(comparison.providers),
        response_ids: comparison.source_responses.map((entry) => entry.response_id),
        semantic_fingerprint: `${comparison.semantic_fingerprint.algorithm}:${comparison.semantic_fingerprint.value}`,
        exact_shared_wording_count: comparison.exact_shared_wording.length,
        pairwise_count: comparison.pairwise_matrix.length,
        interpretive_review_required: true
      }
    });

    return deepClone(comparison);
  }
}
