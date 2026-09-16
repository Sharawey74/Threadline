// The data that crosses the Go/TypeScript boundary.
//
// These are plain shapes, not classes: nothing with behaviour and no framework
// types cross the bridge. That is what lets the whole frontend run against a
// mock with no Go present, and what would let the Go layer be replaced without
// touching a line of this directory.
//
// Mirrors the derived model in core/plan. Where a name differs from the Go
// side, the Go name wins — the parser is the source of truth.

/** What a plan item is *for*. Only `schedule` items count toward the budget. */
export type Role = 'schedule' | 'curriculum' | 'scope' | 'admin';

/**
 * How sure the parser is about an extracted number.
 *
 * Nothing below `high` may be displayed as fact (C5). A `low` figure is shown
 * qualified, and `none` means the file never stated one — which is a different
 * thing from zero.
 */
export type Confidence = 'high' | 'low' | 'none';

/** What a backtick span turned out to be. */
export type LinkKind = 'folder' | 'file' | 'ambiguous' | 'none' | 'unresolved';

export interface Item {
  /** Content-hash identity. Survives the file being edited and lines moving. */
  anchor: string;
  lineNo: number;
  checked: boolean;
  text: string;
  section: string;
  role: Role;
  /** Leading "**N.**", or 0 when absent. */
  order: number;
  hours: number;
  hoursConf: Confidence;
  pages: number;
  pagesConf: Confidence;
  /** Why something was ambiguous. Never discarded, shown on request. */
  notes: string[];
}

export interface Section {
  number: number;
  title: string;
  role: 'schedule' | 'scope' | 'curriculum' | 'reference';
  budget: number;
  budgetConf: Confidence;
}

export interface Plan {
  sections: Section[];
  items: Item[];
  /** The §3 budget table: track name to declared hours. */
  budget: Record<string, number>;
}

export interface Topic {
  slug: string;
  order: number;
}

export interface Artifact {
  id: number;
  path: string;
  title: string;
  ext: string;
  /**
   * True for the plan file.
   *
   * The UI uses it to withhold the editor: the plan file changes only through
   * a checkbox tick on the byte-exact path (C3). The bridge enforces the same
   * rule rather than trusting this flag.
   */
  isPlanFile: boolean;
}

/** One reconciliation result: a claim the plan makes, against what it contains. */
export interface Check {
  label: string;
  got: number;
  want: number;
  unit: string;
  passed: boolean;
  /** Populated on failure, so a red line explains itself. */
  detail: string;
}

export interface Content {
  artifactId: number;
  kind: 'markdown' | 'pdf' | 'text';
  /** Markdown and text arrive as-is; PDFs arrive base64-encoded. */
  body: string;
}

/** One section of a PDF's outline: `- [ ] Title — p.N`. */
export interface OutlineSection {
  title: string;
  /** The page the section starts on. */
  page: number;
  checked: boolean;
  lineNo: number;
}

/** A PDF's sections in order. `total` is the user-entered page count, 0 when not recorded. */
export interface Outline {
  total: number;
  sections: OutlineSection[];
}

/** The pages one section covers, inclusive. `to` is 0 when the end is unknown. */
export interface PageRange {
  from: number;
  to: number;
}

/**
 * Both counts an outline supports. The page figures mean something only when
 * `pagesKnown`: without a recorded total there is no page figure at all (C5).
 */
export interface OutlineProgress {
  sectionsDone: number;
  sections: number;
  pagesDone: number;
  pages: number;
  pagesKnown: boolean;
}

/** What the PDF record shows. `exists` is false until an outline is imported. */
export interface OutlineView {
  exists: boolean;
  outline: Outline;
  ranges: PageRange[];
  progress: OutlineProgress;
}

/** Events Go pushes to the frontend. */
export type EventName = 'plan:changed' | 'reconcile:drift';

/**
 * Whether the app has a career folder yet.
 *
 * This query never fails for the ordinary reason of not having one. A query
 * that errors on the normal first state forces every caller to treat first run
 * as a fault — which is exactly what makes an unconfigured app look broken.
 */
export interface Workspace {
  /** Empty until a folder is chosen. */
  careerRoot: string;
  planFile: string;
  hasPlan: boolean;
  /** Why a remembered folder could not be reopened. Empty when there is no problem. */
  problem: string;
}
