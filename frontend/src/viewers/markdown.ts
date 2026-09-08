import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Renders markdown to sanitised HTML.
 *
 * `marked` runs with GitHub-flavoured extensions on, because the plan file uses
 * tables throughout and F6 names them explicitly. DOMPurify then strips
 * anything script-shaped: the files are local and the app makes no network
 * calls (C6), but a renderer that trusts its input is one dependency update
 * away from being a problem.
 *
 * Kept out of the component file so React Fast Refresh can still swap the
 * component during development.
 */
export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false, gfm: true, breaks: false });
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
