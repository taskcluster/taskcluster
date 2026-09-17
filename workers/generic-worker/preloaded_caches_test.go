package main

import (
	"bytes"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/gwconfig"
)

func setupPreloadedCache(t *testing.T) string {
	t.Helper()
	origConfig, origDirectories, origFiles := config, directoryCaches, fileCaches
	t.Cleanup(func() { config, directoryCaches, fileCaches = origConfig, origDirectories, origFiles })
	root := t.TempDir()
	t.Chdir(root)
	seed := filepath.Join(root, "seed")
	writeSeedFile(t, filepath.Join(seed, "src", "checkout"), "ready")
	config = &gwconfig.Config{
		CachesDir: filepath.Join(root, "caches"), DownloadsDir: filepath.Join(root, "downloads"),
		TasksDir: filepath.Join(root, "tasks"), Capacity: 2,
		PreloadedDirectoryCaches: []gwconfig.PreloadedDirectoryCache{{CacheName: "checkout", Location: seed}},
	}
	directoryCaches, fileCaches = nil, nil
	return seed
}

func writeSeedFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(contents), 0700); err != nil {
		t.Fatal(err)
	}
}

func initialisePreloadedCaches(t *testing.T) {
	t.Helper()
	if err := (&MountsFeature{}).Initialise(); err != nil {
		t.Fatal(err)
	}
}

func TestPreloadedCacheRestartAndAcquisition(t *testing.T) {
	seed := setupPreloadedCache(t)
	initialisePreloadedCaches(t)
	entries := directoryCaches["checkout"]
	if len(entries) != 1 {
		t.Fatalf("expected one cache, got %d", len(entries))
	}
	entry := entries[0]
	if filepath.Dir(entry.Location) != config.CachesDir {
		t.Fatalf("wrong cache volume: %s", entry.Location)
	}
	contents, err := os.ReadFile(filepath.Join(entry.Location, "src", "checkout"))
	if err != nil || string(contents) != "ready" {
		t.Fatalf("import: %q, %v", contents, err)
	}
	if _, err := os.Stat(seed); !os.IsNotExist(err) {
		t.Fatalf("seed not consumed: %v", err)
	}
	writeSeedFile(t, filepath.Join(entry.Location, "src", "checkout"), "updated by task")
	initialisePreloadedCaches(t)
	if len(directoryCaches["checkout"]) != 1 || directoryCaches["checkout"][0].Location != entry.Location {
		t.Fatal("restart lost or duplicated the cache")
	}
	contents, err = os.ReadFile(filepath.Join(entry.Location, "src", "checkout"))
	if err != nil || string(contents) != "updated by task" {
		t.Fatalf("lost task update: %q, %v", contents, err)
	}
	first := AcquireCache("checkout")
	if first == nil || AcquireCache("checkout") != nil {
		t.Fatal("cache shared by concurrent tasks")
	}
	ReleaseCache(first)
	if AcquireCache("checkout") != first {
		t.Fatal("returned cache cannot be reused")
	}
}

func TestPreloadedCacheKeepsExistingAndFinishesCleanup(t *testing.T) {
	seed := setupPreloadedCache(t)
	initialisePreloadedCaches(t)
	location := directoryCaches["checkout"][0].Location
	// Simulate interruption after state persistence but before source removal.
	writeSeedFile(t, filepath.Join(seed, "src", "checkout"), "stale seed")
	initialisePreloadedCaches(t)
	if len(directoryCaches["checkout"]) != 1 || directoryCaches["checkout"][0].Location != location {
		t.Fatal("existing cache replaced")
	}
	if _, err := os.Stat(seed); !os.IsNotExist(err) {
		t.Fatalf("seed cleanup not completed: %v", err)
	}
}

func TestPreloadedCacheRecoversUnregisteredCopy(t *testing.T) {
	setupPreloadedCache(t)
	partial := filepath.Join(config.CachesDir, "interrupted-import")
	writeSeedFile(t, filepath.Join(partial, "partial"), "incomplete")
	initialisePreloadedCaches(t)
	if _, err := os.Stat(partial); !os.IsNotExist(err) {
		t.Fatalf("partial copy not swept: %v", err)
	}
	if len(directoryCaches["checkout"]) != 1 {
		t.Fatal("seed was not retried")
	}
}

func TestPreloadedCacheMissingInvalidAndLinks(t *testing.T) {
	for _, kind := range []string{"missing", "file", "root-link", "nested-link", "escaping-link"} {
		t.Run(kind, func(t *testing.T) {
			seed := setupPreloadedCache(t)
			if kind != "nested-link" && kind != "escaping-link" {
				if err := os.RemoveAll(seed); err != nil {
					t.Fatal(err)
				}
			}
			switch kind {
			case "file":
				writeSeedFile(t, seed, "not a directory")
			case "root-link", "nested-link", "escaping-link":
				target := filepath.Join(filepath.Dir(seed), "external")
				writeSeedFile(t, filepath.Join(target, "private"), "must not import")
				link := seed
				if kind != "root-link" {
					link = filepath.Join(seed, "external")
				}
				if kind == "escaping-link" {
					target = filepath.Join("..", "external")
				}
				if err := os.Symlink(target, link); err != nil {
					t.Skipf("symlink unavailable: %v", err)
				}
			}
			initialisePreloadedCaches(t)
			if len(directoryCaches) != 0 {
				t.Fatal("invalid seed registered")
			}
		})
	}
}

func TestPreloadedCacheInternalLinks(t *testing.T) {
	for _, kind := range []string{"file", "directory"} {
		t.Run(kind, func(t *testing.T) {
			seed := setupPreloadedCache(t)
			target := filepath.Join("src", "checkout")
			if kind == "directory" {
				target = "src"
			}
			// The link sorts before its target, exposing the Windows CopyFS bug.
			if err := os.Symlink(target, filepath.Join(seed, "a-link")); err != nil {
				t.Skipf("symlink unavailable: %v", err)
			}
			initialisePreloadedCaches(t)
			entries := directoryCaches["checkout"]
			if runtime.GOOS == "windows" {
				if len(entries) != 0 {
					t.Fatal("Windows seed link accepted")
				}
				if _, err := os.Stat(filepath.Join(seed, "src", "checkout")); err != nil {
					t.Fatalf("rejected seed damaged: %v", err)
				}
				if _, err := os.Stat(preloadedCacheStateFile); !os.IsNotExist(err) {
					t.Fatalf("rejected seed marked consumed: %v", err)
				}
				return
			}
			if len(entries) != 1 {
				t.Fatal("POSIX seed with internal link was not imported")
			}
			link := filepath.Join(entries[0].Location, "a-link")
			if _, err := os.Readlink(link); err != nil {
				t.Fatalf("link was not preserved: %v", err)
			}
			if kind == "directory" {
				link = filepath.Join(link, "checkout")
			}
			contents, err := os.ReadFile(link)
			if err != nil || string(contents) != "ready" {
				t.Fatalf("link no longer resolves after import: %q, %v", contents, err)
			}
		})
	}
}

func TestPreloadedCachePersistenceFailureKeepsSeed(t *testing.T) {
	seed := setupPreloadedCache(t)
	directoryCaches = CacheMap{}
	if err := os.MkdirAll(config.CachesDir, 0700); err != nil {
		t.Fatal(err)
	}
	// A directory at the state filename makes the atomic rename fail.
	if err := os.Mkdir("directory-caches.json", 0700); err != nil {
		t.Fatal(err)
	}
	if err := importPreloadedDirectoryCache(config.PreloadedDirectoryCaches[0]); err == nil {
		t.Fatal("expected persistence failure")
	}
	if len(directoryCaches) != 0 {
		t.Fatal("failed import registered")
	}
	if _, err := os.Stat(filepath.Join(seed, "src", "checkout")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(config.CachesDir)
	if err != nil || len(entries) != 0 {
		t.Fatalf("failed copy retained: %v, %v", entries, err)
	}
}

func TestPreloadedCachePurgeDoesNotRecreateSeed(t *testing.T) {
	setupPreloadedCache(t)
	initialisePreloadedCaches(t)
	if err := directoryCaches["checkout"][0].Purge(nil); err != nil {
		t.Fatal(err)
	}
	if err := fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json"); err != nil {
		t.Fatal(err)
	}
	initialisePreloadedCaches(t)
	if len(directoryCaches) != 0 {
		t.Fatal("purged cache recreated")
	}
}

func TestPreloadedCacheNamesAreIndependent(t *testing.T) {
	seed := setupPreloadedCache(t)
	second := filepath.Join(filepath.Dir(seed), "second")
	writeSeedFile(t, filepath.Join(second, "src", "checkout"), "second")
	config.PreloadedDirectoryCaches = append(config.PreloadedDirectoryCaches, gwconfig.PreloadedDirectoryCache{CacheName: "other-level", Location: second})
	initialisePreloadedCaches(t)
	firstEntry, secondEntry := AcquireCache("checkout"), AcquireCache("other-level")
	if firstEntry == nil || secondEntry == nil || firstEntry.Location == secondEntry.Location {
		t.Fatal("cache names share writable data")
	}
}

// Point this at a writable directory on a second filesystem to exercise a real
// cross-device import. The normal tests still exercise the same copy path.
func TestPreloadedCacheAcrossFilesystems(t *testing.T) {
	secondFilesystem := os.Getenv("PRELOADED_CACHE_TEST_SOURCE_ROOT")
	if secondFilesystem == "" {
		t.Skip("PRELOADED_CACHE_TEST_SOURCE_ROOT is not set")
	}
	setupPreloadedCache(t)
	seed, err := os.MkdirTemp(secondFilesystem, "preloaded-cache-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(seed) })
	writeSeedFile(t, filepath.Join(seed, "executable"), "complete")
	config.PreloadedDirectoryCaches[0].Location = seed
	initialisePreloadedCaches(t)
	entries := directoryCaches["checkout"]
	if len(entries) != 1 {
		t.Fatal("cross-filesystem import failed")
	}
	content, err := os.ReadFile(filepath.Join(entries[0].Location, "executable"))
	if err != nil || string(content) != "complete" {
		t.Fatalf("incomplete cross-filesystem import: %q, %v", content, err)
	}
	if _, err := os.Stat(seed); !os.IsNotExist(err) {
		t.Fatalf("cross-filesystem seed was not consumed: %v", err)
	}
}

func TestPreloadedCachePartialCleanupThenPurge(t *testing.T) {
	seed := setupPreloadedCache(t)
	initialisePreloadedCaches(t)
	// Represent a crash during deletion: only some source files remain. The
	// consumption state from the completed import must outlive cache eviction.
	writeSeedFile(t, filepath.Join(seed, "leftover"), "incomplete seed")
	if err := directoryCaches["checkout"][0].Purge(nil); err != nil {
		t.Fatal(err)
	}
	if err := fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json"); err != nil {
		t.Fatal(err)
	}
	initialisePreloadedCaches(t)
	if len(directoryCaches) != 0 {
		t.Fatal("partially deleted seed imported after purge")
	}
	if _, err := os.Stat(seed); !os.IsNotExist(err) {
		t.Fatalf("remaining seed was not cleaned up: %v", err)
	}
}

func TestPreloadedCacheUnusableSeedDoesNotStopStartup(t *testing.T) {
	seed := setupPreloadedCache(t)
	blocker := filepath.Join(filepath.Dir(seed), "blocker")
	writeSeedFile(t, blocker, "not a directory")
	config.PreloadedDirectoryCaches[0].Location = filepath.Join(blocker, "seed")
	initialisePreloadedCaches(t)
	if len(directoryCaches) != 0 {
		t.Fatal("unusable seed was registered")
	}
}

func TestPreloadedCacheUnreadableConsumptionStateKeepsSeed(t *testing.T) {
	seed := setupPreloadedCache(t)
	if err := os.Mkdir(preloadedCacheStateFile, 0700); err != nil {
		t.Fatal(err)
	}
	initialisePreloadedCaches(t)
	if len(directoryCaches) != 0 {
		t.Fatal("cache registered without consumption state")
	}
	if _, err := os.Stat(filepath.Join(seed, "src", "checkout")); err != nil {
		t.Fatal(err)
	}
}

func TestPreloadedCacheConsumptionBeforeRegistrationUsesColdCache(t *testing.T) {
	seed := setupPreloadedCache(t)
	directoryCaches = CacheMap{}
	if err := os.MkdirAll(config.CachesDir, 0700); err != nil {
		t.Fatal(err)
	}
	// Let consumption persist but fail the cache-state write.
	if err := os.Mkdir("directory-caches.json", 0700); err != nil {
		t.Fatal(err)
	}
	if err := importPreloadedDirectoryCache(config.PreloadedDirectoryCaches[0]); err == nil {
		t.Fatal("expected cache-state failure")
	}
	if err := os.Remove("directory-caches.json"); err != nil {
		t.Fatal(err)
	}
	initialisePreloadedCaches(t)
	if len(directoryCaches) != 0 {
		t.Fatal("consumed seed replayed after failed registration")
	}
	if _, err := os.Stat(seed); !os.IsNotExist(err) {
		t.Fatalf("consumed seed cleanup incomplete: %v", err)
	}
}

func TestPreloadedCachePreservesModificationTimes(t *testing.T) {
	seed := setupPreloadedCache(t)
	old := time.Unix(1700000000, 0)
	newer := old.Add(time.Hour)
	for name, stamp := range map[string]time.Time{"foo.c": newer, "foo.o": old} {
		path := filepath.Join(seed, name)
		writeSeedFile(t, path, name)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	initialisePreloadedCaches(t)
	for name, want := range map[string]time.Time{"foo.c": newer, "foo.o": old} {
		info, err := os.Stat(filepath.Join(directoryCaches["checkout"][0].Location, name))
		if err != nil {
			t.Fatal(err)
		}
		if !info.ModTime().Equal(want) {
			t.Fatalf("%s: got %v, want %v", name, info.ModTime(), want)
		}
	}
}

func TestPreloadedCacheConsumedMissingSeedIsQuiet(t *testing.T) {
	setupPreloadedCache(t)
	initialisePreloadedCaches(t)
	// Consumption must also suppress the warning after the cache is evicted.
	directoryCaches = CacheMap{}
	if err := fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json"); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	old := log.Writer()
	log.SetOutput(&output)
	defer log.SetOutput(old)
	initialisePreloadedCaches(t)
	if strings.Contains(output.String(), "Could not import preloaded") {
		t.Fatal(output.String())
	}
}
