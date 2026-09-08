package store

import (
	"database/sql"
	"time"
)

// Position is where the user stopped in a document.
//
// Page and ScrollPct are pointers because "never opened" and "opened at page
// one" are different facts. A viewer told 0 would jump to the top of a
// document the user was halfway through.
type Position struct {
	ArtifactID int64    `json:"artifactId"`
	Page       *int     `json:"page"`
	ScrollPct  *float64 `json:"scrollPct"`
}

// SavePosition records a page. Called on every page turn, so it upserts rather
// than reading first.
func (s *Store) SavePosition(artifactID int64, page int, now time.Time) error {
	_, err := s.db.Exec(`
		INSERT INTO artifact_position(artifact_id, page, updated_at)
		VALUES(?, ?, ?)
		ON CONFLICT(artifact_id) DO UPDATE SET
			page       = excluded.page,
			updated_at = excluded.updated_at`,
		artifactID, page, now.Unix())
	return err
}

// Position returns where the user stopped, or an empty position if they never
// opened the document.
func (s *Store) Position(artifactID int64) (Position, error) {
	p := Position{ArtifactID: artifactID}

	var page sql.NullInt64
	var scroll sql.NullFloat64
	err := s.db.QueryRow(
		`SELECT page, scroll_pct FROM artifact_position WHERE artifact_id = ?`, artifactID,
	).Scan(&page, &scroll)

	if err == sql.ErrNoRows {
		return p, nil // never opened; not an error
	}
	if err != nil {
		return p, err
	}

	if page.Valid {
		v := int(page.Int64)
		p.Page = &v
	}
	if scroll.Valid {
		v := scroll.Float64
		p.ScrollPct = &v
	}
	return p, nil
}
