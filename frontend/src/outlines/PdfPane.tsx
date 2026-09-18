import { useCallback, useState } from 'react';

import { useAsync } from '../hooks/useAsync';
import { ipc } from '../ipc';
import type { Artifact, OutlineView } from '../ipc';
import { AsyncView } from '../workbench/States';

import { OutlineImport } from './OutlineImport';
import { PdfRecord } from './PdfRecord';

/**
 * A PDF, as Threadline shows it: its record, or the import screen while an
 * outline is being added or edited.
 *
 * The PDF's bytes are never read. Only its outline sidecar is.
 */
export function PdfPane({ artifact }: { artifact: Artifact }) {
  // Saving an outline remounts the loader, so the record reads the new file.
  const [version, setVersion] = useState(0);
  return (
    <OutlineLoader
      key={`${String(artifact.id)}-${String(version)}`}
      artifact={artifact}
      onSaved={() => {
        setVersion((v) => v + 1);
      }}
    />
  );
}

function OutlineLoader({ artifact, onSaved }: { artifact: Artifact; onSaved: () => void }) {
  const load = useCallback(() => ipc().getOutline(artifact.id), [artifact.id]);
  const state = useAsync(load);
  const [editing, setEditing] = useState(false);

  return (
    <AsyncView
      state={state}
      loadingLabel={`Reading the outline of ${artifact.title}…`}
      errorTitle={`Could not read the outline of ${artifact.title}`}
      emptyTitle="Nothing to show"
    >
      {(view) =>
        editing ? (
          <OutlineImport
            artifact={artifact}
            initial={view.outline}
            onSaved={onSaved}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <LiveRecord
            artifact={artifact}
            initial={view}
            onEdit={() => {
              setEditing(true);
            }}
          />
        )
      }
    </AsyncView>
  );
}

/** The record, kept current after each tick without a loading flash. */
function LiveRecord({
  artifact,
  initial,
  onEdit,
}: {
  artifact: Artifact;
  initial: OutlineView;
  onEdit: () => void;
}) {
  const [view, setView] = useState(initial);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [failure, setFailure] = useState('');

  const tick = async (index: number, checked: boolean) => {
    const section = view.outline.sections[index];
    setPending((p) => new Set(p).add(index));
    setFailure('');
    try {
      await ipc().tickSection(artifact.id, index, section.title, checked);
      setView(await ipc().getOutline(artifact.id));
    } catch (err) {
      setFailure(`Could not tick ${section.title}: ${messageOf(err)}`);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(index);
        return next;
      });
    }
  };

  const open = async (page: number) => {
    setFailure('');
    try {
      await ipc().openExternal(artifact.id, page);
    } catch (err) {
      setFailure(`Could not open ${artifact.title} in Edge: ${messageOf(err)}`);
    }
  };

  return (
    <>
      <PdfRecord
        artifact={artifact}
        view={view}
        pending={pending}
        onOpen={(page) => {
          void open(page);
        }}
        onTick={(index, checked) => {
          void tick(index, checked);
        }}
        onAddOutline={onEdit}
      />
      {failure !== '' && (
        <p className="pr-failure" role="alert">
          {failure}
        </p>
      )}
    </>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
