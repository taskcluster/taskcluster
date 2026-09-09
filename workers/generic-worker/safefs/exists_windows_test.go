package safefs

import (
	"path/filepath"
	"testing"
)

func TestExists(t *testing.T) {
	base := t.TempDir()
	write(t, filepath.Join(base, "file"), "x")
	mkdir(t, filepath.Join(base, "dir"))
	secret, _ := mksecret(t, base)
	stage := filepath.Join(base, "stage")
	mkjunction(t, stage, secret)

	for _, tc := range []struct {
		name    string
		path    string
		exists  bool
		refused bool
	}{
		{"a file", filepath.Join(base, "file"), true, false},
		{"a directory", filepath.Join(base, "dir"), true, false},
		{"a junction", stage, true, false},
		{"an absent leaf", filepath.Join(base, "gonebuyingmilk"), false, false},
		{"an absent parent", filepath.Join(base, "no", "such", "parent", "leaf"), false, false},
		{"a junctioned prefix", filepath.Join(stage, "leaf"), false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			exists, err := Exists(tc.path)
			if tc.refused {
				if err == nil {
					t.Fatal("was expecting the path to be refused")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if exists != tc.exists {
				t.Errorf("exists = %v, want %v", exists, tc.exists)
			}
		})
	}
}
