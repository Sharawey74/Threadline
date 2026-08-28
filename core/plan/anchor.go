package plan

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

// Line numbers are not identity. Edit line 20 and every item below it moves,
// orphaning its stored sessions and hours. An anchor is identity derived from
// the text itself, so stored history survives the file being edited.
//
//	anchor = sha256(role ‖ section ‖ normalised text)[:16]
//
// Hours are stripped before hashing: re-estimating a task from 15h to 20h is
// not a different task, and re-anchoring on every re-estimate would detach the
// hours already recorded against it.
func Anchor(role Role, section, text string) string {
	sum := sha256.Sum256([]byte(string(role) + "\x00" + section + "\x00" + anchorText(text)))
	return hex.EncodeToString(sum[:])[:16]
}

// anchorText reduces an item's text to the part that identifies it.
func anchorText(text string) string {
	s := StripMarkup(Normalise(text))
	s = hourRe.ReplaceAllString(s, "")
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// AssignAnchors gives every item its anchor, disambiguating collisions.
//
// Two identically worded items in one section would otherwise hash the same and
// share one history. The spec's own evidence run found no collisions, but that
// is a fact about today's file, not a property of the scheme - so duplicates
// get an occurrence ordinal appended before hashing.
func AssignAnchors(items []Item) {
	seen := map[string]int{}
	for i := range items {
		base := Anchor(items[i].Role, items[i].Section, items[i].Text)
		seen[base]++
		if n := seen[base]; n > 1 {
			items[i].Anchor = Anchor(items[i].Role, items[i].Section,
				fmt.Sprintf("%s #%d", items[i].Text, n))
			items[i].Notes = append(items[i].Notes,
				fmt.Sprintf("duplicate text in this section - disambiguated as occurrence %d", n))
			continue
		}
		items[i].Anchor = base
	}
}
