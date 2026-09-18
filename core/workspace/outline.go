package workspace

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Sharawey74/Threadline/core/plan"
)

// An outline is a sidecar beside a PDF, `<stem>.outline.md` (C12). It exists
// only once the user imports one: nothing on a scan or an open writes it.

// OutlineView is what the PDF record shows. Exists is false for a PDF with no
// outline yet, which is an invitation, not an error.
type OutlineView struct {
	Exists   bool                 `json:"exists"`
	Outline  plan.Outline         `json:"outline"`
	Ranges   []plan.PageRange     `json:"ranges"`
	Progress plan.OutlineProgress `json:"progress"`
}

// outlinePath resolves a registered PDF to its outline's path.
func (s *Service) outlinePath(id int64) (string, error) {
	abs, ext, err := s.locate(id)
	if err != nil {
		return "", err
	}
	if kindOf(ext) != "pdf" {
		return "", fmt.Errorf("artifact %d is %s; outlines belong to PDFs", id, ext)
	}
	return sidecar(abs, ".outline.md"), nil
}

// sidecar names a file beside the source: `paper.pdf` -> `paper<suffix>`.
func sidecar(abs, suffix string) string {
	return strings.TrimSuffix(abs, filepath.Ext(abs)) + suffix
}

// Outline reads a PDF's outline, if it has one. It never creates one.
func (s *Service) Outline(id int64) (OutlineView, error) {
	path, err := s.outlinePath(id)
	if err != nil {
		return OutlineView{}, err
	}
	o, err := plan.ReadOutline(path)
	if errors.Is(err, os.ErrNotExist) {
		return OutlineView{Outline: plan.Outline{Sections: []plan.OutlineSection{}}, Ranges: []plan.PageRange{}}, nil
	}
	if err != nil {
		return OutlineView{}, err
	}
	return OutlineView{Exists: true, Outline: o, Ranges: o.Ranges(), Progress: o.Progress()}, nil
}

// SaveOutline writes an imported outline beside its PDF. The source file is
// only resolved, never opened for writing.
func (s *Service) SaveOutline(id int64, o plan.Outline) error {
	path, err := s.outlinePath(id)
	if err != nil {
		return err
	}
	clean := plan.Outline{Total: o.Total, Sections: make([]plan.OutlineSection, 0, len(o.Sections))}
	if clean.Total < 0 {
		return fmt.Errorf("page total %d is negative", o.Total)
	}
	for i, sec := range o.Sections {
		title := cleanTitle(sec.Title)
		if title == "" {
			return fmt.Errorf("section %d has no title", i+1)
		}
		if sec.Page < 0 {
			return fmt.Errorf("section %q starts on page %d", title, sec.Page)
		}
		clean.Sections = append(clean.Sections, plan.OutlineSection{Title: title, Page: sec.Page})
	}
	if i, j, dup := duplicate(clean.Sections); dup {
		return fmt.Errorf("sections %d and %d are both %q on page %d; give one a different title or page",
			i+1, j+1, clean.Sections[i].Title, clean.Sections[i].Page)
	}

	ticks, err := existingTicks(path)
	if err != nil {
		return err
	}
	for i := range clean.Sections {
		title := clean.Sections[i].Title
		if queue := ticks[title]; len(queue) > 0 {
			clean.Sections[i].Checked = queue[0]
			ticks[title] = queue[1:]
		}
	}
	return writeFileAtomic(path, []byte(plan.FormatOutline(clean)))
}

// existingTicks reads the tick state of an outline being replaced, by title.
// Repeated titles keep their order, so the nth "Review" inherits the nth
// one's tick. Titles are compared exactly, after the same cleaning as a save.
func existingTicks(path string) (map[string][]bool, error) {
	ticks := map[string][]bool{}
	old, err := plan.ReadOutline(path)
	if errors.Is(err, os.ErrNotExist) {
		return ticks, nil
	}
	if err != nil {
		return nil, err
	}
	for _, sec := range old.Sections {
		title := cleanTitle(sec.Title)
		ticks[title] = append(ticks[title], sec.Checked)
	}
	return ticks, nil
}

// TickSection ticks one section of a PDF's outline. The caller names the
// section by position and title; if the title there has changed since the
// caller read it, nothing is written.
func (s *Service) TickSection(id int64, index int, title string, checked bool) error {
	path, err := s.outlinePath(id)
	if err != nil {
		return err
	}
	o, err := plan.ReadOutline(path)
	if err != nil {
		return err
	}
	if index < 0 || index >= len(o.Sections) || o.Sections[index].Title != cleanTitle(title) {
		return fmt.Errorf("no section %d titled %q in the outline", index, title)
	}
	// Identical lines share an anchor, so the write would land on the first
	// of them, whichever was meant. Refuse rather than tick the wrong one.
	for j, other := range o.Sections {
		if j != index && other.Title == o.Sections[index].Title && other.Page == o.Sections[index].Page {
			return fmt.Errorf("the outline lists %q on page %d twice; edit it so each line is unique",
				other.Title, other.Page)
		}
	}
	_, err = plan.TickSection(path, o.Sections[index], checked)
	return err
}

// cleanTitle makes a title one line that reads back unchanged: markup and
// dashes as the parser sees them, whitespace runs folded to one space.
func cleanTitle(title string) string {
	return strings.Join(strings.Fields(plan.StripMarkup(plan.Normalise(title))), " ")
}

// duplicate finds the first two sections with the same title and page.
func duplicate(sections []plan.OutlineSection) (int, int, bool) {
	type key struct {
		title string
		page  int
	}
	seen := map[key]int{}
	for j, s := range sections {
		k := key{s.Title, s.Page}
		if i, ok := seen[k]; ok {
			return i, j, true
		}
		seen[k] = j
	}
	return 0, 0, false
}
