package personakb

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestPrunedOutputPassesPlutilLint(t *testing.T) {
	data := marshal(t, topLevel(t, []string{guidB}, guidA, guidB, guidC))
	pruned, removed, err := Prune(data, set(guidA))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("removed %v, want 1", removed)
	}
	path := filepath.Join(t.TempDir(), "persona.kb")
	if err := os.WriteFile(path, pruned, 0644); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("/usr/bin/plutil", "-lint", path).CombinedOutput()
	if err != nil {
		t.Fatalf("plutil -lint failed: %v\n%s", err, out)
	}
}
