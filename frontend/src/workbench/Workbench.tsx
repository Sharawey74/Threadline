import { useCallback, useState } from 'react';

import { useAsync } from '../hooks/useAsync';
import { ipc } from '../ipc';
import type { Artifact, Item, Plan } from '../ipc';
import { Checklist } from '../plan/Checklist';
import { PdfViewer } from '../viewers/PdfViewer';
import { Layout } from './Layout';
import { AsyncView, Empty } from './States';
import './workbench.css';

/**
 * The workbench: the screen that replaces four applications.
 *
 * It owns the selection state — which topic, which artifact — and nothing else.
 * Everything displayed comes from the bridge, and every write goes back through
 * it. The component never reaches past `ipc()`, which is what lets the whole
 * screen run against the mock with no Go present.
 */
export function Workbench() {
  const [topic, setTopic] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);

  const loadPlan = useCallback(() => ipc().getPlan(), []);
  const plan = useAsync(loadPlan);

  const loadTopics = useCallback(() => ipc().getTopics(), []);
  const topics = useAsync(loadTopics);

  const loadMaterial = useCallback(
    () => (topic === null ? Promise.resolve([]) : ipc().getMaterial(topic)),
    [topic],
  );
  const material = useAsync(loadMaterial);

  const [planVersion, setPlanVersion] = useState(0);
  const onTick = useCallback(
    async (anchor: string, checked: boolean) => {
      await ipc().tickItem(anchor, checked);
      // The optimistic update already moved the box; this refreshes the
      // derived figures the tick changed, like a section's completed count.
      setPlanVersion((n) => n + 1);
    },
    [],
  );

  return (
    <Layout
      header={
        <Header
          topics={topics.status === 'ready' ? topics.data.map((t) => t.slug) : []}
          selected={topic}
          onSelect={(slug) => {
            setTopic(slug);
            // A new topic's artifact list is about to change; keeping the old
            // selection would show the previous topic's document.
            setArtifact(null);
          }}
          artifact={artifact}
        />
      }
      material={
        topic === null ? (
          <Empty title="No topic selected" hint="Choose a topic to see its material." />
        ) : (
          <AsyncView
            state={material}
            loadingLabel="Loading material…"
            errorTitle="Could not load material"
            emptyTitle="No material in this topic"
            emptyHint="Add a PDF to the topic folder and it will appear here."
          >
            {(files) => (
              <MaterialList files={files} selected={artifact} onSelect={setArtifact} />
            )}
          </AsyncView>
        )
      }
      progress={
        <AsyncView
          state={plan}
          loadingLabel="Loading plan…"
          errorTitle="Could not read the plan file"
          emptyTitle="The plan file has no items"
        >
          {(p) => <Progress plan={p} />}
        </AsyncView>
      }
      session={<SessionTimer />}
      note={<NoteBox />}
      viewer={
        <AsyncView
          key={planVersion}
          state={plan}
          loadingLabel="Loading plan…"
          errorTitle="Could not read the plan file"
          emptyTitle="The plan file has no items"
        >
          {(p) =>
            artifact === null ? (
              <ChecklistPane items={p.items} onTick={onTick} />
            ) : (
              <ArtifactPane artifact={artifact} />
            )
          }
        </AsyncView>
      }
    />
  );
}

function Header({
  topics,
  selected,
  onSelect,
  artifact,
}: {
  topics: string[];
  selected: string | null;
  onSelect: (slug: string) => void;
  artifact: Artifact | null;
}) {
  return (
    <>
      <label className="wb-topic">
        <span className="cl-sr">Topic</span>
        <select
          value={selected ?? ''}
          onChange={(e) => {
            onSelect(e.target.value);
          }}
        >
          <option value="">Select a topic…</option>
          {topics.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </label>
      <span className="wb-open">{artifact?.title ?? 'Checklist'}</span>
    </>
  );
}

function MaterialList({
  files,
  selected,
  onSelect,
}: {
  files: Artifact[];
  selected: Artifact | null;
  onSelect: (a: Artifact | null) => void;
}) {
  return (
    <ul className="wb-material" role="list">
      <li>
        <button
          type="button"
          className={selected === null ? 'wb-material-item is-open' : 'wb-material-item'}
          onClick={() => {
            onSelect(null);
          }}
        >
          Checklist
        </button>
      </li>
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            className={selected?.id === f.id ? 'wb-material-item is-open' : 'wb-material-item'}
            onClick={() => {
              onSelect(f);
            }}
          >
            {f.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Topic progress, counted from the plan rather than invented.
 *
 * Every figure here came out of a file the user wrote. That is the whole
 * honest-numbers rule (C5): show a proportion only when the denominator came
 * from outside your head.
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

/**
 * The session timer.
 *
 * A placeholder in I3: the real lifecycle — idle detection, scope inference,
 * crash-safe persistence — is I5. Showing a fixed dash rather than a running
 * clock is deliberate; a timer that counts but records nothing would display a
 * number nothing measured (C5).
 */
function SessionTimer() {
  return (
    <p className="wb-timer" aria-label="Session time">
      <span className="wb-quiet">not recording yet</span>
    </p>
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
    <div className="wb-pane">
      <Checklist items={items} onTick={onTick} />
    </div>
  );
}

function ArtifactPane({ artifact }: { artifact: Artifact }) {
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
          <pre className="wb-text">{c.body}</pre>
        )
      }
    </AsyncView>
  );
}
