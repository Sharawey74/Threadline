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
// folder.
//
// The tree is indexed once, lazily, on the first span that needs searching.
// Walking per span is O(spans x tree) and one real line carries four spans;
// against a real career folder that was slow enough to be unusable. The index
// lives only as long as the Resolver, which is one scan - the derived model is
// rebuilt whenever a source file's hash changes, so a longer-lived cache would
// outlive the thing it describes.
type Resolver struct {
	Root string

	indexed bool
	byPath  map[string]LinkKind // lowercased path relative to root
	byBase  map[string]string   // lowercased basename -> first path seen
}

// Resolve applies Schema §4.4: a backtick span is a link only if it resolves
// against the filesystem.
//
// Order matters and was learned the hard way. The direct path is tried FIRST,
// because recursive walking does not descend into symlinked directories - on
// Windows, OneDrive folders and junctions are common, and a recursive-only
// implementation reported every topic folder as unresolved while a direct probe
// found all of them.
func (r *Resolver) Resolve(span string) Link {
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

// search answers from the index, building it on first use.
func (r *Resolver) search(span string) (rel string, kind LinkKind, ok bool) {
	r.buildIndex()

	want := strings.ToLower(filepath.ToSlash(span))
	if kind, hit := r.byPath[want]; hit {
		return want, kind, true
	}

	// Path-suffix match: "06 - System Design/_Archive/x.pdf" should find
	// "Study guided & notes/06 - System Design/_Archive/x.pdf".
	for p, kind := range r.byPath {
		if strings.HasSuffix(p, "/"+want) {
			return p, kind, true
		}
	}

	if p, hit := r.byBase[strings.ToLower(filepath.Base(filepath.FromSlash(span)))]; hit {
		return p, r.byPath[p], true
	}

	return "", LinkNone, false
}

// buildIndex walks the career root once, recording every path and basename.
//
// Traversal is explicitly symlink-aware: WalkDir uses Lstat and will not
// descend into a symlinked directory, so those subtrees are walked separately
// with a visited set keyed on the resolved path to prevent cycles. On Windows
// this matters - OneDrive folders, junctions and hardlinked directories are all
// common in a folder like this.
func (r *Resolver) buildIndex() {
	if r.indexed {
		return
	}
	r.indexed = true
	r.byPath = map[string]LinkKind{}
	r.byBase = map[string]string{}

	visited := map[string]bool{}

	var walk func(dir string)
	walk = func(dir string) {
		real, err := filepath.EvalSymlinks(dir)
		if err != nil || visited[real] {
			return
		}
		visited[real] = true

		_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil // an unreadable directory is not a parse failure
			}
			if d.Type()&fs.ModeSymlink != 0 {
				if fi, statErr := os.Stat(path); statErr == nil && fi.IsDir() {
					walk(path) // WalkDir will not follow this itself
				}
				return nil
			}

			p, relErr := filepath.Rel(r.Root, path)
			if relErr != nil || p == "." {
				return nil
			}
			slash := strings.ToLower(filepath.ToSlash(p))

			kind := LinkFile
			if d.IsDir() {
				kind = LinkFolder
			}
			r.byPath[slash] = kind
			if _, seen := r.byBase[strings.ToLower(d.Name())]; !seen {
				r.byBase[strings.ToLower(d.Name())] = filepath.ToSlash(p)
			}
			return nil
		})
	}

	walk(r.Root)
}

// ResolveAll resolves every span on a line and picks the item's project.
//
// Rule (Schema §4.4): when several spans resolve and exactly one is a folder,
// the folder is the project and the files are references. Anything else is
// marked ambiguous for the UI to ask about, rather than guessed at.
func (r *Resolver) ResolveAll(spans []string) (links []Link, project *Link, notes []string) {
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
