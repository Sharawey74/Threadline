// The only module in the frontend that talks to Go.
//
// Everything else imports from here and never from `wailsjs` directly. That is
// the whole point: the boundary is one file, so the frontend can run against a
// mock with no Go present, and swapping Wails for something else touches this
// directory and nothing more.
//
// The contract is frozen at 12: 7 queries with no side effects, 5 commands that
// return only an error, plus 3 events. Over 20 means the boundary is leaking
// (C2) — and adding a thirteenth here is the moment to ask whether the frontend
// is reaching for something the backend should be deciding.

import type {
  Artifact,
  Budget,
  Check,
  Content,
  EndReason,
  EventName,
  Plan,
  Position,
  SessionId,
  Topic,
  Workspace,
} from './types';

export type * from './types';

/**
 * The bridge to Go.
 *
 * Queries have no side effects; commands change state and return nothing but
 * an error. That split is command-query separation, and it is deliberate: a
 * caller can retry any query freely, and can never accidentally mutate by
 * reading.
 */
export interface IPC {
  // ── Queries ────────────────────────────────────────────────────────
  getPlan(): Promise<Plan>;
  getTopics(): Promise<Topic[]>;
  getMaterial(topicId: string): Promise<Artifact[]>;
  getReconciliation(): Promise<Check[]>;
  getBudgetStatus(): Promise<Budget>;
  getPosition(artifactId: number): Promise<Position>;
  /** Never rejects for the ordinary reason of having no folder yet. */
  getWorkspace(): Promise<Workspace>;
  readArtifact(artifactId: number): Promise<Content>;

  // ── Commands ───────────────────────────────────────────────────────
  tickItem(anchor: string, checked: boolean): Promise<void>;
  /**
   * Saves an edited markdown file.
   *
   * Never the plan file. That one is modified only by the byte-exact tick path
   * (C3), because a full-file rewrite cannot promise that nothing else moved.
   * The bridge rejects a plan-file id rather than trusting the caller.
   */
  writeArtifact(artifactId: number, content: string): Promise<void>;
  savePosition(artifactId: number, page: number): Promise<void>;
  startSession(scopeKind: string, scopeRef: string): Promise<SessionId>;
  endSession(id: SessionId, note: string, reason: EndReason): Promise<void>;
  setCareerRoot(path: string): Promise<void>;
  /** Opens the native folder picker. Resolves to "" when cancelled. */
  chooseCareerRoot(): Promise<string>;

  // ── Events ─────────────────────────────────────────────────────────
  /** Subscribe to a Go-pushed event. Returns an unsubscribe function. */
  on(event: EventName, handler: () => void): () => void;
}

/**
 * The command names, as a value rather than a type, so the count can be
 * asserted. C2 is a tripwire and a tripwire nobody checks is decoration.
 */
export const CONTRACT = {
  queries: [
    'getPlan',
    'getTopics',
    'getMaterial',
    'getReconciliation',
    'getBudgetStatus',
    'getPosition',
    'readArtifact',
    'getWorkspace',
  ],
  commands: [
    'tickItem',
    'writeArtifact',
    'savePosition',
    'startSession',
    'endSession',
    'setCareerRoot',
    'chooseCareerRoot',
  ],
  events: ['plan:changed', 'session:tick', 'reconcile:drift'],
} as const;

/** The C2 ceiling. Exceeding it means the boundary is leaking. */
export const CONTRACT_LIMIT = 20;

let active: IPC | null | undefined = null;

/**
 * Installs the implementation the app will use.
 *
 * Called once at startup: the mock during I3, the Wails bridge from I4. Nothing
 * else in the frontend knows which one it got.
 */
export function setIPC(impl: IPC): void {
  active = impl;
}

/** Clears the installed implementation. Tests use this to isolate from each other. */
export function resetIPC(): void {
  active = null;
}

/**
 * Returns the installed implementation.
 *
 * Throws rather than returning null. A missing bridge is a startup bug, and a
 * component silently rendering an empty state because the IPC was never
 * installed would hide it.
 */
export function ipc(): IPC {
  // Guards null AND undefined. Checking only for null let an implementation of
  // `undefined` through, and the caller then got undefined back from a function
  // typed as returning IPC - the exact silent failure this guard exists to stop.
  if (active === null || active === undefined) {
    throw new Error('IPC not installed — call setIPC() before rendering');
  }
  return active;
}
