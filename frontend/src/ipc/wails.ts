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
  AppendNote,
  ChooseCareerRoot,
  GetMaterial,
  GetOutline,
  GetPlan,
  GetReconciliation,
  GetTopics,
  GetWorkspace,
  OpenExternal,
  ParseOutline,
  ReadArtifact,
  SaveOutline,
  SetCareerRoot,
  TickItem,
  TickSection,
  WriteArtifact,
} from '../../wailsjs/go/bridge/App';
import { plan } from '../../wailsjs/go/models';
import { EventsOff, EventsOn } from '../../wailsjs/runtime/runtime';

import type {
  Artifact,
  Check,
  Content,
  EventName,
  Outline,
  OutlineView,
  Plan,
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

  readArtifact(artifactId: number): Promise<Content> {
    return ReadArtifact(artifactId) as Promise<Content>;
  }

  getWorkspace(): Promise<Workspace> {
    return GetWorkspace() as Promise<Workspace>;
  }

  parseOutline(text: string): Promise<Outline> {
    return ParseOutline(text) as Promise<Outline>;
  }

  getOutline(artifactId: number): Promise<OutlineView> {
    return GetOutline(artifactId) as Promise<OutlineView>;
  }

  // ── Commands ───────────────────────────────────────────────────────

  tickItem(anchor: string, checked: boolean): Promise<void> {
    return TickItem(anchor, checked);
  }

  writeArtifact(artifactId: number, content: string): Promise<void> {
    return WriteArtifact(artifactId, content);
  }

  setCareerRoot(path: string): Promise<void> {
    return SetCareerRoot(path);
  }

  chooseCareerRoot(): Promise<string> {
    return ChooseCareerRoot();
  }

  saveOutline(artifactId: number, outline: Outline): Promise<void> {
    return SaveOutline(artifactId, plan.Outline.createFrom(outline));
  }

  tickSection(artifactId: number, index: number, title: string, checked: boolean): Promise<void> {
    return TickSection(artifactId, index, title, checked);
  }

  openExternal(artifactId: number, page: number): Promise<void> {
    return OpenExternal(artifactId, page);
  }

  appendNote(artifactId: number, section: string, text: string): Promise<void> {
    return AppendNote(artifactId, section, text);
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
