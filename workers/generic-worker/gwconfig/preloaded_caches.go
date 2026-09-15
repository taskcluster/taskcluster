package gwconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ValidatePreloadedDirectoryCaches prevents imports from overlapping worker
// storage or each other. Missing seeds are allowed and checked at startup.
func (c *Config) ValidatePreloadedDirectoryCaches() error {
	if len(c.PreloadedDirectoryCaches) == 0 {
		return nil
	}
	names := map[string]bool{}
	paths := []string{}
	for _, dir := range []string{c.CachesDir, c.DownloadsDir, c.TasksDir} {
		if dir == "" {
			continue
		}
		path, err := preloadPath(dir)
		if err != nil {
			return err
		}
		paths = append(paths, path)
	}
	for i, seed := range c.PreloadedDirectoryCaches {
		if seed.CacheName == "" || !filepath.IsAbs(seed.Location) || preloadHasParent(seed.Location) {
			return fmt.Errorf("preloadedDirectoryCaches[%d] requires cacheName and an absolute location without parent components", i)
		}
		if names[seed.CacheName] {
			return fmt.Errorf("duplicate preloaded directory cache name %q", seed.CacheName)
		}
		names[seed.CacheName] = true
		path, err := preloadPath(seed.Location)
		if err != nil {
			// An unusable optional seed is checked again by the importer, which
			// warns and skips it. Still check its lexical path for overlaps.
			path = filepath.Clean(seed.Location)
		}
		for _, other := range paths {
			if preloadContains(path, other) || preloadContains(other, path) {
				return fmt.Errorf("preloaded directory cache location %q overlaps %q", seed.Location, other)
			}
		}
		paths = append(paths, path)
	}
	return nil
}

// Resolve existing ancestors too: cache storage may not exist at config load.
func preloadPath(path string) (string, error) {
	if preloadHasParent(path) {
		return "", fmt.Errorf("preloaded cache paths must not contain parent components: %q", path)
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if os.IsNotExist(err) && filepath.Dir(abs) != abs {
		parent, parentErr := preloadPath(filepath.Dir(abs))
		return filepath.Join(parent, filepath.Base(abs)), parentErr
	}
	return resolved, err
}

func preloadContains(parent, child string) bool {
	// Reject case aliases on platforms that commonly use insensitive filesystems.
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		parent, child = strings.ToLower(parent), strings.ToLower(child)
	}
	rel, err := filepath.Rel(parent, child)
	return err == nil && (rel == "." || filepath.IsLocal(rel))
}

func preloadHasParent(path string) bool {
	for _, component := range strings.Split(filepath.ToSlash(path), "/") {
		if component == ".." {
			return true
		}
	}
	return false
}
