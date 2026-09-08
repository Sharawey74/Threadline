package store

import (
	"database/sql"
	"fmt"
	"time"
)

// StartSession opens a session and returns its id.
//
// The lifecycle that matters — idle detection, scope inference, crash-safe
// flushing — is I5. This is the minimum the bridge needs to satisfy the
// contract without pretending sessions work yet.
func (s *Store) StartSession(scopeKind, scopeRef string, now time.Time) (int64, error) {
	res, err := s.db.Exec(
		`INSERT INTO session(scope_kind, scope_ref, started_at) VALUES(?, ?, ?)`,
		scopeKind, scopeRef, now.Unix())
	if err != nil {
		return 0, fmt.Errorf("start session: %w", err)
	}
	return res.LastInsertId()
}

// EndSession closes a session.
//
// note_source records how the note came to exist. A skipped note and an empty
// typed note look identical in the text column, and the difference is the
// whole anti-homework measurement: skipping must stay free and visible as a
// choice, not indistinguishable from writing nothing.
func (s *Store) EndSession(id int64, note, reason string, now time.Time) error {
	source := "typed"
	if note == "" {
		source = "skipped"
	}

	res, err := s.db.Exec(`
		UPDATE session
		SET ended_at = ?, note = ?, note_source = ?, end_reason = ?
		WHERE id = ? AND ended_at IS NULL`,
		now.Unix(), nullIfEmpty(note), source, reason, id)
	if err != nil {
		return fmt.Errorf("end session %d: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("session %d is not open", id)
	}
	return nil
}

// MeasuredSeconds totals recorded time across closed sessions.
//
// Returns false when nothing was recorded at all. That is not zero: a period
// the app never ran is not a period of no work, and displaying 0h for it would
// be exactly the invented number C5 forbids.
func (s *Store) MeasuredSeconds() (int64, bool, error) {
	var total sql.NullInt64
	err := s.db.QueryRow(`SELECT SUM(active_secs) FROM session`).Scan(&total)
	if err != nil {
		return 0, false, err
	}
	return total.Int64, total.Valid, nil
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
