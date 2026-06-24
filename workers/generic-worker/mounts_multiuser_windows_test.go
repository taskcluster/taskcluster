//go:build multiuser

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/taskcluster/v100/workers/generic-worker/host"
)

func ownerOf(t *testing.T, path string) string {
	t.Helper()
	out, err := host.Output("powershell", "-NoProfile", "-NonInteractive", "-Command",
		"(Get-Acl -LiteralPath '"+path+"').Owner")
	if err != nil {
		t.Fatalf("could not read owner of %q: %v", path, err)
	}
	owner := strings.TrimSpace(out)
	return owner[strings.LastIndex(owner, `\`)+1:]
}

func TestWritableDirectoryCacheReclaimsOwnership(t *testing.T) {
	setup(t)

	mounts := []MountEntry{
		&WritableDirectoryCache{
			CacheName: "banana-cache",
			Directory: "ownership-cache",
		},
	}

	payload := GenericWorkerPayload{
		Mounts:     toMountArray(t, &mounts),
		Command:    helloGoodbye(),
		MaxRunTime: 180,
	}
	defaults.SetDefaults(&payload)

	runTask := func() {
		td := testTask(t)
		td.Scopes = append(td.Scopes, "generic-worker:cache:banana-cache")
		_ = submitAndAssert(t, td, payload, "completed", "completed")
	}

	cacheLocation := func() string {
		entries := directoryCaches["banana-cache"]
		if len(entries) == 0 {
			t.Fatal("expected a persisted banana-cache entry after the task ran")
		}
		return entries[0].Location
	}

	runTask()
	location := cacheLocation()

	nested := filepath.Join(location, "sub", "file.txt")
	if err := os.MkdirAll(filepath.Dir(nested), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(nested, []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}

	// *S-1-5-32-544 is the BUILTIN\Administrators group
	if err := host.Run("icacls", location, "/setowner", "*S-1-5-32-544", "/T"); err != nil {
		t.Fatalf("could not reassign cache ownership: %v", err)
	}
	if owner := ownerOf(t, location); owner == taskContext.User.Name {
		t.Fatalf("cache %q is still owned by task user %q before reuse", location, taskContext.User.Name)
	}

	runTask()
	location = cacheLocation()
	nested = filepath.Join(location, "sub", "file.txt")

	for _, p := range []string{location, nested} {
		if owner := ownerOf(t, p); owner != taskContext.User.Name {
			t.Errorf("expected %q to be owned by task user %q after cache reuse, but owner is %q", p, taskContext.User.Name, owner)
		}
	}
}
