package plan

import "testing"

// Schema §4.2. Every case below is a line shape the real plan file contains, or
// a trap the rule exists to avoid.
func TestPickHours(t *testing.T) {
	tests := []struct {
		name  string
		line  string
		hours float64
		conf  Confidence
	}{
		{
			name:  "italic allocation",
			line:  "Delete the duplicate pages — *0.5h*",
			hours: 0.5,
			conf:  ConfHigh,
		},
		{
			name:  "bold allocation inside the emphasised span",
			line:  "**Notes track — 15h** (topics 1 and 2)",
			hours: 15,
			conf:  ConfHigh,
		},
		{
			name:  "tilde estimate is deliberate",
			line:  "**1. `02 - Databases & Storage`** — 49pp, ~7h — ACID",
			hours: 7,
			conf:  ConfHigh,
		},
		{
			// The whole point of the rule. "175pp, ~35h" is this item's own
			// estimate; a bare figure elsewhere must not outrank it.
			name:  "emphasised beats plain regardless of position",
			line:  "5. System Design — 175pp, ~35h — covers 12h of video",
			hours: 35,
			conf:  ConfHigh,
		},
		{
			// These lines read as description ending in the commitment.
			name:  "last emphasised wins when several are marked",
			line:  "*2h* of reading then *3h* of practice",
			hours: 3,
			conf:  ConfHigh,
		},
		{
			// Nothing was declared, so the figure is reported but not trusted.
			name:  "bare figure is low confidence",
			line:  "Roughly 4h of work here",
			hours: 4,
			conf:  ConfLow,
		},
		{
			name:  "no hours at all",
			line:  "Playwright suite with page-object model",
			hours: 0,
			conf:  ConfNone,
		},
		{
			name:  "fractional hours survive",
			line:  "Shortlist repos — *1.5h*",
			hours: 1.5,
			conf:  ConfHigh,
		},
		{
			// "h" must be a word boundary. Without \b this matches the "3h" in
			// "3hrs"... and worse, invents hours from words like "5th".
			name:  "does not match h inside a word",
			line:  "Finish the 5th chapter and the 12th appendix",
			hours: 0,
			conf:  ConfNone,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, conf, _ := PickHours(FindHours(Normalise(tt.line)))
			if conf != tt.conf {
				t.Errorf("confidence = %v, want %v", conf, tt.conf)
			}
			if conf != ConfNone && got != tt.hours {
				t.Errorf("hours = %v, want %v", got, tt.hours)
			}
		})
	}
}

func TestEmphasisClassification(t *testing.T) {
	tests := []struct {
		line string
		want Emphasis
	}{
		{"**Notes track — 15h**", EmphBold},
		{"*0.5h*", EmphItalic},
		{"~7h", EmphTilde},
		{"15h", EmphPlain},
	}
	for _, tt := range tests {
		t.Run(string(tt.want), func(t *testing.T) {
			m := FindHours(Normalise(tt.line))
			if len(m) != 1 {
				t.Fatalf("found %d figures, want 1", len(m))
			}
			if m[0].Emphasis != tt.want {
				t.Errorf("emphasis = %v, want %v", m[0].Emphasis, tt.want)
			}
		})
	}
}

// Ambiguity must surface as data, never be resolved silently - that is the rule
// that makes the parser inspectable rather than merely correct today.
func TestMultipleFiguresAlwaysNoted(t *testing.T) {
	_, _, notes := PickHours(FindHours("*2h* of reading then *3h* of practice"))
	if len(notes) == 0 {
		t.Fatal("two figures on a line produced no note")
	}

	_, _, notes = PickHours(FindHours("just *2h*"))
	if len(notes) != 0 {
		t.Errorf("single unambiguous figure produced a note: %v", notes)
	}
}

// 0h stated and no hours stated are different facts. The budget depends on
// telling them apart.
func TestZeroHoursIsNotAbsence(t *testing.T) {
	v, conf, _ := PickHours(FindHours("cancelled — *0h*"))
	if conf != ConfHigh || v != 0 {
		t.Fatalf("got %v/%v, want 0/high", v, conf)
	}
	i := Item{Hours: v, HoursConf: conf}
	if !i.HasHours() {
		t.Error("HasHours() = false for an explicit 0h")
	}
}
