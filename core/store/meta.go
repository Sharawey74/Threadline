package store

// Keys stored in app_meta.
//
// Constants rather than literals: a typo in a string key is a setting that
// silently never persists, and nothing reports it.
const (
	// KeyCareerRoot is the folder the user pointed the app at. F1 requires it
	// to survive a restart.
	KeyCareerRoot = "career_root"
)
