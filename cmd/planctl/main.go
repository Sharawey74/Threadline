// Command planctl parses a plan file and prints its reconciliation table.
//
// It is the Phase 1 exit criterion and a permanent debugging tool: the whole
// derived model, printed, with no UI and no database in the way. If a number on
// screen ever looks wrong, this is what says whether the parser or the plan is
// responsible.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Sharawey74/Threadline/core/plan"
	"github.com/Sharawey74/Threadline/core/scan"
)

func main() {
	root := flag.String("root", ".", "career root folder")
	file := flag.String("file", "TASKS.md", "plan file, relative to the root")
	verbose := flag.Bool("v", false, "list every item and every note")
	flag.Parse()

	if err := run(*root, *file, *verbose); err != nil {
		fmt.Fprintln(os.Stderr, "planctl:", err)
		os.Exit(1)
	}
}

func run(root, file string, verbose bool) error {
	// #nosec G304 -- the path is the operator's own argument to their own CLI.
	// There is no untrusted input here: planctl reads the file it was pointed at.
	content, err := os.ReadFile(filepath.Join(root, file))
	if err != nil {
		return err
	}

	p := plan.ParseDocument(string(content), &plan.Resolver{Root: root})
	topics, err := scan.Topics(root)
	if err != nil {
		return err
	}

	printPlan(p, topics)
	if verbose {
		printItems(p)
	}
	printAmbiguities(p)

	checks := plan.Reconcile(p, topics)
	rule("RECONCILIATION")
	for _, c := range checks {
		fmt.Println(" ", c)
		if c.Detail != "" {
			fmt.Println("        ", c.Detail)
		}
	}

	passed := 0
	for _, c := range checks {
		if c.Passed {
			passed++
		}
	}
	fmt.Printf("\n  %d of %d checks pass", passed, len(checks))
	if plan.Passed(checks) {
		fmt.Println(" - the plan is internally consistent")
		return nil
	}
	fmt.Println(" - DRIFT DETECTED")
	return fmt.Errorf("%d checks failed", len(checks)-passed)
}

func rule(title string) {
	fmt.Printf("\n%s\n%s\n", title, "==============================================================")
}

func printPlan(p *plan.Plan, topics []plan.Topic) {
	rule("PLAN")
	fmt.Printf("  sections        %d\n", len(p.Sections))
	fmt.Printf("  items           %d  (%d done)\n", len(p.Items), countChecked(p))
	fmt.Printf("  topics on disk  %d\n", len(topics))
	fmt.Printf("  budget rows     %d\n", len(p.Budget))

	rule("ITEMS BY ROLE")
	for _, role := range []plan.Role{
		plan.RoleSchedule, plan.RoleCurriculum, plan.RoleScope, plan.RoleAdmin,
	} {
		items := p.ItemsWithRole(role)
		fmt.Printf("  %-11s %3d items %8.1fh\n", role, len(items), plan.SumHours(items))
	}
	fmt.Printf("  %-11s %3d items %8.1fh  <- summing every checkbox alike\n",
		"NAIVE SUM", len(p.Items), plan.SumHours(p.Items))

	rule("SECTIONS")
	for _, s := range p.Sections {
		budget := "     -"
		if s.HasBudget() {
			budget = fmt.Sprintf("%5.1fh", s.Budget)
		}
		fmt.Printf("  §%-3d %-10s %s  %s\n", s.Number, s.Role, budget, s.Title)
	}
}

func printItems(p *plan.Plan) {
	rule("ITEMS")
	for _, i := range p.Items {
		mark := " "
		if i.Checked {
			mark = "x"
		}
		hours := "     "
		if i.HasHours() {
			hours = fmt.Sprintf("%4.1fh", i.Hours)
		}
		fmt.Printf("  L%-4d [%s] %s %-11s %s  %.60s\n",
			i.LineNo, mark, hours, i.Role, i.Anchor, i.Text)
	}
}

func printAmbiguities(p *plan.Plan) {
	rule("AMBIGUITIES THE FILE CONTAINS")
	n := 0
	for _, i := range p.Items {
		if len(i.Notes) == 0 {
			continue
		}
		n++
		fmt.Printf("  L%d: %.62s\n", i.LineNo, i.Text)
		for _, note := range i.Notes {
			fmt.Printf("      - %s\n", note)
		}
	}
	if n == 0 {
		fmt.Println("  none")
	}
	fmt.Printf("\n  %d of %d item lines need a disambiguation rule\n", n, len(p.Items))
}

func countChecked(p *plan.Plan) int {
	n := 0
	for _, i := range p.Items {
		if i.Checked {
			n++
		}
	}
	return n
}
