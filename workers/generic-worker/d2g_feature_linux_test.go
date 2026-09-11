package main

import (
	"encoding/json"
	"os"
	"testing"
)

// Named/registry images must not honor d2g-image-cache.json as a skip for
// docker pull, and must not write a name:tag entry that can never be hit.
// Artifact SHA keys still cache, so concurrent tasks can share a docker load.
func TestLoadImageLockedSkipsCacheOnlyForArtifacts(t *testing.T) {
	t.Chdir(t.TempDir())

	const (
		registryKey = "example.invalid/gw04:tag"
		artifactKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	)
	cached := ImageCache{
		registryKey: {ID: "cached-registry-id", Name: registryKey},
		artifactKey: {ID: "cached-artifact-id", Name: "loaded:tag"},
	}
	data, err := json.Marshal(cached)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("d2g-image-cache.json", data, 0644); err != nil {
		t.Fatal(err)
	}

	fresh := &Image{ID: "fresh-id", Name: "fresh"}
	dtf := &D2GTaskFeature{imageCache: ImageCache{}}

	t.Run("registry cache hit still pulls", func(t *testing.T) {
		loadCalled := false
		image, loaded, loadErr := dtf.loadImageLocked(registryKey, func() (*Image, *CommandExecutionError) {
			loadCalled = true
			return fresh, nil
		}, false)
		if loadErr != nil {
			t.Fatalf("loadImageLocked: %v", loadErr)
		}
		if !loadCalled {
			t.Fatal("registry image cache hit skipped docker pull")
		}
		if !loaded {
			t.Fatal("registry image should report loaded=true when pull ran")
		}
		if image != fresh {
			t.Fatalf("got image %#v, want the pulled image", image)
		}
		if _, persisted := dtf.imageCache[registryKey]; persisted {
			t.Fatal("registry pull must not persist a cache entry")
		}
	})

	t.Run("artifact cache hit skips load", func(t *testing.T) {
		loadCalled := false
		image, loaded, loadErr := dtf.loadImageLocked(artifactKey, func() (*Image, *CommandExecutionError) {
			loadCalled = true
			return fresh, nil
		}, true)
		if loadErr != nil {
			t.Fatalf("loadImageLocked: %v", loadErr)
		}
		if loadCalled {
			t.Fatal("artifact image cache hit still called docker load")
		}
		if loaded {
			t.Fatal("artifact cache hit should report loaded=false")
		}
		if image == nil || image.ID != "cached-artifact-id" {
			t.Fatalf("got image %#v, want cached artifact", image)
		}
	})

	t.Run("artifact miss persists cache entry", func(t *testing.T) {
		const missKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"
		dtfMiss := &D2GTaskFeature{imageCache: ImageCache{}}
		image, loaded, loadErr := dtfMiss.loadImageLocked(missKey, func() (*Image, *CommandExecutionError) {
			return fresh, nil
		}, true)
		if loadErr != nil {
			t.Fatalf("loadImageLocked: %v", loadErr)
		}
		if !loaded {
			t.Fatal("artifact miss should report loaded=true")
		}
		if image != fresh {
			t.Fatalf("got image %#v, want the loaded image", image)
		}
		if dtfMiss.imageCache[missKey] != fresh {
			t.Fatal("artifact load must persist a cache entry")
		}
	})
}
