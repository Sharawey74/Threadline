package plan

import "testing"

// Tests are written against tasks/phase-8.md's criteria, not against
// outline.go. An outline is a sidecar checklist of a PDF's sections: one
// `- [ ] Title — p.N` line per section.

func TestParseOutlineReadsTitleAndPage(t *testing.T) {
	tests := []struct {
		name    string
		line    string
		wantOK  bool
		title   string
		page    int
		checked bool
	}{
		{name: "em dash", line: "- [ ] Indexes — p.47", wantOK: true, title: "Indexes", page: 47},
		// The parser folds every dash before matching, so an outline typed
		// with a different dash reads the same.
		{name: "en dash", line: "- [ ] Indexes – p.47", wantOK: true, title: "Indexes", page: 47},
		{name: "hyphen", line: "- [ ] Indexes - p.47", wantOK: true, title: "Indexes", page: 47},
		{name: "ticked", line: "- [x] Indexes — p.47", wantOK: true, title: "Indexes", page: 47, checked: true},
		{name: "trailing space", line: "- [ ] Indexes — p.47  ", wantOK: true, title: "Indexes", page: 47},
		// A dash inside the title belongs to the title; only the last one
		// before p.N separates it.
		{name: "dash in title", line: "- [ ] B-Trees — Part 2 — p.112", wantOK: true, title: "B-Trees - Part 2", page: 112},
		{name: "no page", line: "- [ ] Indexes", wantOK: false},
		{name: "page not at the end", line: "- [ ] Indexes — p.47 and more", wantOK: false},
		{name: "page with no title", line: "- [ ] — p.47", wantOK: false},
		{name: "not a checkbox", line: "Indexes — p.47", wantOK: false},
		{name: "page without the p. prefix", line: "- [ ] Indexes — 47", wantOK: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := ParseOutlineLine(tc.line, 3)
			if ok != tc.wantOK {
				t.Fatalf("ParseOutlineLine(%q) ok = %v, want %v", tc.line, ok, tc.wantOK)
			}
			if !ok {
				return
			}
			if got.Title != tc.title || got.Page != tc.page || got.Checked != tc.checked {
				t.Errorf("got title %q page %d checked %v, want %q %d %v",
					got.Title, got.Page, got.Checked, tc.title, tc.page, tc.checked)
			}
			if got.LineNo != 3 {
				t.Errorf("LineNo = %d, want 3", got.LineNo)
			}
		})
	}
}
