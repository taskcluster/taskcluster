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

func TestValidatePreloadedCacheRejectsParentTraversal(t *testing.T) {
	root := t.TempDir()
	real := filepath.Join(root, "real")
	if err := os.MkdirAll(filepath.Join(real, "anchor"), 0700); err != nil {
		t.Fatal(err)
	}
	caches := filepath.Join(real, "caches")
	if err := os.Mkdir(caches, 0700); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(root, "alias")
	if err := os.Symlink(filepath.Join(real, "anchor"), alias); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	// Keep the parent component: filepath.Join would erase the regression.
	seed := alias + string(os.PathSeparator) + ".." + string(os.PathSeparator) + "caches"
	c := &Config{CachesDir: caches, PreloadedDirectoryCaches: []PreloadedDirectoryCache{{"one", seed}}}
	if err := c.ValidatePreloadedDirectoryCaches(); err == nil {
		t.Fatal("accepted a seed that aliases live cache storage through symlink/..")
	}
}

func TestValidatePreloadedCacheUnusableSeedIsOptional(t *testing.T) {
	root := t.TempDir()
	blocker := filepath.Join(root, "file")
	if err := os.WriteFile(blocker, []byte("not a directory"), 0600); err != nil {
		t.Fatal(err)
	}
	c := &Config{CachesDir: filepath.Join(root, "caches"), PreloadedDirectoryCaches: []PreloadedDirectoryCache{{"one", filepath.Join(blocker, "seed")}}}
	if err := c.ValidatePreloadedDirectoryCaches(); err != nil {
		t.Fatalf("unusable seed must not prevent worker startup: %v", err)
	}
}
