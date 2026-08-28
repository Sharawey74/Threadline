package plan

import "testing"

// Schema §4.3.
func TestPickPages(t *testing.T) {
	tests := []struct {
		name  string
		line  string
		pages int
		conf  Confidence
	}{
		{
			name:  "plain count is the item's size",
			line:  "**1. `02 - Databases & Storage`** — 49pp, ~7h",
			pages: 49,
			conf:  ConfHigh,
		},
		{
			// The case the rule exists for. Summing these would double-count
			// and break the 396pp total the plan declares against itself.
			name:  "parenthesised counts describe other files and are ignored",
			line:  "5. `06 - System Design` — 175pp, ~35h — Fundamentals v3 (102pp), Q&A (25pp)",
			pages: 175,
			conf:  ConfHigh,
		},
		{
			// No size of its own. Promoting the parenthesised figure would put
			// an invented number on screen (C5).
			name:  "only-parenthesised yields nothing, not a guess",
			line:  "Delete the archived reference notes (74pp, superseded)",
			pages: 0,
			conf:  ConfNone,
		},
		{
			name:  "long form 'pages' is accepted",
			line:  "Study guide — 396 pages total",
			pages: 396,
			conf:  ConfHigh,
		},
		{
			name:  "no page counts",
			line:  "Wrap the internship",
			pages: 0,
			conf:  ConfNone,
		},
		{
			// Guards the word boundary: "12ppl" is not a page count.
			name:  "does not match pp inside a word",
			line:  "Meeting with 12ppl about the appendix",
			pages: 0,
			conf:  ConfNone,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, conf, _ := PickPages(FindPages(Normalise(tt.line)))
			if conf != tt.conf {
				t.Errorf("confidence = %v, want %v", conf, tt.conf)
			}
			if conf != ConfNone && got != tt.pages {
				t.Errorf("pages = %d, want %d", got, tt.pages)
			}
		})
	}
}

// The parenthesised figures are recorded even though they are never used - a
// number that was seen and rejected should be explainable later.
func TestRejectedPageCountsAreRecorded(t *testing.T) {
	line := Normalise("5. System Design — 175pp — Fundamentals v3 (102pp), Q&A (25pp)")
	_, _, notes := PickPages(FindPages(line))
	if len(notes) == 0 {
		t.Fatal("three page counts produced no note")
	}
	found := FindPages(line)
	if len(found) != 3 {
		t.Fatalf("found %d counts, want 3", len(found))
	}
	if found[0].Parenthesised {
		t.Error("175pp was marked parenthesised")
	}
	if !found[1].Parenthesised || !found[2].Parenthesised {
		t.Error("102pp/25pp were not marked parenthesised")
	}
}
