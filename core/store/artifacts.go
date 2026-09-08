package store

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// Artifact is a file the app has seen.
//
// The id is what the frontend holds and sends back, so it must survive a
// rescan: a fresh id every scan would break every stored position and every
// open pane the moment a file was added to a folder. The path is the identity;
// the id is a stable handle to it.
type Artifact struct {
	ID    int64
	Path  string // relative to the career root, slash-separated
	Title string
	Ext   string
}

// UpsertArtifact records a file and returns its stable id.
//
// Paths are stored slash-separated and lowercased for lookup, because Windows
// hands back both separators and either case for the same file. Storing the
// raw path would create two rows for one document and split its history.
func (s *Store) UpsertArtifact(relPath string, now time.Time) (int64, error) {
	key := normalisePath(relPath)
	title := strings.TrimSuffix(filepath.Base(key), filepath.Ext(key))
	ext := strings.ToLower(filepath.Ext(key))

	_, err := s.db.Exec(`
		INSERT INTO artifact(kind, path, title, ext, first_seen, last_seen, status)
		VALUES('file', ?, ?, ?, ?, ?, 'ok')
		ON CONFLICT(path) DO UPDATE SET
			title     = excluded.title,
			ext       = excluded.ext,
			last_seen = excluded.last_seen,
			status    = 'ok'`,
		key, title, ext, now.Unix(), now.Unix())
	if err != nil {
		return 0, fmt.Errorf("upsert artifact %s: %w", relPath, err)
	}

	var id int64
	if err := s.db.QueryRow(`SELECT id FROM artifact WHERE path = ?`, key).Scan(&id); err != nil {
		return 0, fmt.Errorf("read artifact id for %s: %w", relPath, err)
	}
	return id, nil
}

// ArtifactByID returns one artifact.
//
// The bridge resolves every id through this before touching a file. An id the
// store does not know is refused rather than guessed at — that is what stops a
// stale or invented id from reaching the filesystem.
func (s *Store) ArtifactByID(id int64) (Artifact, error) {
	var a Artifact
	err := s.db.QueryRow(
		`SELECT id, path, title, ext FROM artifact WHERE id = ?`, id,
	).Scan(&a.ID, &a.Path, &a.Title, &a.Ext)
	if err == sql.ErrNoRows {
		return Artifact{}, fmt.Errorf("no artifact with id %d", id)
	}
	return a, err
}

// ArtifactsUnder returns every artifact whose path sits beneath prefix.
func (s *Store) ArtifactsUnder(prefix string) ([]Artifact, error) {
	key := normalisePath(prefix)
	rows, err := s.db.Query(
		`SELECT id, path, title, ext FROM artifact
		 WHERE path = ? OR path LIKE ? ORDER BY path`,
		key, key+"/%")
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []Artifact
	for rows.Next() {
		var a Artifact
		if err := rows.Scan(&a.ID, &a.Path, &a.Title, &a.Ext); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// MarkArtifactMissing records that a file is no longer on disk.
//
// A flag, never a delete — the same reasoning as an orphaned anchor. The hours
// recorded against a document were really spent, and a file can come back:
// renamed, restored, or a folder remounted.
func (s *Store) MarkArtifactMissing(id int64, now time.Time) error {
	_, err := s.db.Exec(
		`UPDATE artifact SET status = 'missing', last_seen = ? WHERE id = ?`, now.Unix(), id)
	return err
}

// normalisePath makes a path comparable: slash-separated and lowercased.
func normalisePath(p string) string {
	return strings.ToLower(filepath.ToSlash(filepath.Clean(p)))
}
