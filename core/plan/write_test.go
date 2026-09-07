package plan

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The six write-safety tests from Schema §6, plus the failure paths.
//
// This file is the reason write-back is allowed to exist at all. C4: the
// round-trip test passes, or write-back ships disabled.

// writable copies the fixture into a temp dir, so tests write to a copy and
// never to the fixture itself.
func writable(t *testing.T) (path string, r *Resolver) {
	t.Helper()

	src, err := os.ReadFile(filepath.Join("testdata", "plan.md"))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path = filepath.Join(dir, "TASKS.md")
	if err := os.WriteFile(path, src, 0o600); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{
		"Study guided & notes/02 - Databases & Storage",
		"Study guided & notes/06 - System Design",
		"Study guided & notes/09 - AI",
	} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	return path, &Resolver{Root: dir}
}

func read(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func hash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])[:16]
}

func optsFor(i Item, path string, checked bool) TickOptions {
	return TickOptions{
		Path: path, Anchor: i.Anchor, Checked: checked,
		Role: i.Role, Section: i.Section,
	}
}

func firstUnchecked(t *testing.T, p *Plan) Item {
	t.Helper()
	for _, i := range p.Items {
		if !i.Checked {
			return i
		}
	}
	t.Fatal("fixture has no unchecked item")
	return Item{}
}

// TEST 1 - the blocking CI gate.
//
// Rewrite every checkbox to the value it already holds. The file must be
// byte-identical afterwards. If this fails, write-back ships disabled.
func TestRoundTrip(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)

	p := ParseDocument(string(before), r)
	if len(p.Items) == 0 {
		t.Fatal("fixture parsed to zero items - the test would prove nothing")
	}

	for _, item := range p.Items {
		if _, err := Tick(optsFor(item, path, item.Checked)); err != nil {
			t.Fatalf("rewriting %q to its current value failed: %v", item.Text, err)
		}
	}

	after := read(t, path)
	if !bytes.Equal(before, after) {
		t.Fatalf("round trip changed the file: sha %s -> %s", hash(before), hash(after))
	}
	t.Logf("round trip over %d boxes: sha %s unchanged", len(p.Items), hash(before))
}

// TEST 2 - ticking one box changes exactly one byte, and no length.
func TestTickChangesExactlyOneByte(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	n, err := Tick(optsFor(target, path, true))
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("reported %d bytes changed, want 1", n)
	}

	after := read(t, path)
	if len(after) != len(before) {
		t.Fatalf("file length changed: %d -> %d", len(before), len(after))
	}

	var diff []int
	for i := range before {
		if before[i] != after[i] {
			diff = append(diff, i)
		}
	}
	if len(diff) != 1 {
		t.Fatalf("%d bytes changed, want 1 (offsets %v)", len(diff), diff)
	}
	if after[diff[0]] != 'x' {
		t.Errorf("changed byte is %q, want x", after[diff[0]])
	}
}

// TEST 3 - tick then untick returns the original bytes.
func TestTickThenUntickIsIdentity(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	if _, err := Tick(optsFor(target, path, true)); err != nil {
		t.Fatal(err)
	}
	if _, err := Tick(optsFor(target, path, false)); err != nil {
		t.Fatal(err)
	}

	if after := read(t, path); !bytes.Equal(before, after) {
		t.Errorf("tick/untick did not restore the file: %s -> %s", hash(before), hash(after))
	}
}

// TEST 4 - content preservation. These glyphs are exactly what a
// re-serialising writer destroys without ever reporting an error.
func TestTickPreservesEveryOtherByte(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	if _, err := Tick(optsFor(target, path, true)); err != nil {
		t.Fatal(err)
	}
	after := read(t, path)

	for _, tc := range []struct {
		name string
		s    string
	}{
		{"em dash", "—"},
		{"en dash", "–"},
		{"arrow", "→"},
		{"middot", "·"},
		{"ampersand", "&"},
	} {
		b := strings.Count(string(before), tc.s)
		a := strings.Count(string(after), tc.s)
		if b != a {
			t.Errorf("%s count changed: %d -> %d", tc.name, b, a)
		}
	}
	if b, a := bytes.Count(before, []byte{'\n'}), bytes.Count(after, []byte{'\n'}); b != a {
		t.Errorf("LF count changed: %d -> %d", b, a)
	}
	if n := bytes.Count(after, []byte{'\r'}); n != 0 {
		t.Errorf("%d CR bytes introduced", n)
	}
}

// TEST 5 - re-parsing the modified file leaves every derived field stable, and
// flips exactly one box.
func TestDerivedFieldsSurviveATick(t *testing.T) {
	path, r := writable(t)
	before := ParseDocument(string(read(t, path)), r)
	target := firstUnchecked(t, before)

	if _, err := Tick(optsFor(target, path, true)); err != nil {
		t.Fatal(err)
	}
	after := ParseDocument(string(read(t, path)), r)

	if len(before.Items) != len(after.Items) {
		t.Fatalf("item count changed: %d -> %d", len(before.Items), len(after.Items))
	}

	flipped := 0
	for i := range before.Items {
		b, a := before.Items[i], after.Items[i]
		if b.Checked != a.Checked {
			flipped++
		}
		if b.Text != a.Text || b.Hours != a.Hours || b.Pages != a.Pages ||
			b.Section != a.Section || b.Role != a.Role || b.Order != a.Order {
			t.Errorf("derived fields changed for %q", b.Text)
		}
	}
	if flipped != 1 {
		t.Errorf("%d boxes flipped, want 1", flipped)
	}
}

// TEST 6 - anchors survive the write. If they did not, ticking a box would
// detach the hours recorded against it.
func TestAnchorsSurviveATick(t *testing.T) {
	path, r := writable(t)
	before := ParseDocument(string(read(t, path)), r)
	target := firstUnchecked(t, before)

	if _, err := Tick(optsFor(target, path, true)); err != nil {
		t.Fatal(err)
	}
	after := ParseDocument(string(read(t, path)), r)

	for i := range before.Items {
		if before.Items[i].Anchor != after.Items[i].Anchor {
			t.Errorf("anchor changed for %q", before.Items[i].Text)
		}
	}
}

// Verify before writing. A stale anchor must abort rather than write to
// whatever line happens to sit at that position now.
func TestTickRefusesWhenTheAnchorDoesNotMatch(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	target.Anchor = "0000000000000000"
	if _, err := Tick(optsFor(target, path, true)); !errors.Is(err, ErrAnchorMismatch) {
		t.Fatalf("err = %v, want ErrAnchorMismatch", err)
	}
	if after := read(t, path); !bytes.Equal(before, after) {
		t.Error("the file was modified despite the anchor not matching")
	}
}

// The staleness check compares the WHOLE file, not just the target line. An
// edit elsewhere must abort the write, or the rename discards it.
func TestWriteRefusesWhenTheFileChangedElsewhere(t *testing.T) {
	path, _ := writable(t)
	original := read(t, path)

	edited := append([]byte("<!-- edited in another editor -->\n"), original...)
	if err := os.WriteFile(path, edited, 0o600); err != nil {
		t.Fatal(err)
	}

	// The in-memory expectation is now stale, even though the target line
	// still exists and its anchor would still match.
	err := writeAtomic(path, original, original)
	if !errors.Is(err, ErrStale) {
		t.Fatalf("err = %v, want ErrStale", err)
	}
	if after := read(t, path); !bytes.Equal(edited, after) {
		t.Error("a concurrent edit was overwritten")
	}
}

// Ticking a box that already holds the requested value must touch nothing.
func TestTickIsANoOpWhenAlreadyInTheRequestedState(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	n, err := Tick(optsFor(target, path, false))
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("reported %d bytes changed for a no-op, want 0", n)
	}
	if after := read(t, path); !bytes.Equal(before, after) {
		t.Error("a no-op tick rewrote the file")
	}
}

// No temp file may survive a write.
func TestTickLeavesNoTempFiles(t *testing.T) {
	path, r := writable(t)
	target := firstUnchecked(t, ParseDocument(string(read(t, path)), r))

	if _, err := Tick(optsFor(target, path, true)); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("temp file left behind: %s", e.Name())
		}
	}
}
