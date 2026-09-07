package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/Sharawey74/Threadline/core/plan"
)

// UpsertAnchor records an anchor seen in the current scan.
//
// first_seen is preserved on conflict: an item the user has been working on
// for weeks should not look new because it was reworded. last_seen moves
// forward, and orphaned_at is cleared - an anchor that reappears is no longer
// an orphan.
func (s *Store) UpsertAnchor(a plan.AnchorState, now time.Time) error {
	_, err := s.db.Exec(`
		INSERT INTO item_anchor(anchor, role, section, text, first_seen, last_seen, orphaned_at)
		VALUES(?, ?, ?, ?, ?, ?, NULL)
		ON CONFLICT(anchor) DO UPDATE SET
			role        = excluded.role,
			section     = excluded.section,
			text        = excluded.text,
			last_seen   = excluded.last_seen,
			orphaned_at = NULL`,
		a.Anchor, string(a.Role), a.Section, a.Text, now.Unix(), now.Unix())
	if err != nil {
		return fmt.Errorf("upsert anchor %s: %w", a.Anchor, err)
	}
	return nil
}

// Anchors returns every anchor the store knows, orphans included.
//
// Orphans are returned because re-anchoring needs them: an item that vanished
// last week may reappear this week under a reworded heading, and an orphan left
// out of the candidate set can never be recovered.
func (s *Store) Anchors() ([]plan.AnchorState, error) {
	rows, err := s.db.Query(
		`SELECT anchor, role, section, text FROM item_anchor ORDER BY first_seen`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []plan.AnchorState
	for rows.Next() {
		var a plan.AnchorState
		var role string
		if err := rows.Scan(&a.Anchor, &role, &a.Section, &a.Text); err != nil {
			return nil, err
		}
		a.Role = plan.Role(role)
		out = append(out, a)
	}
	return out, rows.Err()
}

// MarkOrphaned records that an anchor is no longer in the file.
//
// It is a flag, never a delete. The hours behind it were really spent, and the
// user may simply have reworded something - Schema §5: the store never destroys
// history because a file changed.
func (s *Store) MarkOrphaned(anchor string, now time.Time) error {
	res, err := s.db.Exec(
		`UPDATE item_anchor SET orphaned_at = ? WHERE anchor = ? AND orphaned_at IS NULL`,
		now.Unix(), anchor)
	if err != nil {
		return fmt.Errorf("orphan %s: %w", anchor, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil // already orphaned, or never seen
	}
	return s.recordEvent(anchor, "orphaned", "no longer in the file", now)
}

// RecordEvent appends to an anchor's history: created, reworded, checked,
// unchecked, orphaned.
func (s *Store) RecordEvent(anchor, event, detail string, now time.Time) error {
	return s.recordEvent(anchor, event, detail, now)
}

func (s *Store) recordEvent(anchor, event, detail string, now time.Time) error {
	_, err := s.db.Exec(
		`INSERT INTO item_anchor_history(anchor, event, detail, at) VALUES(?, ?, ?, ?)`,
		anchor, event, detail, now.Unix())
	if err != nil {
		return fmt.Errorf("record %s for %s: %w", event, anchor, err)
	}
	return nil
}

// AnchorEvent is one entry from an item's history.
type AnchorEvent struct {
	Event  string
	Detail string
	At     time.Time
}

// History returns an anchor's events, oldest first.
func (s *Store) History(anchor string) ([]AnchorEvent, error) {
	rows, err := s.db.Query(
		`SELECT event, detail, at FROM item_anchor_history WHERE anchor = ? ORDER BY at, id`, anchor)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []AnchorEvent
	for rows.Next() {
		var e AnchorEvent
		var detail sql.NullString
		var at int64
		if err := rows.Scan(&e.Event, &detail, &at); err != nil {
			return nil, err
		}
		e.Detail = detail.String
		e.At = time.Unix(at, 0)
		out = append(out, e)
	}
	return out, rows.Err()
}

// IsOrphaned reports whether an anchor has left the file.
func (s *Store) IsOrphaned(anchor string) (bool, error) {
	var at sql.NullInt64
	err := s.db.QueryRow(`SELECT orphaned_at FROM item_anchor WHERE anchor = ?`, anchor).Scan(&at)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return at.Valid, err
}
