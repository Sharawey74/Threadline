import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import './pdf.css';

/**
 * pdf.js parses in a Web Worker — a separate script run off the main thread.
 *
 * Vite rewrites this URL at build time so it resolves against whatever origin
 * serves the page, which under Wails is an embedded asset server rather than a
 * real web server. This was the riskiest assumption in the entire stack
 * decision, and the Phase 0 spike proved it: the worker loads inside WebView2
 * with no workaround.
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * A page is fitted to the width it is given, between these bounds.
 *
 * The floor stops a very narrow window rendering text too small to read — the
 * page overflows and scrolls instead, which is recoverable. The ceiling stops
 * a small-format document being magnified past the point where its own raster
 * content turns soft.
 */
const MIN_PAGE_WIDTH = 320;
const MAX_SCALE = 3;

export interface PdfViewerProps {
  /** Base64 document bytes, delivered over IPC. The frontend never reads disk. */
  data: string;
  /** The page to open at — where the user stopped last time. */
  initialPage: number | null;
  /** Called when the page changes, so the position survives a close. */
  onPageChange?: (page: number) => void;
  /** For the accessible name; the viewer never resolves it itself. */
  title: string;
}

type Load =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; pages: number };

export function PdfViewer({ data, initialPage, onPageChange, title }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The scrolling box the page is fitted into. */
  const holderRef = useRef<HTMLDivElement | null>(null);
  /**
   * The document lives in a ref, never in state.
   *
   * pdf.js is imperative and React is declarative. Holding a PDFDocumentProxy
   * in state would make every re-render diff a large opaque object, and the
   * canvas would flicker and lose its scroll position. Keeping it outside the
   * render cycle is the pattern the spike validated.
   */
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [page, setPage] = useState(initialPage ?? 1);
  const [activeData, setActiveData] = useState(data);
  /**
   * The width available to the page, measured rather than assumed.
   *
   * Zero until the observer has reported once, which is also the value under
   * jsdom; the render treats that as "not measured" and falls back to the
   * page's intrinsic width rather than rendering something of size zero.
   */
  const [width, setWidth] = useState(0);

  // Opening a different document resets during render rather than in an
  // effect, so the previous PDF's page is never painted under the new one's
  // page counter for a frame.
  if (data !== activeData) {
    setActiveData(data);
    setLoad({ status: 'loading' });
    setPage(initialPage ?? 1);
  }

  // ── Load the document once per set of bytes ────────────────────────
  useEffect(() => {
    let live = true;
    const task = pdfjsLib.getDocument({ data: base64ToBytes(data) });

    task.promise.then(
      (doc) => {
        // The cleanup below already destroyed the loading task, which tears
        // down the document and its worker with it. Nothing to release here.
        if (!live) return;
        docRef.current = doc;
        // Clamp rather than fail. A stored position can outlive the file it
        // points into - the PDF may have been replaced with a shorter one -
        // and refusing to open is a worse answer than opening at the end.
        setPage((p) => Math.min(Math.max(p, 1), doc.numPages));
        setLoad({ status: 'ready', pages: doc.numPages });
      },
      (err: unknown) => {
        if (!live) return;
        setLoad({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      },
    );

    return () => {
      live = false;
      // Destroying the loading task releases the document and terminates its
      // worker. A viewer that leaked a worker per opened PDF would breach the
      // 300 MB memory target after a handful of files (N3).
      void task.destroy();
      docRef.current = null;
    };
  }, [data]);

  // ── Measure the space a page has ───────────────────────────────────
  useEffect(() => {
    const holder = holderRef.current;
    if (holder === null) return;

    // contentRect is the content box, so the padding around the page is
    // already excluded and the value is the width a page may actually use.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(holder);

    return () => {
      observer.disconnect();
    };
  }, []);

  // ── Render the current page ────────────────────────────────────────
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (doc === null || canvas === null || load.status !== 'ready') return;

    let task: RenderTask | null = null;
    let live = true;

    void doc.getPage(page).then((p) => {
      if (!live) return;

      const ctx = canvas.getContext('2d');
      if (ctx === null) return;

      /*
       * Fit the page to its width instead of a fixed magnification.
       *
       * A hardcoded scale renders every document at the same magnification
       * whatever its intrinsic page size, so a study PDF authored small
       * arrived unreadable while a large one overflowed. Reading is the whole
       * product: the page should use the width it has.
       */
      const base = p.getViewport({ scale: 1 });
      const available = width > 0 ? width : base.width;
      const fit = Math.min(Math.max(available, MIN_PAGE_WIDTH) / base.width, MAX_SCALE);

      /*
       * The canvas is drawn in device pixels and displayed in CSS pixels.
       * Windows runs this display at a scale factor and WebView2 passes it
       * through, so drawing at CSS size on a 150% display renders the text
       * soft — the one thing a reading tool cannot afford.
       */
      const ratio = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: fit * ratio });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${String(Math.round(base.width * fit))}px`;
      canvas.style.height = `${String(Math.round(base.height * fit))}px`;

      task = p.render({ canvas, canvasContext: ctx, viewport });
      task.promise.catch((err: unknown) => {
        // Cancelling an in-flight render is normal when pages are turned
        // quickly. It is not an error worth showing anyone.
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
        setLoad({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    });

    return () => {
      live = false;
      // A render still drawing when the page changes would paint the old page
      // over the new one.
      task?.cancel();
    };
  }, [page, load, width]);

  // ── Remember where the user stopped ────────────────────────────────
  useEffect(() => {
    if (load.status !== 'ready') return;
    onPageChange?.(page);
  }, [page, load, onPageChange]);

  const go = useCallback(
    (delta: number) => {
      setPage((p) => {
        const max = load.status === 'ready' ? load.pages : p;
        return Math.min(Math.max(p + delta, 1), max);
      });
    },
    [load],
  );

  if (load.status === 'failed') {
    return (
      <div className="pdf-state" role="alert">
        <p className="pdf-state-title">Could not open {title}</p>
        <p className="pdf-state-detail">{load.message}</p>
      </div>
    );
  }

  return (
    <div className="pdf">
      <div className="pdf-bar">
        <button
          type="button"
          onClick={() => {
            go(-1);
          }}
          disabled={load.status !== 'ready' || page <= 1}
          aria-label="Previous page"
        >
          ‹
        </button>

        <span className="pdf-position" aria-live="polite">
          {load.status === 'ready' ? `Page ${page} of ${load.pages}` : 'Opening…'}
        </span>

        <button
          type="button"
          onClick={() => {
            go(1);
          }}
          disabled={load.status !== 'ready' || page >= load.pages}
          aria-label="Next page"
        >
          ›
        </button>
      </div>

      <div className="pdf-page" ref={holderRef}>
        {/* The canvas stays mounted across page changes. Unmounting it would
            drop the scroll position on every turn. */}
        <canvas ref={canvasRef} aria-label={`${title}, page ${String(page)}`} />
      </div>
    </div>
  );
}

/** Bytes arrive base64-encoded because the bridge carries JSON, not binary. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}
