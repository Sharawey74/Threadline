// Package scan discovers what is on disk: study topics and their material.
//
// It is plain Go and imports no Wails, like everything under core/ (C1).
package scan

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"

	"github.com/Sharawey74/Threadline/core/plan"
)

// StudyDir is the folder holding the numbered topic directories.
const StudyDir = "Study guided & notes"

// topicRe matches "NN - Name". Schema §4.6: the numeric prefix is the canonical
// order, while the plan file supplies the study order. Both are kept, because
// they answer different questions.
var topicRe = regexp.MustCompile(`^(\d{2})\s*-\s*(.+)$`)

// Topics lists the study topic folders under the career root, in disk order.
//
// A missing study folder is not an error: reconciliation will report the count
// mismatch, which is more useful than a failure that stops the whole scan.
func Topics(root string) ([]plan.Topic, error) {
	entries, err := os.ReadDir(filepath.Join(root, StudyDir))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var out []plan.Topic
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		m := topicRe.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		order, err := strconv.Atoi(m[1])
		if err != nil {
			continue
		}
		out = append(out, plan.Topic{Slug: e.Name(), Order: order})
	}
	return out, nil
}

// Material lists the readable files inside a topic folder.
func Material(root, slug string) ([]string, error) {
	dir := filepath.Join(root, StudyDir, slug)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	known := map[string]bool{
		".pdf": true, ".md": true, ".docx": true, ".xlsx": true,
		".pptx": true, ".html": true, ".txt": true,
	}

	var out []string
	for _, e := range entries {
		if e.IsDir() || !known[filepath.Ext(e.Name())] {
			continue
		}
		out = append(out, e.Name())
	}
	return out, nil
}
