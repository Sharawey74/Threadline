package plan

import (
	"fmt"
	"strings"
)

// AnchorState is what the store remembers about an item between scans.
type AnchorState struct {
	Anchor  string
	Role    Role
	Section string
	Text    string
}

// MatchKind is how a stored anchor was reconciled against the current file.
type MatchKind string

const (
	MatchExact    MatchKind = "exact"    // same anchor: same item
	MatchReworded MatchKind = "reworded" // edited in place; history migrates
	MatchMoved    MatchKind = "moved"    // found outside its old section
	MatchNew      MatchKind = "new"      // no stored anchor corresponds
	MatchOrphaned MatchKind = "orphaned" // gone from the file; history is KEPT
)

// AnchorMatch pairs one stored anchor with the item it now corresponds to.
type AnchorMatch struct {
	Kind       MatchKind
	Previous   *AnchorState
	Current    *Item
	Similarity float64
	Detail     string
}

// similarityThreshold is the token overlap above which a changed line is
// treated as an edit rather than a different item. From Schema §5.
const similarityThreshold = 0.85

// ReAnchor reconciles stored anchors against a freshly parsed file.
//
// The store never destroys history because a file changed. An anchor with no
// corresponding line is marked orphaned and kept: the hours were really spent,
// and the user may simply have reworded something.
func ReAnchor(previous []AnchorState, current []Item) []AnchorMatch {
	var out []AnchorMatch

	byAnchor := map[string]int{}
	for i := range current {
		byAnchor[current[i].Anchor] = i
	}

	usedItem := make([]bool, len(current))
	var unmatchedPrev []int

	// 1. Exact anchor match.
	for pi := range previous {
		if ci, ok := byAnchor[previous[pi].Anchor]; ok && !usedItem[ci] {
			usedItem[ci] = true
			out = append(out, AnchorMatch{
				Kind: MatchExact, Previous: &previous[pi], Current: &current[ci], Similarity: 1,
			})
			continue
		}
		unmatchedPrev = append(unmatchedPrev, pi)
	}

	// 2. Fuzzy match within the same section.
	unmatchedPrev = fuzzyPass(previous, current, usedItem, unmatchedPrev, &out, true)

	// 3. Widened fallback. Renaming a heading changes every anchor beneath it
	//    AND removes the recovery path, because step 2 only looks inside the
	//    section. When a whole section's anchors miss together, the section
	//    itself is what changed - so those anchors are matched document-wide.
	//
	//    Only the widenable ones take this path. The rest are carried straight
	//    through to step 4: a single deleted item is a deletion, not a rename,
	//    and must not go hunting the document for a replacement.
	wide := widenable(previous, current, unmatchedPrev)
	isWide := make(map[int]bool, len(wide))
	for _, pi := range wide {
		isWide[pi] = true
	}
	carried := make([]int, 0, len(unmatchedPrev))
	for _, pi := range unmatchedPrev {
		if !isWide[pi] {
			carried = append(carried, pi)
		}
	}
	unmatchedPrev = append(carried, fuzzyPass(previous, current, usedItem, wide, &out, false)...)

	// 4. Anything still unmatched on either side.
	for _, pi := range unmatchedPrev {
		out = append(out, AnchorMatch{
			Kind: MatchOrphaned, Previous: &previous[pi],
			Detail: "no longer in the file - history retained",
		})
	}
	for ci := range current {
		if !usedItem[ci] {
			out = append(out, AnchorMatch{Kind: MatchNew, Current: &current[ci]})
		}
	}

	return out
}

// widenable returns the unmatched anchors whose entire section disappeared.
//
// A single missing item is a deletion. An ENTIRE section missing at once is a
// rename, and the difference decides whether searching the whole document is
// justified or reckless.
func widenable(previous []AnchorState, current []Item, unmatched []int) []int {
	liveSections := map[string]bool{}
	for _, i := range current {
		liveSections[i.Section] = true
	}

	stored := map[string]int{}
	for _, p := range previous {
		stored[p.Section]++
	}
	missing := map[string]int{}
	for _, pi := range unmatched {
		missing[previous[pi].Section]++
	}

	var out []int
	for _, pi := range unmatched {
		sec := previous[pi].Section
		if !liveSections[sec] && missing[sec] == stored[sec] {
			out = append(out, pi)
		}
	}
	return out
}

// fuzzyPass matches unmatched anchors by token similarity, optionally confined
// to the anchor's own section. Returns the anchors still unmatched.
func fuzzyPass(previous []AnchorState, current []Item, used []bool, candidates []int,
	out *[]AnchorMatch, sameSection bool) []int {
	var still []int

	for _, pi := range candidates {
		best, score := -1, similarityThreshold
		for ci := range current {
			if used[ci] || (sameSection && current[ci].Section != previous[pi].Section) {
				continue
			}
			if s := similarity(previous[pi].Text, current[ci].Text); s > score {
				best, score = ci, s
			}
		}

		if best < 0 {
			still = append(still, pi)
			continue
		}

		used[best] = true
		kind, detail := MatchReworded, "text edited - history migrated"
		if !sameSection {
			kind = MatchMoved
			detail = fmt.Sprintf("section %q disappeared; matched in %q - history migrated",
				previous[pi].Section, current[best].Section)
		}
		*out = append(*out, AnchorMatch{
			Kind: kind, Previous: &previous[pi], Current: &current[best],
			Similarity: score, Detail: detail,
		})
	}

	return still
}

// similarity is the Dice coefficient over token sets: 2|A∩B| / (|A|+|B|).
// Token-based rather than character-based so that reordering a phrase does not
// look like a different task.
func similarity(a, b string) float64 {
	ta, tb := tokens(a), tokens(b)
	if len(ta) == 0 || len(tb) == 0 {
		return 0
	}
	var shared int
	for tok := range ta {
		if tb[tok] {
			shared++
		}
	}
	return 2 * float64(shared) / float64(len(ta)+len(tb))
}

func tokens(s string) map[string]bool {
	out := map[string]bool{}
	for _, f := range strings.Fields(anchorText(s)) {
		out[f] = true
	}
	return out
}
