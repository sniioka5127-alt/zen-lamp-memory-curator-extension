import {
  CONTEXT_PACKAGE_STATUS,
  assertOneOf
} from "./types.mjs";

export const CONTEXT_PACKAGE_TRANSITIONS = Object.freeze({
  draft: Object.freeze(["pending_review", "archived"]),
  pending_review: Object.freeze(["draft", "approved", "rejected", "archived"]),
  approved: Object.freeze(["draft", "revoked", "archived"]),
  rejected: Object.freeze(["draft", "archived"]),
  revoked: Object.freeze(["draft", "archived"]),
  archived: Object.freeze([])
});

export function canTransitionContextPackage(from, to) {
  assertOneOf(from, CONTEXT_PACKAGE_STATUS, "ContextPackage from status");
  assertOneOf(to, CONTEXT_PACKAGE_STATUS, "ContextPackage to status");
  return CONTEXT_PACKAGE_TRANSITIONS[from].includes(to);
}

export function assertContextPackageTransition(from, to) {
  if (!canTransitionContextPackage(from, to)) {
    throw new Error(`Illegal ContextPackage state transition: ${from} -> ${to}`);
  }
  return true;
}

export function transitionContextPackage(pkg, to, { clock = () => new Date() } = {}) {
  if (!pkg || typeof pkg !== "object") throw new TypeError("ContextPackage is required");
  assertContextPackageTransition(pkg.status, to);
  return {
    ...pkg,
    status: to,
    updated_at: clock().toISOString()
  };
}
