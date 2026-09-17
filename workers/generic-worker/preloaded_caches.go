package main

import (
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/gwconfig"
)

// Called with cacheMutex held, before tasks can access caches. Seed directories
// must be controlled by the worker administrator and immutable during import.
func importPreloadedDirectoryCache(seed gwconfig.PreloadedDirectoryCache) error {
	start := time.Now()
	consumed := map[string]bool{}
	if err := loadFromJSONFile(&consumed, preloadedCacheStateFile); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("could not load seed consumption state: %w", err)
	}
	if consumed == nil {
		consumed = map[string]bool{}
	}
	info, err := os.Lstat(seed.Location)
	if err != nil {
		if os.IsNotExist(err) && (consumed[filepath.Clean(seed.Location)] || len(directoryCaches[seed.CacheName]) != 0) {
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("seed must be a directory, not a file or link")
	}
	// Use the physical path for both consumption state and cleanup. Config
	// validation rejects parent components before resolving any aliases.
	location, err := filepath.EvalSymlinks(seed.Location)
	if err != nil {
		return err
	}
	if consumed[location] || len(directoryCaches[seed.CacheName]) != 0 {
		if err := consumePreloadedCache(consumed, location, filepath.Clean(seed.Location)); err != nil {
			return err
		}
		log.Printf("Removing preloaded directory cache seed %q: already consumed or cache %q already exists", location, seed.CacheName)
		return os.RemoveAll(location)
	}
	root, err := os.OpenRoot(location)
	if err != nil {
		return err
	}
	defer root.Close()
	source := root.FS()
	// Preserve relative links only when they resolve inside the source root.
	// Absolute links and junctions would retain image-local references.
	if err := fs.WalkDir(source, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type()&fs.ModeSymlink != 0 {
			// CopyFS can lose directory-link types on Windows. The normal
			// Windows cross-volume cache mover also rejects all links.
			if runtime.GOOS == "windows" {
				return fmt.Errorf("seed links are not supported on Windows: %q", path)
			}
			target, err := fs.ReadLink(source, path)
			if err != nil {
				return err
			}
			if filepath.IsAbs(target) || filepath.VolumeName(target) != "" {
				return fmt.Errorf("seed link %q must have a relative target", path)
			}
			// Root.FS prevents traversal outside the seed, including link chains.
			info, err := fs.Stat(source, path)
			if err != nil {
				return fmt.Errorf("invalid seed link %q: %w", path, err)
			}
			if !info.IsDir() && !info.Mode().IsRegular() {
				return fmt.Errorf("unsupported seed link target %q: %s", path, info.Mode())
			}
			return nil
		}
		if !d.IsDir() && !d.Type().IsRegular() {
			return fmt.Errorf("unsupported seed entry %q: %s", path, d.Type())
		}
		return nil
	}); err != nil {
		return err
	}
	entry := newPoolEntry(seed.CacheName)
	// The unregistered destination is private until the entire copy succeeds.
	// Startup sweeps it after an interruption. Keep the source for retry.
	if err := os.Mkdir(entry.Location, 0700); err != nil {
		return err
	}
	if err := os.CopyFS(entry.Location, source); err != nil {
		_ = os.RemoveAll(entry.Location)
		return err
	}
	// CopyFS does not preserve timestamps or ownership. Restore metadata before
	// publishing the cache, including the root used by non-root containers.
	if err := fs.WalkDir(source, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		destination := filepath.Join(entry.Location, filepath.FromSlash(path))
		if err := preservePreloadedOwnership(destination, info); err != nil {
			return err
		}
		return os.Chtimes(destination, info.ModTime(), info.ModTime())
	}); err != nil {
		_ = os.RemoveAll(entry.Location)
		return err
	}
	// Persist consumption before registering or deleting anything. If the
	// process stops between these two state writes, use a cold cache on the
	// next start rather than risk importing a previously consumed seed.
	if err := consumePreloadedCache(consumed, location, filepath.Clean(seed.Location)); err != nil {
		_ = os.RemoveAll(entry.Location)
		return err
	}
	entry.Hits = 0
	entry.InUse = false
	entry.LastUsed = time.Now()
	directoryCaches[seed.CacheName] = []*Cache{entry}
	if err := fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json"); err != nil {
		directoryCaches.Remove(entry)
		_ = os.RemoveAll(entry.Location)
		return err
	}
	if err := fileutil.SecureFiles("directory-caches.json"); err != nil {
		return err
	}
	// Close the source handle before removing it on Windows.
	if err := root.Close(); err != nil {
		return err
	}
	if err := os.RemoveAll(location); err != nil {
		return err
	}
	log.Printf("Imported preloaded directory cache %q in %s", seed.CacheName, time.Since(start))
	return nil
}

// Keep consumption outside CacheMap so purge and eviction cannot erase it.
const preloadedCacheStateFile = "preloaded-directory-caches.json"

func consumePreloadedCache(consumed map[string]bool, locations ...string) error {
	changed := false
	for _, location := range locations {
		if !consumed[location] {
			consumed[location] = true
			changed = true
		}
	}
	if changed {
		if err := fileutil.WriteToFileAsJSON(&consumed, preloadedCacheStateFile); err != nil {
			return err
		}
	}
	return fileutil.SecureFiles(preloadedCacheStateFile)
}
