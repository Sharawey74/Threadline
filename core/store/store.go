package store

import (
	"database/sql"
	"fmt"
	"path/filepath"

	// Pure Go, no cgo. FTS5 verified available during the Phase 0 spike -
	// see docs/adr/002-sqlite-driver.md.
	_ "modernc.org/sqlite"
)

// Store is an open Threadline database.
type Store struct {
	db   *sql.DB
	path string
}

// Open opens or creates the database at path and migrates it to the latest
// schema version.
//
// WAL mode and synchronous=NORMAL come from Schema §8. A desktop app has one
// user and one writer, so there is no contention to design around; WAL is here
// because it survives a hard kill without corrupting the file, which matters
// for N7 (a session must survive the process being killed).
func Open(path string) (*Store, error) {
	dsn := path
	if path != "" {
		dsn = filepath.ToSlash(path) + "?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)"
	}

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}

	// One connection. Concurrent writers to SQLite produce "database is
	// locked" errors, and this app has exactly one writer by design.
	db.SetMaxOpenConns(1)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("open %s: %w", path, err)
	}

	if err := Migrate(db, path); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &Store{db: db, path: path}, nil
}

// OpenMemory opens a private in-memory database, migrated and ready. For tests.
func OpenMemory() (*Store, error) {
	db, err := sql.Open("sqlite", ":memory:?_pragma=foreign_keys(ON)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := Migrate(db, ""); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

// Close releases the database.
func (s *Store) Close() error { return s.db.Close() }

// DB exposes the handle for the query layer in this package.
func (s *Store) DB() *sql.DB { return s.db }

// SchemaVersion reports how far migrations have run.
func (s *Store) SchemaVersion() (int, error) { return currentVersion(s.db) }

// Meta reads a value from app_meta. The second return distinguishes "absent"
// from "empty string" - the same distinction the parser makes for hours.
func (s *Store) Meta(key string) (string, bool, error) {
	var v string
	err := s.db.QueryRow(`SELECT value FROM app_meta WHERE key = ?`, key).Scan(&v)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// SetMeta writes a value to app_meta.
func (s *Store) SetMeta(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO app_meta(key, value) VALUES(?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
