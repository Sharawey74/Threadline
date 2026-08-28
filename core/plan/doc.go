// Package plan parses the plan file into the derived model: sections, plan
// items, roles, hour budgets and the reconciliation check set.
//
// It is plain Go. It imports no Wails packages, touches no window, and is
// driven by bytes in and structs out - which is what makes the parse rules
// testable without an application around them (constraint C1).
//
// The rules it implements are frozen in Threadline-Schema.md §4 and are
// written against that spec, not against this implementation.
package plan
