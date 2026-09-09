import {
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";
import { assertContextPackageTransferReady } from "./context-package-store.mjs";

export const CONTEXT_REDACTION_LAYER_VERSION = "CB-03";

export const REDACTION_CATEGORY = Object.freeze([
  "custom",
  "credential_like",
  "email",
  "phone",
  "ipv4",
  "manual"
]);

const PLAN_PREFIX = "redaction-plan:";
const VIEW_PREFIX = "redaction-view:";

const CATEGORY_PRIORITY = Object.freeze({
  custom: 100,
  credential_like: 90,
  email: 80,
  phone: 70,
  ipv4: 60,
  manual: 110
});

const CATEGORY_REPLACEMENT = Object.freeze({
  custom: "[REDACTED]",
  credential_like: "[REDACTED:CREDENTIAL]",
  email: "[REDACTED:EMAIL]",
  phone: "[REDACTED:PHONE]",
  ipv4: "[REDACTED:IP]",
  manual: "[REDACTED]"
});

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: redaction approval may only be confirmed by a human actor");
  }
}

function actorIdentity(actor) {
  return actor?.id ?? actor?.name ?? "human";
}

function assertPackage(pkg) {
  if (!pkg || typeof pkg !== "object") throw new TypeError("ContextPackage is required");
  assertRequiredString(pkg.id, "ContextPackage id");
  assertRequiredString(pkg.project_id, "ContextPackage project_id");
  if (!Number.isInteger(pkg.revision) || pkg.revision < 1) {
    throw new TypeError("ContextPackage revision must be a positive integer");
  }
  if (!Array.isArray(pkg.items)) throw new TypeError("ContextPackage items must be an array");
  return pkg;
}

function normalizeDetectorOptions(options = {}) {
  return {
    email: options.email !== false,
    phone: options.phone !== false,
    ipv4: options.ipv4 !== false,
    credential_like: options.credential_like !== false
  };
}

function normalizeCustomLiterals(values = []) {
  if (!Array.isArray(values)) throw new TypeError("custom_literals must be an array");
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const literal = assertRequiredString(String(raw ?? ""), "custom literal");
    if (!seen.has(literal)) {
      seen.add(literal);
      out.push(literal);
    }
  }
  return out;
}

function makeOperation({ context_item_id, start, end, category, source_content_length }) {
  if (!REDACTION_CATEGORY.includes(category)) {
    throw new TypeError(`Unsupported redaction category: ${category}`);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    throw new TypeError("Redaction range must use valid integer start/end offsets");
  }
  if (end > source_content_length) {
    throw new Error("Redaction range exceeds source content length");
  }
  return {
    id: makeId("redact"),
    context_item_id,
    start,
    end,
    category,
    replacement: CATEGORY_REPLACEMENT[category],
    source_content_length
  };
}

function collectRegexMatches(content, context_item_id, category, regex, validator = null) {
  const operations = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const text = match[0];
    if (validator && !validator(text)) continue;
    operations.push(makeOperation({
      context_item_id,
      start: match.index,
      end: match.index + text.length,
      category,
      source_content_length: content.length
    }));
    if (text.length === 0) regex.lastIndex += 1;
  }
  return operations;
}

function isValidIpv4(text) {
  const parts = text.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function isPlausiblePhone(text) {
  const digits = text.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

function collectCustomLiteralMatches(content, context_item_id, literals) {
  const operations = [];
  for (const literal of literals) {
    let offset = 0;
    while (offset <= content.length - literal.length) {
      const found = content.indexOf(literal, offset);
      if (found < 0) break;
      operations.push(makeOperation({
        context_item_id,
        start: found,
        end: found + literal.length,
        category: "custom",
        source_content_length: content.length
      }));
      offset = found + Math.max(1, literal.length);
    }
  }
  return operations;
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function deconflictOperations(operations) {
  const accepted = [];
  const ordered = [...operations].sort((a, b) => {
    const priority = (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0);
    if (priority !== 0) return priority;
    const length = (b.end - b.start) - (a.end - a.start);
    if (length !== 0) return length;
    if (a.context_item_id !== b.context_item_id) {
      return a.context_item_id.localeCompare(b.context_item_id);
    }
    return a.start - b.start;
  });

  for (const operation of ordered) {
    const conflict = accepted.some((entry) =>
      entry.context_item_id === operation.context_item_id && rangesOverlap(entry, operation)
    );
    if (!conflict) accepted.push(operation);
  }

  return accepted.sort((a, b) => {
    if (a.context_item_id !== b.context_item_id) {
      return a.context_item_id.localeCompare(b.context_item_id);
    }
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });
}

function detectOperationsForItem(item, { detectors, custom_literals }) {
  const content = String(item.content ?? "");
  const id = assertRequiredString(item.context_item_id, "ContextPackage item id");
  const found = [];

  if (detectors.email) {
    found.push(...collectRegexMatches(
      content,
      id,
      "email",
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    ));
  }

  if (detectors.phone) {
    found.push(...collectRegexMatches(
      content,
      id,
      "phone",
      /(?:\+?\d[\d\s().-]{7,}\d)/g,
      isPlausiblePhone
    ));
  }

  if (detectors.ipv4) {
    found.push(...collectRegexMatches(
      content,
      id,
      "ipv4",
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      isValidIpv4
    ));
  }

  if (detectors.credential_like) {
    found.push(...collectRegexMatches(
      content,
      id,
      "credential_like",
      /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g
    ));
  }

  found.push(...collectCustomLiteralMatches(content, id, custom_literals));
  return deconflictOperations(found);
}

function sanitizeOperationForPlan(operation) {
  // Deliberately omits matched source text. A redaction plan must not become a
  // second store of the sensitive material it is trying to protect.
  return {
    id: operation.id,
    context_item_id: operation.context_item_id,
    start: operation.start,
    end: operation.end,
    category: operation.category,
    replacement: operation.replacement,
    source_content_length: operation.source_content_length
  };
}

function normalizeExclusions(excluded_items = [], pkg) {
  if (!Array.isArray(excluded_items)) throw new TypeError("excluded_items must be an array");
  const packageIds = new Set(pkg.items.map((item) => item.context_item_id));
  const seen = new Set();
  return excluded_items.map((raw) => {
    const id = assertRequiredString(
      typeof raw === "string" ? raw : raw?.context_item_id,
      "excluded context_item_id"
    );
    if (!packageIds.has(id)) throw new Error(`Cannot exclude an item outside the package: ${id}`);
    if (seen.has(id)) throw new Error(`Duplicate excluded ContextItem: ${id}`);
    seen.add(id);
    return {
      context_item_id: id,
      reason: typeof raw === "string" ? null : raw?.reason ?? null
    };
  });
}

function normalizeManualOperations(manual_operations = [], pkg) {
  if (!Array.isArray(manual_operations)) {
    throw new TypeError("manual_operations must be an array");
  }
  const byId = new Map(pkg.items.map((item) => [item.context_item_id, item]));
  return manual_operations.map((raw) => {
    const id = assertRequiredString(raw?.context_item_id, "manual context_item_id");
    const item = byId.get(id);
    if (!item) throw new Error(`Manual redaction targets an item outside the package: ${id}`);
    return makeOperation({
      context_item_id: id,
      start: raw?.start,
      end: raw?.end,
      category: "manual",
      source_content_length: String(item.content ?? "").length
    });
  });
}

function assertPlanMatchesPackage(plan, pkg) {
  if (!plan || plan.engine_version !== CONTEXT_REDACTION_LAYER_VERSION) {
    throw new TypeError("A CB-03 redaction plan is required");
  }
  if (plan.package_id !== pkg.id) throw new Error("Redaction plan belongs to a different ContextPackage");
  if (plan.package_revision !== pkg.revision) {
    throw new Error("ContextPackage revision changed after redaction proposal");
  }
}

function applyOperations(content, operations) {
  const ordered = [...operations].sort((a, b) => b.start - a.start);
  let result = content;
  for (const operation of ordered) {
    result = `${result.slice(0, operation.start)}${operation.replacement}${result.slice(operation.end)}`;
  }
  return result;
}

function assertNoOverlappingOperations(operations) {
  const byItem = new Map();
  for (const op of operations) {
    if (!byItem.has(op.context_item_id)) byItem.set(op.context_item_id, []);
    byItem.get(op.context_item_id).push(op);
  }
  for (const [id, entries] of byItem) {
    const ordered = [...entries].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i += 1) {
      if (rangesOverlap(ordered[i - 1], ordered[i])) {
        throw new Error(`Overlapping redaction operations for ContextItem: ${id}`);
      }
    }
  }
}

export function assertRedactedTransferViewReady(view, pkg) {
  assertPackage(pkg);
  assertContextPackageTransferReady(pkg);
  if (!view || typeof view !== "object") throw new TypeError("Redacted TransferView is required");
  if (view.engine_version !== CONTEXT_REDACTION_LAYER_VERSION) {
    throw new Error("TransferView was not produced by CB-03");
  }
  if (view.status !== "approved" || view.human_gate?.state !== "approved") {
    throw new Error("Redacted TransferView has not passed its Human Gate");
  }
  if (view.package_id !== pkg.id || view.package_revision !== pkg.revision) {
    throw new Error("Redacted TransferView does not match the current ContextPackage revision");
  }
  if (!Array.isArray(view.items) || view.items.length === 0) {
    throw new Error("Redacted TransferView contains no transferable ContextItems");
  }
  return true;
}

export class ContextRedactionLayer {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async propose(pkg, {
    detectors = {},
    custom_literals = []
  } = {}, { actor = { type: "system" } } = {}) {
    assertPackage(pkg);
    const normalizedDetectors = normalizeDetectorOptions(detectors);
    const literals = normalizeCustomLiterals(custom_literals);
    const operations = deconflictOperations(
      pkg.items.flatMap((item) => detectOperationsForItem(item, {
        detectors: normalizedDetectors,
        custom_literals: literals
      }))
    ).map(sanitizeOperationForPlan);

    const timestamp = nowIso(this.clock);
    const plan = {
      schema_version: "0.1",
      engine_version: CONTEXT_REDACTION_LAYER_VERSION,
      id: makeId("rdp"),
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      authority: "proposal_only",
      detectors: normalizedDetectors,
      operation_candidates: operations,
      stats: {
        scanned_items: pkg.items.length,
        findings: operations.length
      },
      created_at: timestamp
    };

    await this.adapter.set(`${PLAN_PREFIX}${plan.id}`, plan);
    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "redaction_plan_created",
      actor,
      entity_type: "redaction_plan",
      entity_id: plan.id,
      after: plan,
      metadata: {
        package_id: pkg.id,
        package_revision: pkg.revision
      }
    });
    return deepClone(plan);
  }

  async getPlan(id) {
    assertRequiredString(id, "redaction plan id");
    return deepClone(await this.adapter.get(`${PLAN_PREFIX}${id}`));
  }

  async approveTransferView(pkg, plan, {
    actor,
    selected_operation_ids = [],
    acknowledged_unredacted_operation_ids = [],
    excluded_items = [],
    manual_operations = [],
    reason = null
  } = {}) {
    requireHuman(actor);
    assertPackage(pkg);
    assertContextPackageTransferReady(pkg);
    assertPlanMatchesPackage(plan, pkg);

    if (!Array.isArray(selected_operation_ids)) {
      throw new TypeError("selected_operation_ids must be an array");
    }
    if (!Array.isArray(acknowledged_unredacted_operation_ids)) {
      throw new TypeError("acknowledged_unredacted_operation_ids must be an array");
    }

    const exclusions = normalizeExclusions(excluded_items, pkg);
    const excludedIds = new Set(exclusions.map((entry) => entry.context_item_id));
    const candidates = new Map(plan.operation_candidates.map((op) => [op.id, op]));
    const selectedIds = new Set(selected_operation_ids.map((id) => assertRequiredString(id, "redaction operation id")));
    const acknowledgedIds = new Set(
      acknowledged_unredacted_operation_ids.map((id) => assertRequiredString(id, "acknowledged operation id"))
    );

    for (const id of selectedIds) {
      if (!candidates.has(id)) throw new Error(`Unknown redaction operation: ${id}`);
    }
    for (const id of acknowledgedIds) {
      if (!candidates.has(id)) throw new Error(`Unknown acknowledged redaction operation: ${id}`);
    }

    for (const operation of plan.operation_candidates) {
      if (excludedIds.has(operation.context_item_id)) continue;
      if (!selectedIds.has(operation.id) && !acknowledgedIds.has(operation.id)) {
        throw new Error(`Human acknowledgment required for unredacted finding: ${operation.id}`);
      }
    }

    const manual = normalizeManualOperations(manual_operations, pkg);
    const selected = plan.operation_candidates.filter((op) => selectedIds.has(op.id));
    const allApplied = [...selected, ...manual].filter((op) => !excludedIds.has(op.context_item_id));
    assertNoOverlappingOperations(allApplied);

    const itemOperations = new Map();
    for (const operation of allApplied) {
      if (!itemOperations.has(operation.context_item_id)) itemOperations.set(operation.context_item_id, []);
      itemOperations.get(operation.context_item_id).push(operation);
    }

    const items = pkg.items
      .filter((item) => !excludedIds.has(item.context_item_id))
      .map((item) => {
        const operations = itemOperations.get(item.context_item_id) || [];
        const sourceContent = String(item.content ?? "");
        for (const operation of operations) {
          if (operation.source_content_length !== sourceContent.length) {
            throw new Error(`Source content changed for redaction operation: ${operation.id}`);
          }
        }
        return {
          context_item_id: item.context_item_id,
          kind: item.kind,
          content: applyOperations(sourceContent, operations),
          source_updated_at: item.source_updated_at ?? null,
          redaction_count: operations.length,
          redaction_categories: [...new Set(operations.map((op) => op.category))]
        };
      });

    if (items.length === 0) {
      throw new Error("Cannot approve a TransferView with every ContextItem excluded");
    }

    const timestamp = nowIso(this.clock);
    const view = {
      schema_version: "0.1",
      engine_version: CONTEXT_REDACTION_LAYER_VERSION,
      id: makeId("rdv"),
      project_id: pkg.project_id,
      package_id: pkg.id,
      package_revision: pkg.revision,
      status: "approved",
      authority: "human_approved_transfer_view",
      items,
      excluded_items: exclusions,
      applied_operations: allApplied.map((op) => ({
        context_item_id: op.context_item_id,
        start: op.start,
        end: op.end,
        category: op.category,
        replacement: op.replacement
      })),
      acknowledged_unredacted_operation_ids: [...acknowledgedIds],
      human_gate: {
        required: true,
        state: "approved",
        approved_at: timestamp,
        approved_by: actorIdentity(actor),
        reason
      },
      created_at: timestamp,
      updated_at: timestamp
    };

    await this.adapter.set(`${VIEW_PREFIX}${view.id}`, view);
    await this.auditLog?.append({
      project_id: pkg.project_id,
      action: "redaction_view_approved",
      actor,
      entity_type: "redaction_view",
      entity_id: view.id,
      after: view,
      reason,
      metadata: {
        package_id: pkg.id,
        package_revision: pkg.revision,
        excluded_item_ids: exclusions.map((entry) => entry.context_item_id)
      }
    });
    return deepClone(view);
  }

  async getTransferView(id) {
    assertRequiredString(id, "redaction view id");
    return deepClone(await this.adapter.get(`${VIEW_PREFIX}${id}`));
  }

  async revokeTransferView(id, { actor, reason = null } = {}) {
    requireHuman(actor);
    const before = await this.getTransferView(id);
    if (!before) throw new Error(`Redacted TransferView not found: ${id}`);
    if (before.status !== "approved") throw new Error("Only an approved TransferView can be revoked");
    const timestamp = nowIso(this.clock);
    const after = {
      ...before,
      status: "revoked",
      human_gate: {
        ...before.human_gate,
        state: "revoked",
        revoked_at: timestamp,
        revoked_by: actorIdentity(actor),
        reason
      },
      updated_at: timestamp
    };
    await this.adapter.set(`${VIEW_PREFIX}${after.id}`, after);
    await this.auditLog?.append({
      project_id: after.project_id,
      action: "redaction_view_revoked",
      actor,
      entity_type: "redaction_view",
      entity_id: after.id,
      before,
      after,
      reason
    });
    return deepClone(after);
  }
}
