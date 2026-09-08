package plan

import (
	"regexp"
	"strconv"
	"strings"
)

// Plan is the whole parsed document: the derived model for one plan file.
// Nothing here is persisted - it is rebuilt whenever the file's hash changes.
type Plan struct {
	Sections []Section          `json:"sections"`
	Items    []Item             `json:"items"`
	Budget   map[string]float64 `json:"budget"` // the §3 table: track -> hours
}

// budgetRowRe matches a two-column table cell holding only a number, with or
// without bold markers: "| Total | **292** |".
var budgetRowRe = regexp.MustCompile(`^\*{0,2}(\d+(?:\.\d+)?)\*{0,2}$`)

// ParseDocument turns a plan file into the derived model.
//
// Items are attached to the section heading above them, which is why sections
// and items are parsed in one pass rather than two - an item's role depends on
// its section, and its section is simply the most recent heading.
func ParseDocument(content string, r *Resolver) *Plan {
	p := &Plan{Budget: map[string]float64{}}
	current := Section{Title: "(preamble)", Role: SecReference, BudgetConf: ConfNone}

	for i, line := range strings.Split(content, "\n") {
		lineNo := i + 1
		line = strings.TrimSuffix(line, "\r")

		if sec, ok := ParseHeading(line, lineNo); ok {
			p.Sections = append(p.Sections, sec)
			current = sec
			continue
		}

		if row, hours, ok := parseBudgetRow(line); ok {
			p.Budget[row] = hours
			continue
		}

		if item, ok := ParseItem(line, lineNo); ok {
			p.attachItem(item, current, r)
		}
	}

	// Anchors last: an item's identity depends on its role, which depends on
	// the section it was attached to.
	AssignAnchors(p.Items)

	return p
}

// attachItem completes an item with the facts that depend on its section.
func (p *Plan) attachItem(item Item, sec Section, r *Resolver) {
	item.Section = sec.Title
	item.Backticks = FindBackticks(item.Raw)

	var project *Link
	if len(item.Backticks) > 0 {
		_, proj, notes := r.ResolveAll(item.Backticks)
		project = proj
		item.Notes = append(item.Notes, notes...)
	}

	item.Role = AssignRole(sec, item.Order, project)
	p.Items = append(p.Items, item)
}

// parseBudgetRow reads one row of the §3 budget table.
func parseBudgetRow(line string) (track string, hours float64, ok bool) {
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "|") || strings.Count(line, "|") < 3 {
		return "", 0, false
	}

	cells := strings.Split(strings.Trim(line, "|"), "|")
	if len(cells) != 2 {
		return "", 0, false
	}

	m := budgetRowRe.FindStringSubmatch(strings.TrimSpace(cells[1]))
	if m == nil {
		return "", 0, false
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return "", 0, false
	}

	return StripMarkup(Normalise(strings.TrimSpace(cells[0]))), v, true
}

// SectionsWithRole returns every section of the given role, in document order.
func (p *Plan) SectionsWithRole(role SectionRole) []Section {
	var out []Section
	for _, s := range p.Sections {
		if s.Role == role {
			out = append(out, s)
		}
	}
	return out
}

// ItemsIn returns the items belonging to a section.
func (p *Plan) ItemsIn(title string) []Item {
	var out []Item
	for _, i := range p.Items {
		if i.Section == title {
			out = append(out, i)
		}
	}
	return out
}

// ItemsWithRole returns every item of the given role.
func (p *Plan) ItemsWithRole(role Role) []Item {
	var out []Item
	for _, i := range p.Items {
		if i.Role == role {
			out = append(out, i)
		}
	}
	return out
}

// SumHours totals the hours of items that actually declared some. Items with no
// figure contribute nothing rather than zero - the two are different facts.
func SumHours(items []Item) float64 {
	var total float64
	for _, i := range items {
		if i.HasHours() {
			total += i.Hours
		}
	}
	return total
}

// BudgetRow looks up a §3 table row by case-insensitive prefix, so a label can
// gain a trailing qualifier without breaking the lookup.
func (p *Plan) BudgetRow(prefix string) (float64, bool) {
	prefix = strings.ToLower(prefix)
	for k, v := range p.Budget {
		if strings.HasPrefix(strings.ToLower(k), prefix) {
			return v, true
		}
	}
	return 0, false
}
