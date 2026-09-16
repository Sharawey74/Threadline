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
	return writeFileAtomic(path, []byte(plan.FormatOutline(clean)))
}

// cleanTitle makes a title one line that reads back unchanged: markup and
// dashes as the parser sees them, whitespace runs folded to one space.
func cleanTitle(title string) string {
	return strings.Join(strings.Fields(plan.StripMarkup(plan.Normalise(title))), " ")
}
