# Project Schema v0.1

Status: **Adopted architecture draft**

## Definition

A `Project` is the human-owned unit of work that groups conversations, documents, memories, decisions, evidence, handoffs, and AI comparisons.

A Project is **not** an AI platform, model, or chat thread.

Examples:

- HIRAKU
- ZEN LAMP Production
- Disaster Navigation
- Temple Management System
- Novel Project

## Base schema

```json
{
  "schema_version": "0.1",
  "id": "prj_xxxxx",
  "name": "Example Project",
  "description": "",
  "status": "active",
  "created_at": "",
  "updated_at": "",
  "owner": {
    "type": "human"
  },
  "settings": {
    "local_first": true,
    "default_language": "ja",
    "human_gate_required": true
  },
  "privacy": {
    "default_transfer_policy": "manual_only"
  },
  "module_state": {
    "atlas": {},
    "memory_curator": {},
    "context_bridge": {},
    "roundtable": {}
  }
}
```

## Status values

- `active`
- `paused`
- `completed`
- `archived`

`completed` means the work is complete but remains useful for reference. `archived` removes the Project from normal active workflows without deleting its history.

## Project-owned resources

A Project may contain references to:

- conversations;
- documents and evidence;
- ContextItems;
- decisions;
- ContextPackages;
- RoundtableSessions;
- audit events.

## Boundary rules

1. Project scope is human-defined.
2. A model or provider must not define Project boundaries.
3. Cross-project memory promotion requires explicit human action.
4. Cross-project transfer requires explicit selection and policy validation.
5. Archiving a Project must not silently delete approved memory or audit history.
6. Modules share Project identity through the Core rather than maintaining separate Project copies.

## Module state

`module_state` stores lightweight UI/workflow state only. Canonical memory, evidence, decisions, and provenance belong to Core objects, not module-specific state.

## Future compatibility

The schema may later add optional fields for encrypted synchronization, collaborators, organizations, external storage adapters, and export formats. These additions must preserve the v0.1 Human Authority and Local First principles.
