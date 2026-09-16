package workspace

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// PDFs open in Microsoft Edge, which can annotate them; Threadline renders
// none (9 Sep 2026). Edge is started directly, never through a shell, and is
// handed one argument: a local file URL. Nothing here touches the network (C6).

// ErrNoEdge reports that Edge could not be found where Windows installs it.
var ErrNoEdge = errors.New("microsoft Edge was not found")

// OpenExternal opens a registered PDF in Edge, at a page when page > 0.
func (s *Service) OpenExternal(id int64, page int) error {
	abs, ext, err := s.locate(id)
	if err != nil {
		return err
	}
	if kindOf(ext) != "pdf" {
		return fmt.Errorf("artifact %d is %s; only PDFs open in Edge", id, ext)
	}
	// Registered once is not enough: the file must still be there.
	if info, err := os.Stat(abs); err != nil || info.IsDir() {
		return fmt.Errorf("artifact %d is no longer in the career folder", id)
	}

	target := fileURL(abs)
	if page > 0 {
		target += fmt.Sprintf("#page=%d", page)
	}
	return s.launch([]string{target})
}

// fileURL turns an absolute path into a file URL with every segment escaped.
// "&" is escaped too: it is legal in a path, but an escaped URL reads the same
// wherever it is passed.
func fileURL(abs string) string {
	segments := strings.Split(filepath.ToSlash(abs), "/")
	for i, seg := range segments {
		segments[i] = strings.ReplaceAll(url.PathEscape(seg), "&", "%26")
	}
	return "file:///" + strings.TrimPrefix(strings.Join(segments, "/"), "/")
}

// launchEdge starts Edge with the given arguments and does not wait for it.
func launchEdge(args []string) error {
	edge, err := findEdge()
	if err != nil {
		return err
	}
	cmd := exec.Command(edge, args...) // #nosec G204 -- a fixed Edge path; the one argument is a file URL built above
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start Edge: %w", err)
	}
	return cmd.Process.Release()
}

// findEdge looks for msedge.exe in the folders Windows installs it to.
func findEdge() (string, error) {
	if runtime.GOOS != "windows" {
		return "", ErrNoEdge
	}
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		path := filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe")
		if _, err := os.Stat(path); err == nil { // #nosec G703 -- a Windows install folder plus a fixed suffix, only checked for existence
			return path, nil
		}
	}
	return "", ErrNoEdge
}
