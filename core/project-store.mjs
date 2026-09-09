import {
  PROJECT_STATUS,
  SCHEMA_VERSION,
  TRANSFER_POLICY,
  assertOneOf,
  assertRequiredString,
  deepClone,
  makeId,
  nowIso
} from "./types.mjs";
import { assertStorageAdapter } from "./storage.mjs";

const PREFIX = "project:";

function requireHuman(actor) {
  if (actor?.type !== "human") {
    throw new Error("Human Gate required: project authority changes require a human actor");
  }
}

export class ProjectStore {
  constructor(adapter, { auditLog = null, clock = () => new Date() } = {}) {
    this.adapter = assertStorageAdapter(adapter);
    this.auditLog = auditLog;
    this.clock = clock;
  }

  async create({
    name,
    description = "",
    default_language = "ja",
    default_transfer_policy = "manual_only"
  }, { actor = { type: "human" } } = {}) {
    requireHuman(actor);
    assertOneOf(default_transfer_policy, TRANSFER_POLICY, "default_transfer_policy");
    const timestamp = nowIso(this.clock);
    const project = {
      schema_version: SCHEMA_VERSION,
      id: makeId("prj"),
      name: assertRequiredString(name, "name"),
      description: String(description || ""),
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
      owner: { type: "human" },
      settings: {
        local_first: true,
        default_language,
        human_gate_required: true
      },
      privacy: {
        default_transfer_policy
      },
      module_state: {
        atlas: {},
        memory_curator: {},
        context_bridge: {},
        roundtable: {}
      }
    };

    await this.adapter.set(`${PREFIX}${project.id}`, project);
    await this.auditLog?.append({
      project_id: project.id,
      action: "create",
      actor,
      entity_type: "project",
      entity_id: project.id,
      after: project
    });
    return deepClone(project);
  }

  async get(id) {
    assertRequiredString(id, "project id");
    return deepClone(await this.adapter.get(`${PREFIX}${id}`));
  }

  async list() {
    return (await this.adapter.entries(PREFIX))
      .map(([, value]) => value)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(deepClone);
  }

  async update(id, patch, { actor = { type: "human" }, reason = null } = {}) {
    const before = await this.get(id);
    if (!before) throw new Error(`Project not found: ${id}`);
    if (before.status === "archived") throw new Error("Archived projects are immutable in v0.1");

    const allowed = ["name", "description", "settings", "privacy", "module_state"];
    const safePatch = Object.fromEntries(
      Object.entries(patch || {}).filter(([key]) => allowed.includes(key))
    );

    if (safePatch.name != null) safePatch.name = assertRequiredString(safePatch.name, "name");

    let settings = before.settings;
    if (safePatch.settings != null) {
      requireHuman(actor);
      settings = { ...before.settings, ...deepClone(safePatch.settings) };
      if (settings.local_first !== true) {
        throw new Error("local_first cannot be disabled in Human Agency Core v0.1");
      }
      if (settings.human_gate_required !== true) {
        throw new Error("human_gate_required cannot be disabled in Human Agency Core v0.1");
      }
    }

    let privacy = before.privacy;
    if (safePatch.privacy != null) {
      requireHuman(actor);
      privacy = { ...before.privacy, ...deepClone(safePatch.privacy) };
      assertOneOf(
        privacy.default_transfer_policy,
        TRANSFER_POLICY,
        "privacy.default_transfer_policy"
      );
    }

    const module_state = safePatch.module_state == null
      ? before.module_state
      : { ...before.module_state, ...deepClone(safePatch.module_state) };

    const after = {
      ...before,
      ...(safePatch.name != null ? { name: safePatch.name } : {}),
      ...(safePatch.description != null ? { description: String(safePatch.description) } : {}),
      settings,
      privacy,
      module_state,
      updated_at: nowIso(this.clock)
    };

    await this.adapter.set(`${PREFIX}${id}`, after);
    await this.auditLog?.append({
      project_id: id,
      action: "update",
      actor,
      entity_type: "project",
      entity_id: id,
      before,
      after,
      reason
    });
    return deepClone(after);
  }

  async setStatus(id, status, { actor = { type: "human" }, reason = null } = {}) {
    requireHuman(actor);
    assertOneOf(status, PROJECT_STATUS, "project status");
    const before = await this.get(id);
    if (!before) throw new Error(`Project not found: ${id}`);
    if (before.status === "archived" && status !== "archived") {
      throw new Error("Archived projects cannot be reactivated in v0.1");
    }
    const after = { ...before, status, updated_at: nowIso(this.clock) };
    await this.adapter.set(`${PREFIX}${id}`, after);
    await this.auditLog?.append({
      project_id: id,
      action: status === "archived" ? "archive" : "update",
      actor,
      entity_type: "project",
      entity_id: id,
      before,
      after,
      reason
    });
    return deepClone(after);
  }
}
