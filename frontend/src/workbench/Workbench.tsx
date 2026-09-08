import { Moon, PanelLeft, PanelRight, Settings as SettingsIcon, Sun } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAsync } from '../hooks/useAsync';
import { ipc } from '../ipc';
import type { Artifact, Item, Plan } from '../ipc';
import { Checklist } from '../plan/Checklist';
import { MarkdownViewer } from '../viewers/MarkdownViewer';
import { PdfViewer } from '../viewers/PdfViewer';
import { Explorer } from './Explorer';
import { FirstRun } from './FirstRun';
import { Layout } from './Layout';
import { Palette } from './Palette';
import { Settings } from './Settings';
import { AsyncView, Empty } from './States';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import type { ViewMode } from './ViewToggle';
import { ViewToggle } from './ViewToggle';
import { useShortcuts } from './useShortcuts';
import { useTabs } from './useTabs';
import { useTheme } from './useTheme';
import './workbench.css';

export function Workbench() {
  // The workspace is asked about before anything else renders. Letting each
  // pane discover a missing career folder on its own produced the same message
  // three times, with two identical buttons, for one cause.
  const [reloads, setReloads] = useState(0);
  const loadWorkspace = useCallback(() => ipc().getWorkspace(), []);
  const ws = useAsync(loadWorkspace);

  const tabs = useTabs();

  const loadPlan = useCallback(() => ipc().getPlan(), []);
  const plan = useAsync(loadPlan);

  /**
   * Every topic's material, read in one pass.
   *
   * One call per topic rather than lazily on expand, because the rail shows a
   * file count per folder and a count has to be measured before it is shown
   * (C5). Lazy loading would mean a folder has no count until you open it,
   * which defeats the reason for having one. This is a local filesystem scan
   * with no network in front of it — ten calls cost nothing.
   */
  const loadTree = useCallback(async () => {
    const topics = await ipc().getTopics();
    const ordered = [...topics].sort((a, b) => a.order - b.order);
    return Promise.all(
      ordered.map(async (t) => ({
        slug: t.slug,
        files: await ipc().getMaterial(t.slug),
      })),
    );
  }, []);
  const tree = useAsync(loadTree);

  const loadChecks = useCallback(() => ipc().getReconciliation(), []);
  const checks = useAsync(loadChecks);

  const [theme, toggleTheme] = useTheme();
  const [reading, setReading] = useState(false);

  /*
   * One mode for the workbench, not one per document. Switching to a markdown
   * file and finding it in a different mode from the last one is a surprise;
   * the mode is how you are working, not a property of the file.
   */
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [palette, setPalette] = useState(false);

  /*
   * Which view is showing. useState, not a router: there are no URLs, no back
   * button and no deep links to support, and four views is well under the
   * threshold at which a router would earn its dependency (View-Map).
   */
  const [view, setView] = useState<'workbench' | 'settings'>('workbench');

  // Flattened out of the rail's tree so the palette can reach a document
  // without the folder it lives in having to be expanded first.
  const openable = useMemo(
    () => (tree.status === 'ready' ? tree.data.flatMap((t) => t.files) : []),
    [tree],
  );

  const shortcuts = useMemo(
    () => ({
      // Escape returns to the checklist without closing anything: coming back
      // to what you were reading should not cost you the other tabs.
      Escape: tabs.blur,
      t: toggleTheme,
      r: () => {
        setReading((on) => !on);
      },
      'mod+k': () => {
        setPalette(true);
      },
      ',': () => {
        setView((v) => (v === 'settings' ? 'workbench' : 'settings'));
      },
    }),
    [tabs.blur, toggleTheme],
  );
  useShortcuts(shortcuts);

  const [planVersion, setPlanVersion] = useState(0);
  const onTick = useCallback(async (anchor: string, checked: boolean) => {
    await ipc().tickItem(anchor, checked);
    // The optimistic update already moved the box; this refreshes the derived
    // figures the tick changed, like a section's completed count.
    setPlanVersion((n) => n + 1);
  }, []);

  // First run, or a remembered folder that has gone. Either way the workbench
  // has nothing to show, so it does not render at all.
  if (ws.status === 'ready' && ws.data.careerRoot === '') {
    return (
      <FirstRun
        problem={ws.data.problem}
        onChosen={() => {
          setReloads((n) => n + 1);
        }}
      />
    );
  }

  const active = tabs.active;

  return (
    <>
      <Palette
        open={palette}
        onOpenChange={setPalette}
        files={openable}
        onOpenFile={tabs.openTab}
        actions={[
          {
            id: 'reading',
            label: reading ? 'Show both panes' : 'Reading mode',
            hint: 'R',
            run: () => {
              setReading((on) => !on);
            },
          },
          {
            id: 'theme',
            label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
            hint: 'T',
            run: toggleTheme,
          },
          {
            id: 'checklist',
            label: 'Go to the checklist',
            hint: 'Esc',
            run: tabs.blur,
          },
          {
            id: 'settings',
            label: view === 'settings' ? 'Back to the workbench' : 'Settings',
            hint: ',',
            run: () => {
              setView((v) => (v === 'settings' ? 'workbench' : 'settings'));
            },
          },
          {
            id: 'preview',
            label: 'View: Preview',
            run: () => {
              setViewMode('preview');
            },
          },
          {
            id: 'split',
            label: 'View: Split',
            run: () => {
              setViewMode('split');
            },
          },
          {
            id: 'edit',
            label: 'View: Edit',
            run: () => {
              setViewMode('edit');
            },
          },
        ]}
      />

      <Layout
        key={reloads}
        railCollapsed={reading}
        planCollapsed={reading}
        title={
          <TitleBar
            root={ws.status === 'ready' ? ws.data.careerRoot : ''}
            settings={view === 'settings'}
            onToggleSettings={() => {
              setView((v) => (v === 'settings' ? 'workbench' : 'settings'));
            }}
            reading={reading}
            onToggleReading={() => {
              setReading((on) => !on);
            }}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        }
        tabs={
          <TabBar
            open={tabs.open}
            activeId={active?.id ?? null}
            onFocus={tabs.focusTab}
            onClose={tabs.closeTab}
          />
        }
        document={<DocumentHeader artifact={active} mode={viewMode} onMode={setViewMode} />}
        rail={
          <AsyncView
            state={tree}
            loadingLabel="Reading the career folder…"
            errorTitle="Could not read the career folder"
            emptyTitle="No topic folders found"
            emptyHint="Material lives under Study guided & notes."
          >
            {(t) => (
              <Explorer
                tree={t}
                openIds={tabs.open.map((a) => a.id)}
                activeId={active?.id ?? null}
                onOpen={tabs.openTab}
              />
            )}
          </AsyncView>
        }
        viewer={
          view === 'settings' ? (
            <Settings
              careerRoot={ws.status === 'ready' ? ws.data.careerRoot : ''}
              theme={theme}
              onToggleTheme={toggleTheme}
              onRootChanged={() => {
                setView('workbench');
                setReloads((n) => n + 1);
              }}
            />
          ) : active === null ? (
            <Empty
              title="Nothing open"
              hint="Choose a document from the rail. The checklist is on the right."
            />
          ) : (
            <ArtifactPane artifact={active} mode={viewMode} />
          )
        }
        plan={
          <AsyncView
            key={planVersion}
            state={plan}
            loadingLabel="Loading plan…"
            errorTitle="Could not read the plan file"
            emptyTitle="The plan file has no items"
          >
            {(p) => (
              <div className="wb-planpane">
                <Progress plan={p} />
                <ChecklistPane items={p.items} onTick={onTick} />
                <NoteBox />
              </div>
            )}
          </AsyncView>
        }
        status={
          <StatusBar
            checks={checks.status === 'ready' ? checks.data : null}
            position={active?.path}
          />
        }
      />
    </>
  );
}

function TitleBar({
  root,
  settings,
  onToggleSettings,
  reading,
  onToggleReading,
  theme,
  onToggleTheme,
}: {
  root: string;
  settings: boolean;
  onToggleSettings: () => void;
  reading: boolean;
  onToggleReading: () => void;
  theme: string;
  onToggleTheme: () => void;
}) {
  return (
    <>
      <span className="wb-brand">Threadline</span>
      {/* The career root, always visible. The app is a lens over one folder,
          and which folder is a fact you should never have to go and check. */}
      <span className="wb-root" title={root}>
        {root}
      </span>

      <span className="wb-grow" />

      <button
        type="button"
        className="wb-icon-btn"
        aria-pressed={reading}
        // The name says what the control does, not what it is. "Reading mode"
        // alone leaves a screen reader user to guess what pressing it changes.
        aria-label={
          reading ? 'Show the rail and plan panes' : 'Reading mode: collapse both side panes'
        }
        title={reading ? 'Show both panes (R)' : 'Reading mode (R)'}
        onClick={onToggleReading}
      >
        {reading ? (
          <PanelLeft className="wb-icon" aria-hidden="true" />
        ) : (
          <PanelRight className="wb-icon" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className="wb-icon-btn"
        aria-pressed={settings}
        aria-label={settings ? 'Back to the workbench' : 'Settings'}
        title="Settings (,)"
        onClick={onToggleSettings}
      >
        <SettingsIcon className="wb-icon" aria-hidden="true" />
      </button>

      <button
        type="button"
        className="wb-icon-btn"
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title="Toggle theme (T)"
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <Sun className="wb-icon" aria-hidden="true" />
        ) : (
          <Moon className="wb-icon" aria-hidden="true" />
        )}
      </button>
    </>
  );
}

const PLAN_READ_ONLY =
  'The plan file changes only by ticking a checkbox, so that nothing else in it can move.';

function DocumentHeader({
  artifact,
  mode,
  onMode,
}: {
  artifact: Artifact | null;
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
}) {
  if (artifact === null) {
    return <span className="wb-quiet">No document open</span>;
  }

  return (
    <>
      <span className="wb-doctitle">{artifact.title}</span>
      <span className="wb-grow" />
      {/* The switch belongs to markdown. A PDF has no edit mode, and a control
          that appears everywhere and works sometimes is worse than one that
          appears where it applies. */}
      {artifact.ext.toLowerCase() === '.md' && (
        <ViewToggle
          mode={mode}
          onChange={onMode}
          readOnlyReason={artifact.isPlanFile ? PLAN_READ_ONLY : undefined}
        />
      )}
    </>
  );
}

/**
 * Topics done, and pages.
 *
 * `done` counts curriculum items the plan itself has ticked. It is not
 * inferred from pages read or time spent: the plan says what is finished, and
 * anything else would be a number the app made up about the user's own work.
 */
function Progress({ plan }: { plan: Plan }) {
  const curriculum = plan.items.filter((i) => i.role === 'curriculum');
  const done = curriculum.filter((i) => i.checked).length;
  const pages = curriculum.reduce((sum, i) => sum + (i.pagesConf === 'none' ? 0 : i.pages), 0);

  if (curriculum.length === 0) {
    return <p className="wb-quiet">No curriculum items in this plan.</p>;
  }

  return (
    <dl className="wb-stats">
      <dt>Topics</dt>
      <dd>
        {done} of {curriculum.length}
      </dd>
      <dt>Pages</dt>
      <dd>{pages}pp</dd>
    </dl>
  );
}

/** The note box: always present, never a popup. */
function NoteBox() {
  const [text, setText] = useState('');
  return (
    <textarea
      className="wb-note"
      aria-label="Session note"
      placeholder="What are you working on?"
      rows={3}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
      }}
    />
  );
}

function ChecklistPane({
  items,
  onTick,
}: {
  items: Item[];
  onTick: (anchor: string, checked: boolean) => Promise<void>;
}) {
  return (
    <div className="wb-checklist">
      <Checklist items={items} onTick={onTick} />
    </div>
  );
}

function ArtifactPane({ artifact, mode }: { artifact: Artifact; mode: ViewMode }) {
  const load = useCallback(() => ipc().readArtifact(artifact.id), [artifact.id]);
  const content = useAsync(load);

  const savePosition = useCallback(
    (page: number) => {
      void ipc().savePosition(artifact.id, page);
    },
    [artifact.id],
  );

  const loadPosition = useCallback(() => ipc().getPosition(artifact.id), [artifact.id]);
  const position = useAsync(loadPosition);

  const saveContent = useCallback(
    (body: string) => ipc().writeArtifact(artifact.id, body),
    [artifact.id],
  );

  return (
    <AsyncView
      state={content}
      loadingLabel={`Opening ${artifact.title}…`}
      errorTitle={`Could not open ${artifact.title}`}
      emptyTitle="This file is empty"
    >
      {(c) =>
        c.kind === 'pdf' ? (
          <PdfViewer
            data={c.body}
            initialPage={position.status === 'ready' ? position.data.page : null}
            onPageChange={savePosition}
            title={artifact.title}
          />
        ) : (
          <MarkdownViewer
            source={c.body}
            title={artifact.title}
            readOnly={artifact.isPlanFile}
            mode={mode}
            readOnlyReason={artifact.isPlanFile ? PLAN_READ_ONLY : undefined}
            onSave={artifact.isPlanFile ? undefined : saveContent}
          />
        )
      }
    </AsyncView>
  );
}
