package plan

import "testing"

// Tests are written against Threadline-Schema.md §4, not against parse.go.
// Where a case exists because the real file contains it, the comment says so -
// those are the ones that must never be "simplified" away later.

func TestParseCheckbox(t *testing.T) {
	tests := []struct {
		name    string
		line    string
		wantOK  bool
		checked bool
		text    string
		column  int
		order   int
	}{
		{
			name:    "unchecked with order and backtick link",
			line:    "- [ ] **1. `02 - Databases & Storage`** — 49pp, ~7h — ACID",
			wantOK:  true,
			checked: false,
			text:    "1. 02 - Databases & Storage - 49pp, ~7h - ACID",
			column:  2,
			order:   1,
		},
		{
			name:    "checked lowercase x",
			line:    "- [x] **3. `09 - AI`** — 10pp, ~3h",
			wantOK:  true,
			checked: true,
			text:    "3. 09 - AI - 10pp, ~3h",
			column:  2,
			order:   3,
		},
		{
			// Markdown accepts either case; a parser that only knew 'x' would
			// silently report finished work as outstanding.
			name:    "checked uppercase X",
			line:    "- [X] done",
			wantOK:  true,
			checked: true,
			text:    "done",
			column:  2,
			order:   0,
		},
		{
			// Indented items appear under sub-headings. The column shifts and
			// write-back depends on it being right.
			name:    "indented item records the shifted column",
			line:    "  - [ ] nested task",
			wantOK:  true,
			checked: false,
			text:    "nested task",
			column:  4,
			order:   0,
		},
		{
			name:   "prose is not a checkbox",
			line:   "Some ordinary sentence.",
			wantOK: false,
		},
		{
			// A bullet is not a task. Treating one as a task would invent items
			// that cannot be ticked.
			name:   "plain bullet is not a checkbox",
			line:   "- just a bullet",
			wantOK: false,
		},
		{
			// Guards against a loose character class. Only space, x and X mean
			// anything; '-' is a different convention this plan does not use.
			name:   "unsupported mark is not a checkbox",
			line:   "- [-] partially done",
			wantOK: false,
		},
		{
			name:   "heading is not a checkbox",
			line:   "## 9. Now → Sun 30 Aug *(19h)*",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ParseCheckbox(tt.line, 42)
			if ok != tt.wantOK {
				t.Fatalf("matched = %v, want %v", ok, tt.wantOK)
			}
			if !ok {
				return
			}
			if got.Checked != tt.checked {
				t.Errorf("Checked = %v, want %v", got.Checked, tt.checked)
			}
			if got.Text != tt.text {
				t.Errorf("Text  = %q\nwant   %q", got.Text, tt.text)
			}
			if got.Column != tt.column {
				t.Errorf("Column = %d, want %d", got.Column, tt.column)
			}
			if got.Order != tt.order {
				t.Errorf("Order = %d, want %d", got.Order, tt.order)
			}
			if got.LineNo != 42 {
				t.Errorf("LineNo = %d, want 42", got.LineNo)
			}
			if got.Raw != tt.line {
				t.Errorf("Raw was modified: %q", got.Raw)
			}
		})
	}
}

// The column must point at '[' so that write-back can splice the byte after it.
// Getting this wrong corrupts a file the entire plan depends on, so it is
// asserted directly rather than inferred from the parse tests.
func TestColumnPointsAtBracket(t *testing.T) {
	for _, line := range []string{
		"- [ ] task",
		"  - [ ] indented",
		"    -  [x]  extra spaces",
	} {
		item, ok := ParseCheckbox(line, 1)
		if !ok {
			t.Fatalf("did not match: %q", line)
		}
		if line[item.Column] != '[' {
			t.Errorf("column %d of %q is %q, want '['", item.Column, line, line[item.Column])
		}
		if got := line[item.Column+1]; got != ' ' && got != 'x' && got != 'X' {
			t.Errorf("byte after '[' is %q, want the mark", got)
		}
	}
}

// Normalisation is for matching only. If it ever leaked into Raw, write-back
// would rewrite em-dashes and the round-trip gate would fail.
func TestNormaliseDoesNotTouchRaw(t *testing.T) {
	const line = "- [ ] em—dash en–dash arrow→here"
	item, ok := ParseCheckbox(line, 1)
	if !ok {
		t.Fatal("did not match")
	}
	if item.Raw != line {
		t.Errorf("Raw = %q, want the original bytes", item.Raw)
	}
	if want := "em-dash en-dash arrow->here"; item.Text != want {
		t.Errorf("Text = %q, want %q", item.Text, want)
	}
}

// "no hours stated" and "0 hours" are different facts. Conflating them is how a
// budget silently loses time, so the distinction is asserted here.
func TestUnsetNumbersAreDistinguishable(t *testing.T) {
	item, _ := ParseCheckbox("- [ ] task with no numbers", 1)
	if item.HasHours() {
		t.Error("HasHours() = true on a line with no hours")
	}
	if item.HasPages() {
		t.Error("HasPages() = true on a line with no pages")
	}
}
