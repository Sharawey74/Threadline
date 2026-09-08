// The real bridge: the mock's counterpart, talking to Go.
//
// This is the only file that imports the generated bindings. Everything else
// goes through `ipc()`, so swapping this for the mock — or for a different
// bridge entirely — touches nothing outside this directory.
//
// The methods are one-liners on purpose. Any translation done here is
// translation the Go side should have done instead: the wire format is the
// contract, and reshaping it in the client means the two sides disagree about
// what the contract is.

import {
  ChooseCareerRoot,
  EndSession,
  GetBudgetStatus,
  GetMaterial,
  GetPlan,
  GetPosition,
  GetReconciliation,
  GetTopics,
  GetWorkspace,
  ReadArtifact,
  SavePosition,
  SetCareerRoot,
  StartSession,
  TickItem,
  WriteArtifact,
} from '../../wailsjs/go/bridge/App';
import { EventsOff, EventsOn } from '../../wailsjs/runtime/runtime';

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
import type { IPC } from './index';

export class WailsIPC implements IPC {
  // ── Queries ────────────────────────────────────────────────────────

  getPlan(): Promise<Plan> {
    return GetPlan() as Promise<Plan>;
  }

  getTopics(): Promise<Topic[]> {
    return GetTopics() as Promise<Topic[]>;
  }

  getMaterial(topicId: string): Promise<Artifact[]> {
    return GetMaterial(topicId) as Promise<Artifact[]>;
  }

  getReconciliation(): Promise<Check[]> {
    return GetReconciliation() as Promise<Check[]>;
  }

  getBudgetStatus(): Promise<Budget> {
    return GetBudgetStatus() as Promise<Budget>;
  }

  getPosition(artifactId: number): Promise<Position> {
    return GetPosition(artifactId) as Promise<Position>;
  }

  readArtifact(artifactId: number): Promise<Content> {
    return ReadArtifact(artifactId) as Promise<Content>;
  }

  getWorkspace(): Promise<Workspace> {
    return GetWorkspace() as Promise<Workspace>;
  }

  // ── Commands ───────────────────────────────────────────────────────

  tickItem(anchor: string, checked: boolean): Promise<void> {
    return TickItem(anchor, checked);
  }

  writeArtifact(artifactId: number, content: string): Promise<void> {
    return WriteArtifact(artifactId, content);
  }

  savePosition(artifactId: number, page: number): Promise<void> {
    return SavePosition(artifactId, page);
  }

  startSession(scopeKind: string, scopeRef: string): Promise<SessionId> {
    return StartSession(scopeKind, scopeRef);
  }

  endSession(id: SessionId, note: string, reason: EndReason): Promise<void> {
    return EndSession(id, note, reason);
  }

  setCareerRoot(path: string): Promise<void> {
    return SetCareerRoot(path);
  }

  chooseCareerRoot(): Promise<string> {
    return ChooseCareerRoot();
  }

  // ── Events ─────────────────────────────────────────────────────────

  /**
   * Wails has no per-listener unsubscribe: `EventsOff` removes every handler
   * for a name. Handlers are tracked here so unsubscribing one leaves the
   * others working — without it, a component unmounting would silently kill
   * every other listener on that event.
   */
  private handlers = new Map<EventName, Set<() => void>>();

  on(event: EventName, handler: () => void): () => void {
    const existing = this.handlers.get(event);

    if (existing === undefined) {
      const set = new Set<() => void>([handler]);
      this.handlers.set(event, set);
      EventsOn(event, () => {
        set.forEach((h) => {
          h();
        });
      });
    } else {
      existing.add(handler);
    }

    return () => {
      const set = this.handlers.get(event);
      if (set === undefined) return;
      set.delete(handler);
      if (set.size === 0) {
        EventsOff(event);
        this.handlers.delete(event);
      }
    };
  }
}
