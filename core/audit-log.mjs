import {
  ACTOR_TYPE,
  AUDIT_ACTION,
  assertOneOf,
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";

const PREFIX = "audit:";

export class AuditLog {
  constructor(adapter, { clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.clock = clock;
  }

  async append({
    project_id,
    action,
    actor = { type: "system" },
    entity_type,
    entity_id,
    before = null,
    after = null,
    reason = null,
    metadata = null
  }) {
    assertRequiredString(project_id, "project_id");
    assertOneOf(action, AUDIT_ACTION, "audit action");
    assertOneOf(actor?.type || "unknown", ACTOR_TYPE, "actor.type");
    assertRequiredString(entity_type, "entity_type");
    assertRequiredString(entity_id, "entity_id");

    const event = {
      schema_version: "0.1",
      id: makeId("audit"),
      project_id,
      action,
      actor: deepClone(actor),
      entity_type,
      entity_id,
      before: deepClone(before),
      after: deepClone(after),
      reason: reason ?? null,
      metadata: deepClone(metadata),
      created_at: nowIso(this.clock)
    };

    await this.adapter.set(`${PREFIX}${event.id}`, event);
    return deepClone(event);
  }

  async list({ project_id = null, entity_type = null, entity_id = null } = {}) {
    const rows = (await this.adapter.entries(PREFIX)).map(([, value]) => value);
    return rows
      .filter((event) => !project_id || event.project_id === project_id)
      .filter((event) => !entity_type || event.entity_type === entity_type)
      .filter((event) => !entity_id || event.entity_id === entity_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(deepClone);
  }
}
