package plan

import "testing"

// Schema §2: only schedule items count toward the 292h budget.
func TestAssignRole(t *testing.T) {
	folder := &Link{Kind: LinkFolder, Span: "02 - Databases & Storage"}
	schedule := Section{Role: SecSchedule}
	scope := Section{Role: SecScope}
	reference := Section{Role: SecReference}

	tests := []struct {
		name    string
		sec     Section
		order   int
		project *Link
		want    Role
	}{
		{"ordered item linking a folder is curriculum", reference, 1, folder, RoleCurriculum},
		{"curriculum wins even inside a schedule block", schedule, 2, folder, RoleCurriculum},
		{"month block item is schedule", schedule, 0, nil, RoleSchedule},
		{"deliverable item is scope", scope, 0, nil, RoleScope},
		{"anything else is admin", reference, 0, nil, RoleAdmin},
		{"order without a folder is not curriculum", reference, 1, nil, RoleAdmin},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := AssignRole(tt.sec, tt.order, tt.project); got != tt.want {
				t.Errorf("role = %v, want %v", got, tt.want)
			}
		})
	}
}
