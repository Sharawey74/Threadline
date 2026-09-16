package workspace

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// Notes live beside the file they are about, `<stem>.notes.md` (C12), one
// `## Title` section per outline section. A note is inserted, never
// re-serialised: every byte already in the file stays as it was.

// headingRe matches a level-1 or level-2 heading, which ends a section.
var headingRe = regexp.MustCompile(`^#{1,2}\s`)

// AppendNote adds a note at the end of a section of a file's notes, creating
// the file or the heading when either is missing.
func (s *Service) AppendNote(id int64, section, text string) error {
	abs, _, err := s.locate(id)
	if err != nil {
		return err
	}
	title := cleanTitle(section)
	if title == "" {
		return errors.New("a note needs a section title")
	}
	body := noteBody(text)
	if body == "" {
		return errors.New("a note needs some text")
	}

	path := sidecar(abs, ".notes.md")
	current, err := os.ReadFile(path) // #nosec G304 -- a sidecar beside a registered artifact
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read notes: %w", err)
	}
	return writeFileAtomic(path, []byte(insertNote(string(current), title, body)))
}

// insertNote returns the notes text with the note added.
func insertNote(c, title, body string) string {
	if c == "" {
		return "# Notes\n\n## " + title + "\n\n" + body + "\n"
	}
	end, found := sectionEnd(c, title)
	if !found {
		return c + gap(c) + "## " + title + "\n\n" + body + "\n"
	}
	if end == len(c) {
		return c + gap(c) + body + "\n"
	}
	// Before the next heading: the line above it already ends in "\n".
	prefix := ""
	if !strings.HasSuffix(c[:end], "\n\n") {
		prefix = "\n"
	}
	return c[:end] + prefix + body + "\n\n" + c[end:]
}

// sectionEnd finds the byte offset where a section's content ends: the start
// of the next heading, or the end of the text.
func sectionEnd(c, title string) (int, bool) {
	offset, inSection := 0, false
	for _, line := range strings.SplitAfter(c, "\n") {
		bare := strings.TrimRight(line, " \t\r\n")
		if inSection && headingRe.MatchString(bare) {
			return offset, true
		}
		if bare == "## "+title {
			inSection = true
		}
		offset += len(line)
	}
	return len(c), inSection
}

// gap is what must come before new text at the end of c for a blank line to
// separate them.
func gap(c string) string {
	switch {
	case strings.HasSuffix(c, "\n\n"):
		return ""
	case strings.HasSuffix(c, "\n"):
		return "\n"
	default:
		return "\n\n"
	}
}

// noteBody trims a note and escapes any line that would read as a heading,
// so a note can never start a section of its own.
func noteBody(text string) string {
	lines := strings.Split(strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n")), "\n")
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimLeft(line, " \t"), "#") {
			lines[i] = `\` + strings.TrimLeft(line, " \t")
		}
	}
	return strings.Join(lines, "\n")
}
