// Package store is the stored half of the model: the small SQLite database
// holding only what a file cannot. It is plain Go and imports no Wails (C1).
package store

import (
	"database/sql"
	"embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"time"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// migrationRe requires a numbered, ordered filename: 001_initial.sql.
var migrationRe = regexp.MustCompile(`^(\d{3})_([a-z0-9_]+)\.sql$`)

type migration struct {
	version int
	name    string
	sql     string
}

// schemaVersion is the app_meta key recording how far migrations have run.
const schemaVersion = "schema_version"

// Migrate brings the database up to the latest schema version.
//
// Migrations are forward-only and numbered. There is no down-migration: this
// database holds five months of the user's recorded hours, and a rollback path
// that is never exercised is a rollback path that does not work. Recovery is
// the pre-migration copy, not a reverse script.
func Migrate(db *sql.DB, dbPath string) error {
	if err := ensureMetaTable(db); err != nil {
		return err
	}

	current, err := currentVersion(db)
	if err != nil {
		return err
	}

	pending, err := pendingMigrations(current)
	if err != nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}

	// Copy the database before touching it. Cheap for a file this size, and it
	// means a bad migration can never cost the user their history.
	//
	// Only when there is history to lose. Opening the connection creates the
	// file and bootstraps app_meta, so "the file exists" is true even on a
	// first run - the real question is whether any prior schema is present.
	prior, err := hasPriorSchema(db)
	if err != nil {
		return err
	}
	if prior {
		if err := backup(dbPath, current); err != nil {
			return fmt.Errorf("pre-migration backup: %w", err)
		}
	}

	for _, m := range pending {
		if err := apply(db, m); err != nil {
			return fmt.Errorf("migration %03d_%s: %w", m.version, m.name, err)
		}
	}
	return nil
}

func ensureMetaTable(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS app_meta (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`)
	return err
}

// hasPriorSchema reports whether the database holds anything beyond the
// bootstrap table. app_meta alone means a database that has never been
// migrated, and there is nothing in it worth copying.
func hasPriorSchema(db *sql.DB) (bool, error) {
	var n int
	err := db.QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name != 'app_meta'
		 AND name NOT LIKE 'sqlite_%'`).Scan(&n)
	return n > 0, err
}

func currentVersion(db *sql.DB) (int, error) {
	var raw string
	err := db.QueryRow(`SELECT value FROM app_meta WHERE key = ?`, schemaVersion).Scan(&raw)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(raw)
}

// pendingMigrations returns everything above the current version, in order.
func pendingMigrations(current int) ([]migration, error) {
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return nil, err
	}

	var out []migration
	seen := map[int]string{}
	for _, e := range entries {
		m := migrationRe.FindStringSubmatch(e.Name())
		if m == nil {
			return nil, fmt.Errorf("migration %q does not match NNN_name.sql", e.Name())
		}
		v, err := strconv.Atoi(m[1])
		if err != nil {
			return nil, err
		}
		// Two migrations sharing a number would apply in an order that depends
		// on the filesystem, which is not an order at all.
		if prev, dup := seen[v]; dup {
			return nil, fmt.Errorf("duplicate migration version %03d: %s and %s", v, prev, e.Name())
		}
		seen[v] = e.Name()

		if v <= current {
			continue
		}
		body, err := migrationFS.ReadFile("migrations/" + e.Name())
		if err != nil {
			return nil, err
		}
		out = append(out, migration{version: v, name: m[2], sql: string(body)})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}

// apply runs one migration and records its version in the same transaction.
// If the DDL succeeds but the version record does not, the migration would run
// again on the next start against tables that already exist.
func apply(db *sql.DB, m migration) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(m.sql); err != nil {
		return err
	}
	if _, err := tx.Exec(
		`INSERT INTO app_meta(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		schemaVersion, strconv.Itoa(m.version),
	); err != nil {
		return err
	}
	return tx.Commit()
}

// backup copies the database next to itself, stamped with the version it is
// leaving and the time. A new database has nothing to copy.
func backup(dbPath string, fromVersion int) error {
	if dbPath == "" {
		return nil // in-memory database, used by tests
	}
	// #nosec G304 -- dbPath is the application's own database location, not
	// user input. There is no untrusted path here.
	src, err := os.Open(dbPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer func() { _ = src.Close() }()

	name := fmt.Sprintf("%s.v%03d-%s.bak", filepath.Base(dbPath), fromVersion,
		time.Now().Format("20060102-150405"))
	// #nosec G304 -- written beside the database, into a directory the app
	// already owns, with a name this function composes itself.
	dst, err := os.Create(filepath.Join(filepath.Dir(dbPath), name))
	if err != nil {
		return err
	}
	defer func() { _ = dst.Close() }()

	if _, err := io.Copy(dst, src); err != nil {
		return err
	}
	return dst.Sync()
}
