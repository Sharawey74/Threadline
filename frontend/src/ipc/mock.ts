// A working IPC implementation backed by fixture data, no Go required.
//
// This is what makes I3's exit criterion possible: the full workbench usable in
// a plain browser. It is not a stub that returns empty arrays — it holds state,
// so ticking a checkbox changes what the next getPlan() returns, and the UI can
// be driven through real interactions before the bridge exists.
//
// The fixture mirrors the shape of the real plan file, including the parts that
// are awkward: an item with low-confidence hours, one with no hours at all, a
// failing reconciliation check, and an unmeasured budget period. A mock that
// only returns clean data produces a UI that only works on clean data.

import type {
  Artifact,
  Budget,
  Check,
  Content,
  EndReason,
  EventName,
  Item,
  Plan,
  Position,
  Section,
  SessionId,
  Topic,
  Workspace,
} from './types';
import type { IPC } from './index';

const sections: Section[] = [
  { number: 4, title: 'Study guide & notes', role: 'curriculum', budget: 0, budgetConf: 'none' },
  { number: 6, title: 'Certificate project A', role: 'scope', budget: 38, budgetConf: 'high' },
  { number: 9, title: 'Now -> Sun 30 Aug', role: 'schedule', budget: 19, budgetConf: 'high' },
  { number: 10, title: 'September', role: 'schedule', budget: 54, budgetConf: 'high' },
];

const items: Item[] = [
  {
    anchor: 'a1b2c3d4e5f60001', lineNo: 60, checked: false,
    text: '1. 02 - Databases & Storage - 49pp, ~7h - ACID, indexing, PostgreSQL',
    section: 'Study guide & notes', role: 'curriculum', order: 1,
    hours: 7, hoursConf: 'high', pages: 49, pagesConf: 'high', notes: [],
  },
  {
    anchor: 'a1b2c3d4e5f60002', lineNo: 64, checked: false,
    text: '2. 06 - System Design - 175pp, ~35h - Fundamentals v3 (102pp), Q&A (25pp)',
    section: 'Study guide & notes', role: 'curriculum', order: 2,
    hours: 35, hoursConf: 'high', pages: 175, pagesConf: 'high',
    notes: ['multiple page counts: 175pp, (102pp describes another file), (25pp describes another file)'],
  },
  {
    anchor: 'a1b2c3d4e5f60003', lineNo: 68, checked: true,
    text: '3. 09 - AI - 10pp, ~3h - GenAI',
    section: 'Study guide & notes', role: 'curriculum', order: 3,
    hours: 3, hoursConf: 'high', pages: 10, pagesConf: 'high', notes: [],
  },
  {
    anchor: 'a1b2c3d4e5f60004', lineNo: 92, checked: false,
    text: 'Choose the target application and write a one-page test plan',
    section: 'Certificate project A', role: 'scope', order: 0,
    hours: 0, hoursConf: 'none', pages: 0, pagesConf: 'none', notes: [],
  },
  {
    anchor: 'a1b2c3d4e5f60005', lineNo: 137, checked: false,
    text: 'Delete the duplicate pages in Study guided & notes',
    section: 'Now -> Sun 30 Aug', role: 'schedule', order: 0,
    hours: 0.5, hoursConf: 'high', pages: 0, pagesConf: 'none', notes: [],
  },
  {
    anchor: 'a1b2c3d4e5f60006', lineNo: 138, checked: false,
    text: 'Notes track - 15h (topics 1 and 2)',
    section: 'Now -> Sun 30 Aug', role: 'schedule', order: 0,
    hours: 15, hoursConf: 'high', pages: 0, pagesConf: 'none', notes: [],
  },
  {
    // No hours at all. The UI must render this differently from "0h".
    anchor: 'a1b2c3d4e5f60007', lineNo: 141, checked: false,
    text: 'Wrap the internship',
    section: 'Now -> Sun 30 Aug', role: 'schedule', order: 0,
    hours: 0, hoursConf: 'none', pages: 0, pagesConf: 'none', notes: [],
  },
  {
    // Low confidence: a bare figure the author never marked up. Must be
    // qualified on screen, never shown as fact (C5).
    anchor: 'a1b2c3d4e5f60008', lineNo: 145, checked: false,
    text: 'ISTQB study - roughly 25h of syllabus reading',
    section: 'September', role: 'schedule', order: 0,
    hours: 25, hoursConf: 'low', pages: 0, pagesConf: 'none',
    notes: ['bare hour figure - not marked up by the author'],
  },
];

const topics: Topic[] = [
  { slug: '02 - Databases & Storage', order: 2 },
  { slug: '06 - System Design', order: 6 },
  { slug: '09 - AI', order: 9 },
];

const material: Record<string, Artifact[]> = {
  '06 - System Design': [
    { id: 1, path: '06 - System Design/Fundamentals v3.pdf', title: 'Fundamentals v3', ext: '.pdf', isPlanFile: false },
    { id: 2, path: '06 - System Design/notes.md', title: 'My notes', ext: '.md', isPlanFile: false },
    // The plan file: editable nowhere, tickable everywhere.
    { id: 9, path: 'TASKS.md', title: 'TASKS.md', ext: '.md', isPlanFile: true },
  ],
  '02 - Databases & Storage': [
    { id: 3, path: '02 - Databases & Storage/ACID.pdf', title: 'ACID', ext: '.pdf', isPlanFile: false },
  ],
  '09 - AI': [],
};

/** True when the id belongs to the plan file. */
function isPlanFile(id: number): boolean {
  return Object.values(material)
    .flat()
    .some((a) => a.id === id && a.isPlanFile);
}

/** Deep-copies fixture data so a caller mutating a result cannot corrupt the mock. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Simulates bridge latency so loading states are visible during development. */
function delay<T>(value: T, ms = 40): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class MockIPC implements IPC {
  private items = clone(items);
  private positions = new Map<number, Position>();
  private contents = new Map<number, string>();
  private handlers = new Map<EventName, Set<() => void>>();
  private nextSession = 1;
  // The mock starts configured: I3's tests drive the workbench itself, and
  // making every one of them choose a folder first would test the first-run
  // screen over and over instead.
  private careerRoot = 'C:/Users/DELL/Desktop/Career';

  // ── Queries ────────────────────────────────────────────────────────

  getPlan(): Promise<Plan> {
    return delay<Plan>({
      sections: clone(sections),
      items: clone(this.items),
      budget: { 'Study guide & notes': 45, 'Certificate project A': 38, Total: 73 },
    });
  }

  getTopics(): Promise<Topic[]> {
    return delay(clone(topics));
  }

  getMaterial(topicId: string): Promise<Artifact[]> {
    return delay(clone(material[topicId] ?? []));
  }

  getReconciliation(): Promise<Check[]> {
    // One failing check on purpose. Drift is a state the UI must render, and a
    // mock that always passes produces a UI nobody has seen fail.
    return delay<Check[]>([
      { label: '§9 Now -> Sun 30 Aug tasks vs heading', got: 15.5, want: 19, unit: 'h', passed: false,
        detail: 'items sum to 15.5h; the heading declares 19h' },
      { label: '§10 September tasks vs heading', got: 54, want: 54, unit: 'h', passed: true, detail: '' },
      { label: 'curriculum hours vs budget table row', got: 45, want: 45, unit: 'h', passed: true, detail: '' },
      { label: 'curriculum items vs topic folders on disk', got: 3, want: 3, unit: '', passed: true, detail: '' },
      { label: 'schedule/scope sections declaring a budget', got: 3, want: 3, unit: '', passed: true, detail: '' },
    ]);
  }

  getBudgetStatus(): Promise<Budget> {
    return delay<Budget>({
      allocatedHours: 73,
      spentHours: 4.5,
      periods: [
        { section: 'Now -> Sun 30 Aug', allocatedHours: 19, spentHours: 4.5, measured: true },
        // Never measured: the app was not running. Must not render as 0h.
        { section: 'September', allocatedHours: 54, spentHours: null, measured: false },
      ],
    });
  }

  getWorkspace(): Promise<Workspace> {
    return delay<Workspace>({
      careerRoot: this.careerRoot,
      planFile: this.careerRoot === '' ? '' : `${this.careerRoot}/TASKS.md`,
      hasPlan: this.careerRoot !== '',
      problem: '',
    });
  }

  getPosition(artifactId: number): Promise<Position> {
    return delay(
      this.positions.get(artifactId) ?? { artifactId, page: null, scrollPct: null },
    );
  }

  readArtifact(artifactId: number): Promise<Content> {
    const saved = this.contents.get(artifactId);
    if (saved !== undefined) {
      return delay<Content>({ artifactId, kind: 'markdown', body: saved });
    }
    return delay<Content>({
      artifactId,
      kind: 'markdown',
      body: `# Fixture artifact ${artifactId}\n\nMock content, served without Go.\n`,
    });
  }

  // ── Commands ───────────────────────────────────────────────────────

  tickItem(anchor: string, checked: boolean): Promise<void> {
    const item = this.items.find((i) => i.anchor === anchor);
    if (item === undefined) {
      // The real bridge refuses a stale anchor rather than writing to whatever
      // line sits there now. The mock refuses too, so the UI's error path is
      // exercised in development instead of first meeting it in production.
      return Promise.reject(new Error(`no item with anchor ${anchor}`));
    }
    item.checked = checked;
    this.emit('plan:changed');
    return delay(undefined);
  }

  writeArtifact(artifactId: number, content: string): Promise<void> {
    if (isPlanFile(artifactId)) {
      // The real bridge refuses this too. A UI bug must not be the only thing
      // standing between a full-file rewrite and the plan file (C3).
      return Promise.reject(
        new Error('the plan file is modified only by ticking a checkbox'),
      );
    }
    this.contents.set(artifactId, content);
    return delay(undefined);
  }

  savePosition(artifactId: number, page: number): Promise<void> {
    this.positions.set(artifactId, { artifactId, page, scrollPct: null });
    return delay(undefined);
  }

  startSession(): Promise<SessionId> {
    return delay(this.nextSession++);
  }

  endSession(_id: SessionId, _note: string, _reason: EndReason): Promise<void> {
    return delay(undefined);
  }

  setCareerRoot(path: string): Promise<void> {
    this.careerRoot = path;
    return delay(undefined);
  }

  chooseCareerRoot(): Promise<string> {
    // No native dialog outside the Wails window, so the mock adopts a
    // plausible folder rather than pretending a picker appeared.
    this.careerRoot = 'C:/Users/DELL/Desktop/Career';
    return delay(this.careerRoot);
  }

  // ── Events ─────────────────────────────────────────────────────────

  on(event: EventName, handler: () => void): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return () => {
      set.delete(handler);
    };
  }

  /** Fires an event, as Go would. Exposed so tests can drive the event path. */
  emit(event: EventName): void {
    this.handlers.get(event)?.forEach((h) => {
      h();
    });
  }
}
