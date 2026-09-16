package plan

import (
	"slices"
	"testing"
)

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

func TestImportDotLeaders(t *testing.T) {
	got := ImportOutline("3. Indexes........ 47").Sections
	if len(got) != 1 || got[0].Title != "Indexes" || got[0].Page != 47 {
		t.Fatalf("ImportOutline = %+v, want one section Indexes at page 47", got)
	}

	// A pasted table of contents carries headings, blank lines and prose. Only
	// dot-leader lines are sections, in the order they appear.
	toc := "Contents\n\n1. Preface.... 1\n  2. Storage   ....... 9\nChapter notes\n3. Indexes........ 47\n4. No leader 50\n"
	var titles []string
	var pages []int
	for _, s := range ImportOutline(toc).Sections {
		titles = append(titles, s.Title)
		pages = append(pages, s.Page)
		if s.Checked {
			t.Errorf("%s imported ticked; an import starts every section unticked", s.Title)
		}
	}
	if !slices.Equal(titles, []string{"Preface", "Storage", "Indexes"}) || !slices.Equal(pages, []int{1, 9, 47}) {
		t.Errorf("imported %v at %v, want [Preface Storage Indexes] at [1 9 47]", titles, pages)
	}
}

func TestImportIsRescannable(t *testing.T) {
	toc := "1. Preface.... 1\n2. B-Trees — Part 2........ 9\n3. Indexes........ 47\n"
	first := ImportOutline(toc)
	first.Total = 49

	text := FormatOutline(first)
	again := ImportOutline(text)

	if !sameSections(again.Sections, first.Sections) {
		t.Errorf("re-import of\n%s\ngave %+v, want %+v", text, again.Sections, first.Sections)
	}
	if again.Total != 49 {
		t.Errorf("re-import total = %d, want 49", again.Total)
	}
	if len(again.Sections) != 3 {
		t.Errorf("re-import found %d sections, want 3", len(again.Sections))
	}
}

// sameSections compares what an import is about - title, page, order - and
// not where each line happened to sit in the text it came from.
func sameSections(a, b []OutlineSection) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Title != b[i].Title || a[i].Page != b[i].Page || a[i].Checked != b[i].Checked {
			return false
		}
	}
	return true
}

func TestSectionPageRanges(t *testing.T) {
	o := Outline{Total: 49, Sections: []OutlineSection{
		{Title: "Preface", Page: 1},
		{Title: "Storage", Page: 9},
		{Title: "Indexes", Page: 47},
	}}
	want := []PageRange{{From: 1, To: 8}, {From: 9, To: 46}, {From: 47, To: 49}}
	if got := o.Ranges(); !slices.Equal(got, want) {
		t.Errorf("Ranges() = %v, want %v", got, want)
	}

	// With no total recorded, the last section's end is unknown: it is not
	// guessed from anything (C5).
	o.Total = 0
	got := o.Ranges()
	if got[2] != (PageRange{From: 47}) || got[2].Known() {
		t.Errorf("last range with no total = %+v, want From 47 and unknown", got[2])
	}
	if !got[1].Known() || got[1].Pages() != 38 {
		t.Errorf("middle range = %+v (%d pages), want known with 38 pages", got[1], got[1].Pages())
	}

	// A total below the last start, or sections out of order, cannot give a
	// real range either.
	bad := Outline{Total: 40, Sections: []OutlineSection{{Title: "B", Page: 30}, {Title: "A", Page: 10}, {Title: "C", Page: 45}}}
	for i, r := range bad.Ranges() {
		if r.Known() {
			t.Errorf("range %d = %+v is known, want unknown", i, r)
		}
	}
}

func TestOutlineProgressCountsSectionsAndPages(t *testing.T) {
	// Nine sections covering 49 pages; the first four run 2, 2, 3 and 5
	// pages, so ticking them covers 12.
	starts := []int{1, 3, 5, 8, 13, 19, 26, 34, 42}
	o := Outline{Total: 49}
	for i, p := range starts {
		o.Sections = append(o.Sections, OutlineSection{Title: string(rune('A' + i)), Page: p, Checked: i < 4})
	}

	want := OutlineProgress{SectionsDone: 4, Sections: 9, PagesDone: 12, Pages: 49, PagesKnown: true}
	if got := o.Progress(); got != want {
		t.Errorf("Progress() = %+v, want %+v", got, want)
	}

	// Ticks elsewhere change the page figure by that section's own range.
	o.Sections[0].Checked = false
	o.Sections[8].Checked = true
	if got := o.Progress(); got.SectionsDone != 4 || got.PagesDone != 18 {
		t.Errorf("after moving a tick: %+v, want 4 sections and 18 pages", got)
	}

	// With no total there is no page figure at all, not a partial one (C5).
	o.Total = 0
	want = OutlineProgress{SectionsDone: 4, Sections: 9}
	if got := o.Progress(); got != want {
		t.Errorf("Progress() with no total = %+v, want %+v", got, want)
	}
}
