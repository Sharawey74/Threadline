package plan

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// LinkKind is what a backtick span turned out to be.
//
// The distinction between LinkNone and LinkUnresolved is the point of this
// file: one is a code snippet that was never a path, the other is a path that
// has stopped working. Reporting the first as broken would cry wolf; hiding the
// second would let a link rot silently.
type LinkKind string

const (
	LinkFolder     LinkKind = "folder"     // resolved to a directory
	LinkFile       LinkKind = "file"       // resolved to a file
	LinkAmbiguous  LinkKind = "ambiguous"  // several spans resolved; the UI must ask
	LinkNone       LinkKind = "none"       // cannot be a path - a code snippet
	LinkUnresolved LinkKind = "unresolved" // path-shaped, but not on disk
)

// backtickRe captures the contents of each `...` span.
var backtickRe = regexp.MustCompile("`([^`]+)`")

// FindBackticks returns every backtick span on the line, in order.
func FindBackticks(text string) []string {
	var out []string
	for _, m := range backtickRe.FindAllStringSubmatch(text, -1) {
		out = append(out, m[1])
	}
	return out
}

// illegalInPath are characters Windows forbids in a file name. A span
// containing one cannot be a path, so it is a code snippet with certainty
// rather than a link that failed to resolve.
//
// This refines Schema §4.4, which decides purely on whether a span resolves.
// Resolution alone cannot tell "code snippet" from "file that was deleted", and
// the difference matters: only the second deserves the user's attention.
const illegalInPath = `"<>|?*`

// Link is the outcome of resolving one backtick span.
type Link struct {
	Span   string // the text between the backticks, as written
	Kind   LinkKind
	Target string // path relative to the career root; empty unless resolved
	Reason string // why it did not resolve - never discarded
}

// Resolver turns backtick spans into filesystem links, rooted at a career
// folder. It caches nothing: the derived model is rebuilt whenever a source
// file's hash changes, and a stale path cache would outlive that.
type Resolver struct {
	Root string
}

// Resolve applies Schema §4.4: a backtick span is a link only if it resolves
// against the filesystem.
//
// Order matters and was learned the hard way. The direct path is tried FIRST,
// because recursive walking does not descend into symlinked directories - on
// Windows, OneDrive folders and junctions are common, and a recursive-only
// implementation reported every topic folder as unresolved while a direct probe
// found all of them.
func (r Resolver) Resolve(span string) Link {
	l := Link{Span: span, Kind: LinkNone}

	if strings.ContainsAny(span, illegalInPath) {
		l.Reason = "contains characters that cannot appear in a path"
		return l
	}
	if strings.TrimSpace(span) == "" {
		l.Reason = "empty span"
		return l
	}

	// 1. Direct path relative to the career root.
	if kind, ok := statKind(filepath.Join(r.Root, filepath.FromSlash(span))); ok {
		l.Kind, l.Target = kind, filepath.ToSlash(span)
		return l
	}

	// 2. Exact basename, or path-suffix, anywhere beneath the root.
	if rel, kind, ok := r.search(span); ok {
		l.Kind, l.Target = kind, rel
		return l
	}

	l.Kind = LinkUnresolved
	l.Reason = "does not exist on disk"
	return l
}

func statKind(path string) (LinkKind, bool) {
	fi, err := os.Stat(path) // Stat, not Lstat: a symlink to a folder IS a folder
	if err != nil {
		return LinkNone, false
	}
	if fi.IsDir() {
		return LinkFolder, true
	}
	return LinkFile, true
}

// search walks the tree looking for a basename or path-suffix match.
//
// Traversal is explicitly symlink-aware: WalkDir uses Lstat and will not
// descend into a symlinked directory, so those subtrees are walked separately
// with a visited set keyed on the resolved path to prevent cycles.
func (r Resolver) search(span string) (rel string, kind LinkKind, ok bool) {
	want := strings.ToLower(filepath.ToSlash(span))
	base := strings.ToLower(filepath.Base(filepath.FromSlash(span)))

	visited := map[string]bool{}
	var found string
	var foundKind LinkKind

	var walk func(dir string)
	walk = func(dir string) {
		real, err := filepath.EvalSymlinks(dir)
		if err != nil || visited[real] {
			return
		}
		visited[real] = true

		_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil || found != "" {
				return nil // an unreadable directory is not a parse failure
			}
			if d.Type()&fs.ModeSymlink != 0 {
				if fi, err := os.Stat(path); err == nil && fi.IsDir() {
					walk(path) // WalkDir will not follow this itself
				}
				return nil
			}

			p, err := filepath.Rel(r.Root, path)
			if err != nil {
				return nil
			}
			slash := strings.ToLower(filepath.ToSlash(p))

			if slash == want || strings.HasSuffix(slash, "/"+want) ||
				strings.ToLower(d.Name()) == base {
				found = filepath.ToSlash(p)
				foundKind = LinkFile
				if d.IsDir() {
					foundKind = LinkFolder
				}
			}
			return nil
		})
	}

	walk(r.Root)
	if found == "" {
		return "", LinkNone, false
	}
	return found, foundKind, true
}

// ResolveAll resolves every span on a line and picks the item's project.
//
// Rule (Schema §4.4): when several spans resolve and exactly one is a folder,
// the folder is the project and the files are references. Anything else is
// marked ambiguous for the UI to ask about, rather than guessed at.
func (r Resolver) ResolveAll(spans []string) (links []Link, project *Link, notes []string) {
	links = make([]Link, 0, len(spans))
	for _, s := range spans {
		links = append(links, r.Resolve(s))
	}

	var folders []int
	for i, l := range links {
		if l.Kind == LinkFolder {
			folders = append(folders, i)
		}
		if l.Kind == LinkUnresolved {
			notes = append(notes, "`"+l.Span+"` "+l.Reason)
		}
	}

	if len(spans) > 1 {
		notes = append(notes, plural(len(spans))+" backtick spans on one line")
	}

	switch len(folders) {
	case 0:
		return links, nil, notes
	case 1:
		return links, &links[folders[0]], notes
	default:
		notes = append(notes, "several folders resolved - project is ambiguous")
		return links, nil, notes
	}
}

func plural(n int) string {
	switch n {
	case 2:
		return "2"
	case 3:
		return "3"
	case 4:
		return "4"
	default:
		return "several"
	}
}
