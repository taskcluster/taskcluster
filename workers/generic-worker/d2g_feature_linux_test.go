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

func TestImageRefWithDigest(t *testing.T) {
	const digest = "sha256:513c074113a871b51a8d16ab445c88779d6452d937a164fb5cc479f32668a41d"

	tests := []struct {
		name  string
		image string
		want  string
	}{
		{
			name:  "strips tag",
			image: "ubuntu:latest",
			want:  "docker.io/library/ubuntu@" + digest,
		},
		{
			name:  "replaces existing digest",
			image: "ubuntu@sha256:0000000000000000000000000000000000000000000000000000000000000000",
			want:  "docker.io/library/ubuntu@" + digest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := imageRefWithDigest(tc.image, digest)
			if err != nil {
				t.Fatalf("imageRefWithDigest() unexpected err: %v", err)
			}
			if got != tc.want {
				t.Fatalf("imageRefWithDigest() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestImageRefWithDigestRejectsInvalidDigest(t *testing.T) {
	for _, digest := range []string{"", "latest", "sha256:not-hex", "sha256:513c"} {
		if got, err := imageRefWithDigest("ubuntu:latest", digest); err == nil {
			t.Errorf("imageRefWithDigest(%q) = %q, want error", digest, got)
		}
	}
}

func TestPulledDigest(t *testing.T) {
	tests := []struct {
		name    string
		out     string
		want    string
		wantErr bool
	}{
		{
			name: "fresh pull",
			out: `Using default tag: latest
latest: Pulling from library/ubuntu
08f5f5b2a2b0: Pulling fs layer
08f5f5b2a2b0: Pull complete
Digest: sha256:513c074113a871b51a8d16ab445c88779d6452d937a164fb5cc479f32668a41d
Status: Downloaded newer image for ubuntu:latest
docker.io/library/ubuntu:latest
`,
			want: "sha256:513c074113a871b51a8d16ab445c88779d6452d937a164fb5cc479f32668a41d",
		},
		{
			name: "image already up to date",
			out: `Using default tag: latest
latest: Pulling from library/archlinux
Digest: sha256:b944cc65c5f28665dfd5fdbf5ed2997c88f5bb4a0aefac7ee8a7ef01893e5ed9
Status: Image is up to date for archlinux:latest
docker.io/library/archlinux:latest
`,
			want: "sha256:b944cc65c5f28665dfd5fdbf5ed2997c88f5bb4a0aefac7ee8a7ef01893e5ed9",
		},
		{
			name:    "no digest line",
			out:     "docker.io/library/ubuntu:latest\n",
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := pulledDigest([]byte(tc.out))
			if tc.wantErr {
				if err == nil {
					t.Fatalf("pulledDigest() = %q, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("pulledDigest() unexpected err: %v", err)
			}
			if got != tc.want {
				t.Fatalf("pulledDigest() = %q, want %q", got, tc.want)
			}
		})
	}
}
