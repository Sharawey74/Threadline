package plan

// Role is what a plan item is *for*. The distinction is not cosmetic: the file
// states the same 292 hours three different ways, and a model that treats every
// checkbox alike over-reports the budget by 28% (Schema §2).
//
// Only RoleSchedule items count toward the hour budget. Everything else
// describes work that schedule items pay for.
type Role string

const (
	RoleSchedule   Role = "schedule"   // a month or date block: hours are authoritative
	RoleCurriculum Role = "curriculum" // a numbered topic linked to a folder: hours are descriptive
	RoleScope      Role = "scope"      // what a deliverable must contain: carries no hours
	RoleAdmin      Role = "admin"      // anything else
)

// Confidence records how sure the parser is about an extracted number, so
// ambiguity in the source surfaces as data rather than hiding as a silent wrong
// guess. Nothing that is not High should ever be displayed as fact (C5).
type Confidence string

const (
	ConfHigh Confidence = "high" // the figure was emphasised, so it was written deliberately
	ConfLow  Confidence = "low"  // a bare figure; plausible but unmarked
	ConfNone Confidence = "none" // nothing found
)

// Item is one checkbox line.
//
// LineNo and Column exist for write-back and nothing else. They are position,
// not identity - Anchor is identity (Schema §5), because editing any line above
// this one moves it without changing what it is.
type Item struct {
	Anchor  string // sha256 of role+section+normalised text; stable across line moves
	LineNo  int    // 1-based
	Column  int    // 0-based byte offset of '[' within the line
	Checked bool
	Raw     string // the line exactly as read, for byte-exact write-back
	Text    string // markup stripped, for display and anchoring
	Section string
	Role    Role

	Order int // leading "**N.**", 0 when absent

	Hours     float64
	HoursConf Confidence
	Pages     int
	PagesConf Confidence

	Backticks []string
	Notes     []string // why something was ambiguous - never discarded
}

// HasHours reports whether an hour figure was found at all. Callers must check
// this rather than testing Hours != 0: "0h" and "no hours stated" are different
// facts, and conflating them is how a budget silently loses time.
func (i Item) HasHours() bool { return i.HoursConf != ConfNone }

// HasPages reports whether a page count was found. Same reasoning as HasHours.
func (i Item) HasPages() bool { return i.PagesConf != ConfNone }
