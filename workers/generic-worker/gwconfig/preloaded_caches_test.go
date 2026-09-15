package gwconfig

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidatePreloadedDirectoryCaches(t *testing.T) {
	root := t.TempDir()
	seed := filepath.Join(root, "seed")
	for _, tc := range []struct {
		name    string
		seeds   []PreloadedDirectoryCache
		invalid bool
	}{
		{"disabled", nil, false},
		{"missing allowed", []PreloadedDirectoryCache{{"one", seed}}, false},
		{"empty name", []PreloadedDirectoryCache{{"", seed}}, true},
		{"relative", []PreloadedDirectoryCache{{"one", "seed"}}, true},
		{"duplicate name", []PreloadedDirectoryCache{{"one", seed}, {"one", filepath.Join(root, "other")}}, true},
		{"duplicate path", []PreloadedDirectoryCache{{"one", seed}, {"two", seed}}, true},
		{"nested seeds", []PreloadedDirectoryCache{{"one", seed}, {"two", filepath.Join(seed, "child")}}, true},
		{"cache child", []PreloadedDirectoryCache{{"one", filepath.Join(root, "caches", "seed")}}, true},
		{"cache ancestor", []PreloadedDirectoryCache{{"one", root}}, true},
		{"task child", []PreloadedDirectoryCache{{"one", filepath.Join(root, "tasks", "seed")}}, true},
		{"download child", []PreloadedDirectoryCache{{"one", filepath.Join(root, "downloads", "seed")}}, true},
		{"prefix siblings", []PreloadedDirectoryCache{{"one", seed}, {"two", seed + "-other"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := &Config{CachesDir: filepath.Join(root, "caches"), TasksDir: filepath.Join(root, "tasks"), DownloadsDir: filepath.Join(root, "downloads"), PreloadedDirectoryCaches: tc.seeds}
			if err := c.ValidatePreloadedDirectoryCaches(); (err != nil) != tc.invalid {
				t.Fatalf("invalid=%v, got %v", tc.invalid, err)
			}
		})
	}
}

func TestValidatePreloadedCacheSymlinkOverlap(t *testing.T) {
	root := t.TempDir()
	alias := filepath.Join(root, "alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	c := &Config{CachesDir: filepath.Join(root, "caches"), PreloadedDirectoryCaches: []PreloadedDirectoryCache{{"one", filepath.Join(alias, "caches", "seed")}}}
	if err := c.ValidatePreloadedDirectoryCaches(); err == nil {
		t.Fatal("accepted cache overlap through a symlink")
	}
}
