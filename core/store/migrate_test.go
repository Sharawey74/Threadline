package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Every V0 table from Schema §10 must exist after migration. A missing table
// would not surface until the feature that needs it, which could be weeks.
func TestMigrateCreatesEveryV0Table(t *testing.T) {
	s := memStore(t)

	want := []string{
		"app_meta", "source_file", "artifact", "artifact_position",
		"artifact_access", "session", "session_artifact",
		"item_anchor", "item_anchor_history", "item_session",
	}
	for _, table := range want {
		var name string
		err := s.DB().QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
		).Scan(&name)
		if err != nil {
			t.Errorf("table %q missing: %v", table, err)
		}
	}
}

// V1 and V2 tables must NOT exist yet. Creating them early would imply the
// features are coming sooner than they are, and an unused table is a lie in
// the schema.
func TestMigrateDoesNotCreateDeferredTables(t *testing.T) {
	s := memStore(t)

	for _, table := range []string{"search", "outline_entry", "duplicate_group", "tag", "entity_link"} {
		var name string
		err := s.DB().QueryRow(
			`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
		).Scan(&name)
		if err == nil {
			t.Errorf("deferred table %q was created", table)
		}
	}
}

// The expected version is derived from the migrations on disk, not written
// out as a literal. Hardcoding it means every future migration fails this test
// for the one reason that is not a defect.
func latestMigrationVersion(t *testing.T) int {
	t.Helper()

	all, err := pendingMigrations(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) == 0 {
		t.Fatal("no migrations are embedded")
	}
	return all[len(all)-1].version
}

func TestMigrateRecordsSchemaVersion(t *testing.T) {
	s := memStore(t)

	v, err := s.SchemaVersion()
	if err != nil {
		t.Fatal(err)
	}
	if want := latestMigrationVersion(t); v != want {
		t.Errorf("schema version = %d, want %d", v, want)
	}
}

// Migrating an already-current database must do nothing at all, not fail and
// not re-run. Every app start calls this.
func TestMigrateIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "threadline.db")

	first, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}

	second, err := Open(path)
	if err != nil {
		t.Fatalf("second open failed - migration is not idempotent: %v", err)
	}
	defer func() { _ = second.Close() }()

	v, _ := second.SchemaVersion()
	if want := latestMigrationVersion(t); v != want {
		t.Errorf("schema version after reopen = %d, want %d", v, want)
	}
}

// This database holds months of recorded hours. A migration that runs without
// a copy first is a migration that can destroy them.
func TestMigrateBacksUpBeforeChangingAnExistingDatabase(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "threadline.db")

	// A database that already exists at version 0: created, but not migrated.
	pre, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pre.DB().Exec(`DELETE FROM app_meta WHERE key = ?`, schemaVersion); err != nil {
		t.Fatal(err)
	}
	if err := pre.Close(); err != nil {
		t.Fatal(err)
	}

	reopened, err := Open(path)
	if err == nil {
		_ = reopened.Close()
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var backups []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".bak") {
			backups = append(backups, e.Name())
		}
	}
	if len(backups) == 0 {
		t.Fatal("no backup was taken before migrating an existing database")
	}
	if !strings.Contains(backups[0], "threadline.db.v000-") {
		t.Errorf("backup %q does not record the version it migrated from", backups[0])
	}
}

// A brand-new database has nothing to copy, and a spurious .bak on first run
// would be noise.
func TestNoBackupForANewDatabase(t *testing.T) {
	dir := t.TempDir()

	s, err := Open(filepath.Join(dir, "threadline.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()

	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".bak") {
			t.Errorf("a new database produced a backup: %s", e.Name())
		}
	}
}

// Two migrations sharing a number would apply in filesystem order, which is
// not an order. The runner must refuse rather than pick one.
func TestMigrationFilenamesAreWellFormedAndUnique(t *testing.T) {
	if _, err := pendingMigrations(0); err != nil {
		t.Fatalf("migration set is invalid: %v", err)
	}
}

// Foreign keys are off by default in SQLite. With them off, deleting a session
// would silently orphan its rows instead of cascading.
func TestForeignKeysAreEnforced(t *testing.T) {
	s := memStore(t)

	_, err := s.DB().Exec(
		`INSERT INTO item_session(anchor, session_id, seconds) VALUES('nope', 999, 0)`)
	if err == nil {
		t.Fatal("inserted a row referencing a session that does not exist")
	}
}

func memStore(t *testing.T) *Store {
	t.Helper()
	s, err := OpenMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}
