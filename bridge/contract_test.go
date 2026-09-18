package bridge

import (
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"
)

// The contract test that matters: both sides, compared against each other.
//
// Every other test in this project checks one side against its own idea of the
// contract. The Go tests exercise the service; the frontend tests exercise the
// mock. Both can pass while the two disagree — a command renamed in Go and not
// in TypeScript is a runtime failure that neither suite would notice, because
// Wails resolves method names as strings at call time.
//
// This reads the frontend's CONTRACT and compares it to the methods actually
// bound on App.

// lifecycle methods are Wails hooks, not IPC commands. They must not count
// against C2 and are not part of the frontend contract.
var lifecycle = map[string]bool{
	"Startup":     true,
	"Shutdown":    true,
	"DomReady":    true,
	"BeforeClose": true,
}

// contractLimit is C2: over 20 commands means the boundary is leaking.
const contractLimit = 20

func TestContractMatchesTheFrontend(t *testing.T) {
	declared := frontendContract(t)
	bound := boundCommands()

	missing := difference(declared, bound)
	if len(missing) > 0 {
		t.Errorf("the frontend calls commands the bridge does not bind: %v", missing)
	}

	extra := difference(bound, declared)
	if len(extra) > 0 {
		// Not automatically a bug, but it is dead weight: a bound method no
		// caller knows about still counts against C2 and still widens the
		// surface the bridge has to keep working.
		t.Errorf("the bridge binds commands the frontend never calls: %v", extra)
	}
}

// contract is every bound command, by name. The 9 Sep 2026 reduction left
// ten; Phase 8 added the six outline commands (16 Sep 2026). Growing it is
// allowed; doing so silently is not, so a change here has to be a deliberate
// edit to this list. AppendNote is shared with Phase 10's capture, which keeps
// Phases 9-11 under the C2 ceiling.
var contract = []string{
	"ChooseCareerRoot", "GetMaterial", "GetPlan", "GetReconciliation", "GetTopics",
	"GetWorkspace", "ReadArtifact", "SetCareerRoot", "TickItem", "WriteArtifact",
	"AppendNote", "GetOutline", "OpenExternal", "ParseOutline", "SaveOutline", "TickSection",
}

func TestContractIsSixteenCommands(t *testing.T) {
	want := slices.Sorted(slices.Values(contract))
	if bound := boundCommands(); !slices.Equal(bound, want) {
		t.Errorf("bound %d commands %v, want these %d: %v", len(bound), bound, len(want), want)
	}
	if len(want) != 16 {
		t.Errorf("the pinned contract lists %d commands, want 16", len(want))
	}
}

// Deleted rather than left unwired. Each one existed to measure the user, which
// C11 forbids; a stub still bound would be an invitation to fill it back in.
var observationCommands = []string{
	"StartSession", "EndSession", "GetBudgetStatus", "SavePosition", "GetPosition",
}

func TestObservationCommandsAreGone(t *testing.T) {
	bound := boundCommands()
	src := frontendContractSource(t)

	for _, name := range observationCommands {
		if slices.Contains(bound, name) {
			t.Errorf("%s is still bound on App", name)
		}
		// Anywhere in index.ts, in any spelling. CONTRACT and interface IPC are
		// separate lists, and TypeScript can declare a member half a dozen ways
		// (optional, readonly, quoted, generic, a function-typed property, two
		// on a line). Parsing those forms is a race against syntax; the
		// criterion is that the name is not declared in the file at all.
		if regexp.MustCompile(`(?i)\b` + name + `\b`).MatchString(src) {
			t.Errorf("%s is still declared in frontend/src/ipc/index.ts", name)
		}
	}
}

func TestContractStaysUnderTheC2Ceiling(t *testing.T) {
	bound := boundCommands()

	if len(bound) >= contractLimit {
		t.Fatalf("%d commands bound, ceiling is %d — the boundary is leaking", len(bound), contractLimit)
	}
	t.Logf("%d of %d commands used", len(bound), contractLimit)
}

// Queries must not change state and commands must return only an error, which
// is command-query separation made checkable. The names encode the split, so
// the shape of the return values can be held to it.
func TestCommandsReturnOnlyAnError(t *testing.T) {
	appType := reflect.TypeOf(&App{})

	for i := range appType.NumMethod() {
		m := appType.Method(i)
		if lifecycle[m.Name] || !isCommandName(m.Name) {
			continue
		}

		out := m.Type.NumOut()
		last := m.Type.Out(out - 1)
		if last.Name() != "error" {
			t.Errorf("%s returns %s last, want error", m.Name, last)
		}

		// ChooseCareerRoot returns the chosen path so the caller knows whether
		// the dialog was cancelled. Everything else returning a value is a
		// command that has quietly become a query.
		if out > 1 && m.Name != "ChooseCareerRoot" {
			t.Errorf("%s returns %d values; a command should return only an error", m.Name, out)
		}
	}
}

func TestQueriesReturnDataAndAnError(t *testing.T) {
	appType := reflect.TypeOf(&App{})

	for i := range appType.NumMethod() {
		m := appType.Method(i)
		if lifecycle[m.Name] || isCommandName(m.Name) {
			continue
		}
		if m.Type.NumOut() != 2 {
			t.Errorf("%s returns %d values, want data and an error", m.Name, m.Type.NumOut())
		}
	}
}

// isCommandName reports whether a method is a command rather than a query.
//
// Queries are the Get* family plus ReadArtifact and ParseOutline, which reads
// only the text it is given. Everything else changes something.
func isCommandName(name string) bool {
	return !strings.HasPrefix(name, "Get") && name != "ReadArtifact" && name != "ParseOutline"
}

// boundCommands lists every exported method Wails will bind, excluding the
// lifecycle hooks.
func boundCommands() []string {
	appType := reflect.TypeOf(&App{})

	var out []string
	for i := range appType.NumMethod() {
		name := appType.Method(i).Name
		if lifecycle[name] {
			continue
		}
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

// Either quote style, so a reformat to double quotes cannot hide an entry.
var contractEntryRe = regexp.MustCompile(`['"]([a-zA-Z]+)['"]`)

// frontendContract reads the command names the frontend declares.
//
// Parsing the source rather than importing a generated list is deliberate: the
// point is to catch the two files drifting apart, and anything generated from
// one of them could not.
func frontendContract(t *testing.T) []string {
	t.Helper()

	path := filepath.Join("..", "frontend", "src", "ipc", "index.ts")
	src, err := os.ReadFile(path) // #nosec G304 -- a fixed path inside the repo
	if err != nil {
		t.Fatalf("read the frontend contract: %v", err)
	}

	var out []string
	for _, section := range []string{"queries", "commands"} {
		block := extractBlock(t, string(src), section)
		for _, m := range contractEntryRe.FindAllStringSubmatch(block, -1) {
			// The frontend uses camelCase; Wails binds the exported Go name.
			out = append(out, strings.ToUpper(m[1][:1])+m[1][1:])
		}
	}

	if len(out) == 0 {
		t.Fatal("parsed no commands from the frontend contract — the format changed")
	}
	sort.Strings(out)
	return out
}

// frontendContractSource returns frontend/src/ipc/index.ts as text.
func frontendContractSource(t *testing.T) string {
	t.Helper()

	path := filepath.Join("..", "frontend", "src", "ipc", "index.ts")
	src, err := os.ReadFile(path) // #nosec G304 -- a fixed path inside the repo
	if err != nil {
		t.Fatalf("read the frontend contract: %v", err)
	}
	// Guards the scan itself: a moved or emptied file would make "no deleted
	// name found" true for the wrong reason.
	if !strings.Contains(string(src), "export interface IPC {") {
		t.Fatal("frontend/src/ipc/index.ts no longer declares interface IPC - the scan would prove nothing")
	}
	return string(src)
}

func extractBlock(t *testing.T, src, name string) string {
	t.Helper()

	start := strings.Index(src, name+": [")
	if start < 0 {
		t.Fatalf("no %q array in the frontend contract", name)
	}
	end := strings.Index(src[start:], "]")
	if end < 0 {
		t.Fatalf("unterminated %q array in the frontend contract", name)
	}
	return src[start : start+end]
}

func difference(a, b []string) []string {
	in := make(map[string]bool, len(b))
	for _, s := range b {
		in[s] = true
	}

	var out []string
	for _, s := range a {
		if !in[s] {
			out = append(out, s)
		}
	}
	return out
}
