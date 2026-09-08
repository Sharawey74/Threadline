package workspace

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Sharawey74/Threadline/core/plan"
	"github.com/Sharawey74/Threadline/core/scan"
	"github.com/Sharawey74/Threadline/core/store"
)

// ErrPlanFileNotWritable reports an attempt to rewrite the plan file.
//
// The plan file changes through one path only: a checkbox tick spliced
// byte-exactly (C3). A full-file rewrite cannot promise that nothing else
// moved, and the entire plan depends on nothing else moving.
var ErrPlanFileNotWritable = errors.New(
	"the plan file is modified only by ticking a checkbox")

// Service is everything the bridge needs, with no Wails in sight.
//
// The bridge is a binding layer: it converts arguments and returns values.
// Every decision lives here, which is what keeps the logic testable without a
// window and portable if Wails is ever replaced (C1).
type Service struct {
	root        *Root
	store       *store.Store
	snapshotDir string
	now         func() time.Time
}

// NewService wires a workspace over a career root and a store.
func NewService(root *Root, st *store.Store, snapshotDir string) *Service {
	return &Service{root: root, store: st, snapshotDir: snapshotDir, now: time.Now}
}

// Artifact is a file as the frontend sees it.
type Artifact struct {
	ID    int64  `json:"id"`
	Path  string `json:"path"`
	Title string `json:"title"`
	Ext   string `json:"ext"`
	// IsPlanFile tells the UI to withhold the editor. It is a convenience for
	// the interface, never a permission: WriteArtifact re-derives the answer
	// rather than trusting anything that made the round trip.
	IsPlanFile bool `json:"isPlanFile"`
}

// Content is a file's body, ready to render.
type Content struct {
	ArtifactID int64  `json:"artifactId"`
	Kind       string `json:"kind"` // markdown | pdf | text
	Body       string `json:"body"` // PDFs are base64; text arrives as-is
}

// Plan parses the plan file into the derived model.
func (s *Service) Plan() (*plan.Plan, error) {
	content, err := os.ReadFile(s.root.PlanFile()) // #nosec G304 -- resolved from the career root
	if err != nil {
		return nil, fmt.Errorf("read plan file: %w", err)
	}
	resolver := &plan.Resolver{Root: s.root.Dir()}
	return plan.ParseDocument(string(content), resolver), nil
}

// Topics lists the study folders on disk.
func (s *Service) Topics() ([]plan.Topic, error) {
	return scan.Topics(s.root.Dir())
}

// Reconciliation runs the generated check set.
func (s *Service) Reconciliation() ([]plan.Check, error) {
	p, err := s.Plan()
	if err != nil {
		return nil, err
	}
	topics, err := s.Topics()
	if err != nil {
		return nil, err
	}
	return plan.Reconcile(p, topics), nil
}

// Material lists a topic's files, registering each so it has a stable id.
func (s *Service) Material(topicSlug string) ([]Artifact, error) {
	names, err := scan.Material(s.root.Dir(), topicSlug)
	if err != nil {
		return nil, fmt.Errorf("list material for %q: %w", topicSlug, err)
	}

	out := make([]Artifact, 0, len(names)+1)
	for _, name := range names {
		rel := filepath.ToSlash(filepath.Join(scan.StudyDir, topicSlug, name))
		a, err := s.register(rel)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

// register records a file and returns it as the frontend sees it.
func (s *Service) register(rel string) (Artifact, error) {
	id, err := s.store.UpsertArtifact(rel, s.now())
	if err != nil {
		return Artifact{}, err
	}
	abs, err := s.root.Resolve(rel)
	if err != nil {
		return Artifact{}, err
	}
	return Artifact{
		ID:         id,
		Path:       rel,
		Title:      strings.TrimSuffix(filepath.Base(rel), filepath.Ext(rel)),
		Ext:        strings.ToLower(filepath.Ext(rel)),
		IsPlanFile: s.root.IsPlanFile(abs),
	}, nil
}

// ReadArtifact returns a file's contents.
func (s *Service) ReadArtifact(id int64) (Content, error) {
	abs, ext, err := s.locate(id)
	if err != nil {
		return Content{}, err
	}

	raw, err := os.ReadFile(abs) // #nosec G304 -- resolved from a registered artifact
	if err != nil {
		return Content{}, fmt.Errorf("read artifact %d: %w", id, err)
	}

	return Content{ArtifactID: id, Kind: kindOf(ext), Body: encode(ext, raw)}, nil
}

// WriteArtifact saves an edited file.
//
// It refuses the plan file, and it re-derives that answer from the resolved
// path rather than trusting the id, the extension, or the IsPlanFile flag that
// travelled to the frontend and back. A UI flag must never be the only thing
// standing between a full-file rewrite and the plan file.
func (s *Service) WriteArtifact(id int64, content string) error {
	abs, ext, err := s.locate(id)
	if err != nil {
		return err
	}

	if s.root.IsPlanFile(abs) {
		return ErrPlanFileNotWritable
	}
	if kindOf(ext) != "markdown" {
		return fmt.Errorf("artifact %d is %s, and only markdown is editable", id, ext)
	}

	return writeFileAtomic(abs, []byte(content))
}

// Tick sets a checkbox in the plan file, taking the day's snapshot first.
func (s *Service) Tick(anchor string, checked bool) error {
	p, err := s.Plan()
	if err != nil {
		return err
	}

	for _, item := range p.Items {
		if item.Anchor != anchor {
			continue
		}
		_, err := plan.TickWithSnapshot(plan.TickOptions{
			Path:    s.root.PlanFile(),
			Anchor:  anchor,
			Checked: checked,
			Role:    item.Role,
			Section: item.Section,
		}, s.snapshotDir, s.now())
		return err
	}

	// A stale anchor is refused rather than written to whatever line now sits
	// at that position.
	return fmt.Errorf("no plan item with anchor %s", anchor)
}

// locate resolves a registered artifact id to a path inside the career root.
func (s *Service) locate(id int64) (abs, ext string, err error) {
	a, err := s.store.ArtifactByID(id)
	if err != nil {
		return "", "", err
	}
	abs, err = s.root.Resolve(a.Path)
	if err != nil {
		return "", "", err
	}
	return abs, a.Ext, nil
}

func kindOf(ext string) string {
	switch strings.ToLower(ext) {
	case ".md":
		return "markdown"
	case ".pdf":
		return "pdf"
	default:
		return "text"
	}
}

// encode prepares a body for the JSON boundary. PDFs are binary and cannot
// cross it as text.
func encode(ext string, raw []byte) string {
	if kindOf(ext) == "pdf" {
		return base64Encode(raw)
	}
	return string(raw)
}

// Position is where the user stopped in a document.
type Position = store.Position

// Budget is hours allocated against hours actually measured.
type Budget struct {
	AllocatedHours float64 `json:"allocatedHours"`
	// Nil when nothing was ever recorded. A period the app did not run is not
	// a period of no work, and rendering 0h for it would be the invented
	// number C5 forbids.
	SpentHours *float64       `json:"spentHours"`
	Periods    []BudgetPeriod `json:"periods"`
}

// BudgetPeriod is one schedule section's allocation.
type BudgetPeriod struct {
	Section        string   `json:"section"`
	AllocatedHours float64  `json:"allocatedHours"`
	SpentHours     *float64 `json:"spentHours"`
	Measured       bool     `json:"measured"`
}

// SavePosition records where the user stopped.
func (s *Service) SavePosition(artifactID int64, page int) error {
	if _, _, err := s.locate(artifactID); err != nil {
		return err
	}
	return s.store.SavePosition(artifactID, page, s.now())
}

// Position returns where the user stopped, or an empty position.
func (s *Service) Position(artifactID int64) (Position, error) {
	return s.store.Position(artifactID)
}

// StartSession opens a session. The lifecycle proper is I5.
func (s *Service) StartSession(scopeKind, scopeRef string) (int64, error) {
	return s.store.StartSession(scopeKind, scopeRef, s.now())
}

// EndSession closes a session. The lifecycle proper is I5.
func (s *Service) EndSession(id int64, note, reason string) error {
	return s.store.EndSession(id, note, reason, s.now())
}

// BudgetStatus reports the plan's allocation against what was measured.
//
// Allocation comes from the plan file's schedule sections — the only role that
// counts toward the budget (Schema §2). Measurement comes from recorded
// sessions, and stays nil until something has actually been recorded: every
// period is reported as unmeasured rather than as zero.
func (s *Service) BudgetStatus() (Budget, error) {
	p, err := s.Plan()
	if err != nil {
		return Budget{}, err
	}

	secs, measured, err := s.store.MeasuredSeconds()
	if err != nil {
		return Budget{}, err
	}

	b := Budget{}
	if measured {
		hours := float64(secs) / 3600
		b.SpentHours = &hours
	}

	for _, sec := range p.SectionsWithRole(plan.SecSchedule) {
		if !sec.HasBudget() {
			continue
		}
		b.AllocatedHours += sec.Budget
		b.Periods = append(b.Periods, BudgetPeriod{
			Section:        sec.Title,
			AllocatedHours: sec.Budget,
			// Per-period attribution needs sessions to carry a scope, which
			// is I5. Until then every period is honestly unmeasured rather
			// than credited with time it cannot account for.
			SpentHours: nil,
			Measured:   false,
		})
	}

	return b, nil
}
