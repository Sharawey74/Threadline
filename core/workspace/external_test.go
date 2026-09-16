package workspace

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/Sharawey74/Threadline/core/scan"
)

// recordLaunches swaps the Edge launcher for one that records its arguments.
func recordLaunches(svc *Service) *[][]string {
	var calls [][]string
	svc.launch = func(args []string) error {
		calls = append(calls, slices.Clone(args))
		return nil
	}
	return &calls
}

// wantURL is the fixture PDF's URL as Edge must receive it. The career
// folder "Study guided & notes" carries both a space and an ampersand.
func wantURL(dir string) string {
	path := filepath.ToSlash(filepath.Join(dir, scan.StudyDir, "06 - System Design", "paper.pdf"))
	path = strings.ReplaceAll(path, " ", "%20")
	path = strings.ReplaceAll(path, "&", "%26")
	return "file:///" + strings.TrimPrefix(path, "/")
}

func TestOpenExternalAddsPageFragment(t *testing.T) {
	svc, dir := workspace(t)
	calls := recordLaunches(svc)

	if err := svc.OpenExternal(pdfID(t, svc), 47); err != nil {
		t.Fatal(err)
	}
	want := [][]string{{wantURL(dir) + "#page=47"}}
	if !slices.EqualFunc(*calls, want, slices.Equal) {
		t.Errorf("launched with %q, want %q", *calls, want)
	}
}

func TestOpenExternalWithoutPageOpensAtStart(t *testing.T) {
	svc, dir := workspace(t)
	calls := recordLaunches(svc)

	for _, page := range []int{0, -3} {
		if err := svc.OpenExternal(pdfID(t, svc), page); err != nil {
			t.Fatal(err)
		}
	}
	want := [][]string{{wantURL(dir)}, {wantURL(dir)}}
	if !slices.EqualFunc(*calls, want, slices.Equal) {
		t.Errorf("launched with %q, want %q", *calls, want)
	}
}

func TestOpenExternalRefusesUnknownArtifact(t *testing.T) {
	svc, dir := workspace(t)
	calls := recordLaunches(svc)
	id := pdfID(t, svc)

	if err := svc.OpenExternal(id+1000, 1); err == nil {
		t.Error("an id never registered was opened")
	}

	// Registered once, since deleted: not in the current scan.
	if err := os.Remove(filepath.Join(dir, scan.StudyDir, "06 - System Design", "paper.pdf")); err != nil {
		t.Fatal(err)
	}
	if err := svc.OpenExternal(id, 1); err == nil {
		t.Error("a deleted file was opened")
	}

	// Only PDFs open in Edge from here.
	files, _ := svc.Material("06 - System Design")
	for _, f := range files {
		if err := svc.OpenExternal(f.ID, 1); err == nil {
			t.Errorf("%s was opened in Edge", f.Path)
		}
	}
	if len(*calls) != 0 {
		t.Errorf("refused opens still launched: %q", *calls)
	}
}
