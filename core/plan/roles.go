package plan

// AssignRole gives an item its role from the section it sits in (Schema §2).
//
// Curriculum is decided at the item level rather than the section level: an
// ordered item that links a topic folder is curriculum wherever it appears, and
// that is what separates the 81h of study estimates from the 292h that pays
// for them.
func AssignRole(sec Section, order int, project *Link) Role {
	if order > 0 && project != nil && project.Kind == LinkFolder {
		return RoleCurriculum
	}
	switch sec.Role {
	case SecSchedule:
		return RoleSchedule
	case SecScope:
		return RoleScope
	case SecCurriculum:
		return RoleCurriculum
	default:
		return RoleAdmin
	}
}
