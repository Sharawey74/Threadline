package store

import (
	"database/sql"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Every table the stored model still needs must exist after migration. A
// missing table would not surface until the feature that needs it, which could
// be weeks.
func TestMigrateCreatesEveryV0Table(t *testing.T) {
	s := memStore(t)

	want := []string{
		"app_meta", "source_file", "artifact", "item_anchor", "item_anchor_history",
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

// Foreign keys are off by default in SQLite. With them off, an item's history
// could point at an anchor that was never recorded.
func TestForeignKeysAreEnforced(t *testing.T) {
	s := memStore(t)

	_, err := s.DB().Exec(
		`INSERT INTO item_anchor_history(anchor, event, at) VALUES('nope', 'created', 0)`)
	if err == nil {
		t.Fatal("inserted history for an anchor that does not exist")
	}
}

// The tables and indexes migration 003 removes. Sessions, hours and page
// positions were deleted from the product on 9 Sep 2026 (C11).
var observationTables = []string{
	"session", "artifact_access", "session_artifact", "item_session", "artifact_position",
}

var observationIndexes = []string{
	"idx_session_scope", "idx_session_start", "idx_access_artifact",
}

// A real database upgrading to 003 has rows in these tables, joined by foreign
// keys that are switched on. Dropping empty tables would pass while the upgrade
// that actually runs on the user's machine failed.
func TestMigration003DropsTheObservationTables(t *testing.T) {
	db := databaseAtVersion2(t)
	populateObservationTables(t, db)

	if err := Migrate(db, ""); err != nil {
		t.Fatalf("migrating a populated version-2 database: %v", err)
	}

	for _, name := range append(observationTables, observationIndexes...) {
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE name = ?`, name).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Errorf("%s survived migration 003", name)
		}
	}
}

// Dropping the observation tables must cost the user nothing else: the files
// Threadline has seen and each plan item's history carry across unchanged.
func TestMigration003KeepsArtifactsAndAnchors(t *testing.T) {
	db := databaseAtVersion2(t)
	populateObservationTables(t, db)

	kept := []string{"artifact", "item_anchor", "item_anchor_history"}
	before := map[string][][]any{}
	for _, table := range kept {
		before[table] = allRows(t, db, table)
		if len(before[table]) == 0 {
			t.Fatalf("fixture put no rows in %s, so the test would prove nothing", table)
		}
	}

	if err := Migrate(db, ""); err != nil {
		t.Fatal(err)
	}

	for _, table := range kept {
		if after := allRows(t, db, table); !reflect.DeepEqual(before[table], after) {
			t.Errorf("%s changed across migration 003:\nbefore %v\nafter  %v", table, before[table], after)
		}
	}
}

// databaseAtVersion2 is the schema every existing install has before 003.
func databaseAtVersion2(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:?_pragma=foreign_keys(ON)")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })

	if err := ensureMetaTable(db); err != nil {
		t.Fatal(err)
	}
	all, err := pendingMigrations(0)
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range all {
		if m.version > 2 {
			break
		}
		if err := apply(db, m); err != nil {
			t.Fatalf("migration %03d: %v", m.version, err)
		}
	}
	return db
}

// populateObservationTables gives every table 003 touches at least one row,
// linked the way real use links them.
func populateObservationTables(t *testing.T, db *sql.DB) {
	t.Helper()

	for _, stmt := range []string{
		`INSERT INTO artifact(id, kind, path, real_path, title, ext, first_seen, last_seen)
		 VALUES(1, 'file', '06 - system design/redis.pdf', '06 - System Design/Redis.pdf', 'Redis', '.pdf', 100, 200)`,
		`INSERT INTO item_anchor(anchor, role, section, text, first_seen, last_seen)
		 VALUES('a1', 'curriculum', 'Study guide', 'Redis notes', 100, 200)`,
		`INSERT INTO item_anchor_history(anchor, event, detail, at) VALUES('a1', 'created', '', 100)`,
		`INSERT INTO session(id, scope_kind, scope_ref, started_at, ended_at, active_secs, note)
		 VALUES(1, 'plan_item', 'a1', 100, 160, 60, 'stopped at eviction')`,
		`INSERT INTO artifact_access(artifact_id, session_id, opened_at, seconds) VALUES(1, 1, 100, 60)`,
		`INSERT INTO session_artifact(session_id, artifact_id, seconds) VALUES(1, 1, 60)`,
		`INSERT INTO item_session(anchor, session_id, seconds) VALUES('a1', 1, 60)`,
		`INSERT INTO artifact_position(artifact_id, page, updated_at) VALUES(1, 41, 160)`,
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("fixture: %v\n%s", err, stmt)
		}
	}
}

// allRows reads a whole table in a stable order, for before/after comparison.
func allRows(t *testing.T, db *sql.DB, table string) [][]any {
	t.Helper()

	rows, err := db.Query(`SELECT * FROM ` + table + ` ORDER BY rowid`) // #nosec G202 -- table names are fixed in the test
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rows.Close() }()

	cols, err := rows.Columns()
	if err != nil {
		t.Fatal(err)
	}
	var out [][]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		out = append(out, vals)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
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
