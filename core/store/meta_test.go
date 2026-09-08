package store

import "testing"

// A setting that was never written is absent, not an error and not empty. The
// career root has no value on first run, and treating that as a failure would
// make the normal first launch look broken.
func TestCareerRootIsAbsentBeforeItIsChosen(t *testing.T) {
	s := memStore(t)

	value, found, err := s.Meta(KeyCareerRoot)
	if err != nil {
		t.Fatalf("reading an unset key returned an error: %v", err)
	}
	if found {
		t.Errorf("reported found with value %q", value)
	}
}

func TestCareerRootRoundTrips(t *testing.T) {
	s := memStore(t)
	const path = `C:\Users\DELL\Desktop\Career`

	if err := s.SetMeta(KeyCareerRoot, path); err != nil {
		t.Fatal(err)
	}

	value, found, err := s.Meta(KeyCareerRoot)
	if err != nil {
		t.Fatal(err)
	}
	if !found || value != path {
		t.Errorf("got (%q, %v), want (%q, true)", value, found, path)
	}
}

// Choosing a different folder replaces the old one rather than accumulating
// rows the next read would pick between arbitrarily.
func TestChoosingAnotherFolderReplacesTheOld(t *testing.T) {
	s := memStore(t)

	_ = s.SetMeta(KeyCareerRoot, "first")
	_ = s.SetMeta(KeyCareerRoot, "second")

	value, _, _ := s.Meta(KeyCareerRoot)
	if value != "second" {
		t.Errorf("got %q, want the latest value", value)
	}
}
