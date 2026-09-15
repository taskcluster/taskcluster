package main

import (
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/gwconfig"
)

// Called with cacheMutex held, before tasks can access caches. Seed directories
// must be controlled by the worker administrator and immutable during import.
func importPreloadedDirectoryCache(seed gwconfig.PreloadedDirectoryCache) error {
	start := time.Now()
	if len(directoryCaches[seed.CacheName]) != 0 {
		// Also finish cleanup if startup stopped after state was saved.
		return os.RemoveAll(seed.Location)
	}
	info, err := os.Lstat(seed.Location)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("seed must be a directory, not a file or link")
	}
	root, err := os.OpenRoot(seed.Location)
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
	if err := os.RemoveAll(seed.Location); err != nil {
		return err
	}
	log.Printf("Imported preloaded directory cache %q in %s", seed.CacheName, time.Since(start))
	return nil
}
