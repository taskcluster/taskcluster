package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/gwconfig"
)

func shaOf(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// fakeFSContent is an FSContent that writes fixed content on download, and
// counts how many times it was downloaded.
type fakeFSContent struct {
	key         string
	dir         string
	content     string
	requiredSHA string
	downloads   int
}

func (f *fakeFSContent) RequiredScopes() []string {
	return []string{}
}

func (f *fakeFSContent) Download(taskMount *TaskMount) (string, string, error) {
	f.downloads++
	file := filepath.Join(f.dir, fmt.Sprintf("download-%d", f.downloads))
	if err := os.WriteFile(file, []byte(f.content), 0600); err != nil {
		return "", "", err
	}
	return file, shaOf(f.content), nil
}

func (f *fakeFSContent) UniqueKey(taskMount *TaskMount) (string, error) {
	return f.key, nil
}

func (f *fakeFSContent) RequiredSHA256() string {
	return f.requiredSHA
}

func (f *fakeFSContent) String() string {
	return "fake content " + f.key
}

func (f *fakeFSContent) TaskDependencies() []string {
	return []string{}
}

func TestIssue5363(t *testing.T) {
	cacheMap := &CacheMap{}
	// This cache file has two entries with locations that do not exist on the filesystem, and three that do
	cacheMap.LoadFromFile("testdata/testcaches.json", "fakedir")
	// Count total entries across all slices
	total := 0
	for _, entries := range *cacheMap {
		total += len(entries)
	}
	if total != 3 {
		t.Errorf("Was expecting 3 cache entries in testdata/testcaches.json but found %v", total)
	}
}

func TestCacheMapPoolStructure(t *testing.T) {
	cm := CacheMap{}
	entry1 := &Cache{Key: "foo", Location: "/tmp/test-pool-1", Created: time.Now()}
	entry2 := &Cache{Key: "foo", Location: "/tmp/test-pool-2", Created: time.Now()}
	cm["foo"] = append(cm["foo"], entry1, entry2)

	if len(cm["foo"]) != 2 {
		t.Errorf("Expected 2 entries for 'foo', got %d", len(cm["foo"]))
	}
}

func TestAcquireCacheReturnsAvailableEntry(t *testing.T) {
	directoryCaches = CacheMap{
		"mycache": {
			{Key: "mycache", Location: "/tmp/test-acquire", InUse: false, LastUsed: time.Now()},
		},
	}
	entry := AcquireCache("mycache")
	if entry == nil {
		t.Fatal("Expected to acquire a cache entry, got nil")
	}
	if !entry.InUse {
		t.Error("Expected acquired entry to be marked InUse")
	}
}

func TestAcquireCacheReturnsNilWhenAllInUse(t *testing.T) {
	directoryCaches = CacheMap{
		"mycache": {
			{Key: "mycache", Location: "/tmp/test-acquire-nil", InUse: true},
		},
	}
	entry := AcquireCache("mycache")
	if entry != nil {
		t.Error("Expected nil when all entries are in use")
	}
}

func TestAcquireCacheReturnsFreshestEntry(t *testing.T) {
	old := time.Now().Add(-1 * time.Hour)
	fresh := time.Now()
	directoryCaches = CacheMap{
		"mycache": {
			{Key: "mycache", Location: "/tmp/old", InUse: false, LastUsed: old},
			{Key: "mycache", Location: "/tmp/fresh", InUse: false, LastUsed: fresh},
		},
	}
	entry := AcquireCache("mycache")
	if entry.Location != "/tmp/fresh" {
		t.Errorf("Expected freshest entry (/tmp/fresh), got %s", entry.Location)
	}
}

func TestAcquireCacheReturnsDifferentEntries(t *testing.T) {
	directoryCaches = CacheMap{
		"shared": {
			{Key: "shared", Location: "/tmp/s1", InUse: false, LastUsed: time.Now().Add(-1 * time.Minute)},
			{Key: "shared", Location: "/tmp/s2", InUse: false, LastUsed: time.Now()},
		},
	}
	first := AcquireCache("shared")
	second := AcquireCache("shared")

	if first == nil || second == nil {
		t.Fatal("Expected both acquires to succeed")
	}
	if first == second {
		t.Error("Expected different entries for concurrent acquires")
	}
	if first.Location == second.Location {
		t.Error("Expected different locations")
	}
}

func TestAcquireCachePoolExhausted(t *testing.T) {
	directoryCaches = CacheMap{
		"build": {
			{Key: "build", Location: "/tmp/p1", InUse: true},
			{Key: "build", Location: "/tmp/p2", InUse: true},
		},
	}
	entry := AcquireCache("build")
	if entry != nil {
		t.Error("Expected nil when all pool entries are in use")
	}
}

func TestAcquireOrCreateCacheReusesAvailable(t *testing.T) {
	existing := &Cache{Key: "mycache", Location: "/tmp/test-acquire-or-create", InUse: false, LastUsed: time.Now()}
	directoryCaches = CacheMap{
		"mycache": {existing},
	}
	entry, created := acquireOrCreateCache("mycache")
	if created {
		t.Error("Expected to reuse an existing pool entry")
	}
	if entry != existing {
		t.Error("Expected the existing pool entry")
	}
	if !entry.InUse {
		t.Error("Expected acquired entry to be marked InUse")
	}
}

func TestAcquireOrCreateCacheCreatesWhenNoneAvailable(t *testing.T) {
	origConfig := config
	config = &gwconfig.Config{CachesDir: t.TempDir()}
	defer func() { config = origConfig }()

	directoryCaches = CacheMap{
		"build": {
			{Key: "build", Location: "/tmp/p1", InUse: true},
		},
	}
	entry, created := acquireOrCreateCache("build")
	if !created {
		t.Error("Expected a new pool entry to be created")
	}
	if entry == nil {
		t.Fatal("Expected a non-nil entry")
	}
	if !entry.InUse {
		t.Error("Expected new entry to be marked InUse")
	}
	if entry.Key != "build" {
		t.Errorf("Expected Key=build, got %s", entry.Key)
	}
	if len(directoryCaches["build"]) != 2 {
		t.Errorf("Expected pool to have 2 entries, got %d", len(directoryCaches["build"]))
	}
}

func TestReleaseCacheMarksAvailable(t *testing.T) {
	entry := &Cache{Key: "mycache", InUse: true}
	directoryCaches = CacheMap{
		"mycache": {entry},
	}
	ReleaseCache(entry)
	if entry.InUse {
		t.Error("Expected entry to no longer be InUse after release")
	}
	if entry.LastUsed.IsZero() {
		t.Error("Expected LastUsed to be set after release")
	}
}

func TestEvictSinglePoolEntry(t *testing.T) {
	cm := CacheMap{}
	e1 := &Cache{Key: "foo", Location: t.TempDir(), Owner: cm}
	e2 := &Cache{Key: "foo", Location: t.TempDir(), Owner: cm}
	cm["foo"] = []*Cache{e1, e2}

	err := e1.Evict(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(cm["foo"]) != 1 {
		t.Errorf("Expected 1 remaining entry, got %d", len(cm["foo"]))
	}
	if cm["foo"][0] != e2 {
		t.Error("Wrong entry remained after eviction")
	}
}

func TestEvictLastEntryRemovesKey(t *testing.T) {
	cm := CacheMap{}
	e := &Cache{Key: "bar", Location: t.TempDir(), Owner: cm}
	cm["bar"] = []*Cache{e}

	err := e.Evict(nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, exists := cm["bar"]; exists {
		t.Error("Expected map key to be deleted when last entry is evicted")
	}
}

func TestSortedResourcesExcludesInUse(t *testing.T) {
	cm := CacheMap{
		"a": {
			{Key: "a", Location: "/tmp/a1", InUse: true, LastUsed: time.Now()},
			{Key: "a", Location: "/tmp/a2", InUse: false, LastUsed: time.Now()},
		},
	}
	resources := cm.SortedResources()
	if len(resources) != 1 {
		t.Errorf("Expected 1 available resource, got %d", len(resources))
	}
}

func TestFileCacheSortedResourcesExcludesInUse(t *testing.T) {
	cm := FileCacheMap{
		"a": {Key: "a", Location: "/tmp/a1", InUse: true, LastUsed: time.Now()},
		"b": {Key: "b", Location: "/tmp/b1", InUse: false, LastUsed: time.Now()},
	}
	resources := cm.SortedResources()
	if len(resources) != 1 {
		t.Errorf("Expected 1 available resource, got %d", len(resources))
	}
}

func TestRetainReleaseFileCache(t *testing.T) {
	entry := &Cache{Key: "f", Location: "/tmp/f"}
	tm := &TaskMount{}
	tm.retainFileCache(entry)
	if !entry.InUse {
		t.Error("Expected retained file cache to be marked InUse")
	}
	tm.releaseFileCache(entry)
	if entry.InUse {
		t.Error("Expected file cache to no longer be InUse after release")
	}
	if entry.LastUsed.IsZero() {
		t.Error("Expected LastUsed to be set after release")
	}
}

func TestRetainReleaseFileCacheShared(t *testing.T) {
	entry := &Cache{Key: "shared", Location: "/tmp/shared"}
	a := &TaskMount{}
	b := &TaskMount{}
	a.retainFileCache(entry)
	b.retainFileCache(entry)
	a.releaseFileCache(entry)
	if !entry.InUse {
		t.Error("Expected file cache to stay InUse while another task holds it")
	}
	b.releaseFileCache(entry)
	if entry.InUse {
		t.Error("Expected file cache to no longer be InUse after release")
	}
}

func TestNewFileCacheEntryIsBornRetained(t *testing.T) {
	cm := FileCacheMap{}
	tm := &TaskMount{task: &TaskRun{}}

	entry := tm.newFileCache(cm, "mykey", "/tmp/downloaded", "abc123")

	if cm["mykey"] != entry {
		t.Fatal("Expected new file cache to be registered in the map")
	}
	if entry.UseCount != 1 || !entry.InUse {
		t.Errorf("Expected new file cache to be born retained, got UseCount=%d InUse=%v", entry.UseCount, entry.InUse)
	}
	if len(cm.SortedResources()) != 0 {
		t.Error("Expected newly downloaded file cache to be ineligible for garbage collection")
	}
	tm.releaseFileCache(entry)
	if entry.InUse {
		t.Error("Expected the downloading task to own the reference, so releasing it frees the entry")
	}
}

func TestReleaseFileCacheIgnoresEntryNotHeldByTask(t *testing.T) {
	entry := &Cache{Key: "shared", Location: "/tmp/shared"}
	holder := &TaskMount{}
	other := &TaskMount{}
	holder.retainFileCache(entry)
	other.releaseFileCache(entry)

	if entry.UseCount != 1 {
		t.Errorf("Expected UseCount to remain 1 after release by a task that never retained the entry, got %d", entry.UseCount)
	}
	if !entry.InUse {
		t.Error("Expected file cache to stay InUse while the holding task still holds it")
	}
}

func TestPurgeOfInUseFileCacheIsDeferredUntilLastRelease(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "stale")
	if err := os.WriteFile(file, []byte("stale"), 0600); err != nil {
		t.Fatal(err)
	}
	cm := FileCacheMap{}
	entry := &Cache{Key: "f", Location: file, Owner: cm}
	cm["f"] = entry
	holder := &TaskMount{task: &TaskRun{}}
	holder.retainFileCache(entry)

	if err := entry.Purge(holder); err != nil {
		t.Fatal(err)
	}
	if _, exists := cm["f"]; exists {
		t.Error("Expected purged entry to leave the map immediately, so it is never served again")
	}
	if _, err := os.Stat(file); err != nil {
		t.Fatalf("Expected deletion to be deferred while a task is still using the file: %v", err)
	}

	holder.releaseFileCache(entry)

	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Errorf("Expected purged content to be deleted once the last task released it, stat gave: %v", err)
	}
}

func TestReleaseFileCacheUnlinksTheContentItDeletes(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "stale")
	if err := os.WriteFile(file, []byte("stale"), 0600); err != nil {
		t.Fatal(err)
	}
	cm := FileCacheMap{}
	entry := &Cache{Key: "f", Location: file, Owner: cm}
	cm["f"] = entry
	holder := &TaskMount{task: &TaskRun{}}
	holder.retainFileCache(entry)
	// NeedsPurge on an entry that is still in its map is how purgeCaches
	// marks directory caches. Deleting the content of such an entry without
	// unlinking it would leave the map pointing at a file that is gone, and
	// the next ensureCached panics on its missing-file sanity check.
	entry.NeedsPurge = true

	holder.releaseFileCache(entry)

	if _, exists := cm["f"]; exists {
		t.Error("Expected the entry to leave the map along with the content it points at")
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Errorf("Expected the content to be deleted once the last task released it, stat gave: %v", err)
	}
}

func TestSharedFileCacheIsNotRetainedOnceReplaced(t *testing.T) {
	cacheMutex.Lock()
	origCaches := fileCaches
	fileCaches = FileCacheMap{}
	cacheMutex.Unlock()
	defer func() {
		cacheMutex.Lock()
		fileCaches = origCaches
		cacheMutex.Unlock()
	}()

	const key = "fake://shared"
	// shared is what another task's in-flight download produced, but it has
	// since been purged and replaced, so its content may already be deleted.
	shared := &Cache{Key: key, Location: "/tmp/shared", Owner: fileCaches}
	replacement := &Cache{Key: key, Location: "/tmp/replacement", Owner: fileCaches}
	cacheMutex.Lock()
	defer cacheMutex.Unlock()
	fileCaches[key] = replacement

	tm := &TaskMount{task: &TaskRun{}}
	if tm.retainSharedFileCache(key, shared) {
		t.Error("Expected a task not to retain an entry that is no longer the live one for its key")
	}
	if shared.UseCount != 0 || shared.InUse {
		t.Errorf("Expected the replaced entry to be untouched, got UseCount=%d InUse=%v", shared.UseCount, shared.InUse)
	}
	if !tm.retainSharedFileCache(key, replacement) {
		t.Fatal("Expected a task to retain the entry that is still the live one")
	}
	if replacement.UseCount != 1 || !replacement.InUse {
		t.Errorf("Expected the live entry to be retained, got UseCount=%d InUse=%v", replacement.UseCount, replacement.InUse)
	}
}

func TestEvictSkipsInUseFileCache(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "cached")
	if err := os.WriteFile(file, []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}
	cm := FileCacheMap{}
	entry := &Cache{Key: "f", Location: file, Owner: cm}
	cm["f"] = entry
	tm := &TaskMount{}
	tm.retainFileCache(entry)

	if err := entry.Evict(nil); err != nil {
		t.Fatal(err)
	}
	if _, exists := cm["f"]; !exists {
		t.Error("Expected in-use file cache to remain in the map")
	}
}

func TestFileCacheLoadFromFileResetsInUse(t *testing.T) {
	dir := t.TempDir()
	cacheFile := filepath.Join(dir, "cached")
	if err := os.WriteFile(cacheFile, []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}

	data := fmt.Sprintf(`{"test":{"key":"test","location":%q,"in_use":true,"created":"2026-01-01T00:00:00Z"}}`, cacheFile)
	stateFile := filepath.Join(dir, "file-caches.json")
	if err := os.WriteFile(stateFile, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}

	cm := &FileCacheMap{}
	cm.LoadFromFile(stateFile, dir)

	entry := (*cm)["test"]
	if entry == nil {
		t.Fatal("Expected file cache entry to be loaded")
	}
	if entry.InUse {
		t.Error("Expected InUse to be reset to false on load")
	}
}

func TestEnsureCachedRetainsFileCache(t *testing.T) {
	cacheMutex.Lock()
	origCaches := fileCaches
	fileCaches = FileCacheMap{}
	cacheMutex.Unlock()
	defer func() {
		cacheMutex.Lock()
		fileCaches = origCaches
		cacheMutex.Unlock()
	}()

	location := filepath.Join(t.TempDir(), "cached-file")
	if err := os.WriteFile(location, []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}

	key := "Raw content: hello"
	cacheMutex.Lock()
	entry := &Cache{Key: key, Location: location, Owner: fileCaches}
	fileCaches[key] = entry
	cacheMutex.Unlock()

	tm := &TaskMount{task: &TaskRun{}}
	if _, _, err := ensureCached(&RawContent{Raw: "hello"}, tm); err != nil {
		t.Fatal(err)
	}
	if !entry.InUse {
		t.Error("Expected ensureCached to mark the file cache InUse")
	}
	cacheMutex.Lock()
	tm.releaseFileCache(entry)
	cacheMutex.Unlock()
}

func TestEnsureCachedReplacesStaleEntryHeldByAnotherTask(t *testing.T) {
	cacheMutex.Lock()
	origCaches := fileCaches
	fileCaches = FileCacheMap{}
	cacheMutex.Unlock()
	defer func() {
		cacheMutex.Lock()
		fileCaches = origCaches
		cacheMutex.Unlock()
	}()

	dir := t.TempDir()
	staleFile := filepath.Join(dir, "stale")
	if err := os.WriteFile(staleFile, []byte("stale"), 0600); err != nil {
		t.Fatal(err)
	}

	const key = "fake://content"
	cacheMutex.Lock()
	stale := &Cache{Key: key, Location: staleFile, Owner: fileCaches, SHA256: shaOf("stale")}
	fileCaches[key] = stale
	holder := &TaskMount{task: &TaskRun{}}
	holder.retainFileCache(stale)
	cacheMutex.Unlock()

	content := &fakeFSContent{key: key, dir: dir, content: "fresh", requiredSHA: shaOf("fresh")}
	tm := &TaskMount{task: &TaskRun{}}
	file, sha, err := ensureCached(content, tm)
	if err != nil {
		t.Fatalf("Expected ensureCached to re-download after SHA256 mismatch, got error: %v", err)
	}
	if sha != shaOf("fresh") {
		t.Errorf("Expected SHA256 of freshly downloaded content, got %v", sha)
	}
	if data, readErr := os.ReadFile(file); readErr != nil || string(data) != "fresh" {
		t.Errorf("Expected ensureCached to return the fresh content, got %q (err %v)", data, readErr)
	}
	if _, statErr := os.Stat(staleFile); statErr != nil {
		t.Errorf("Expected the stale file to survive while another task is still using it: %v", statErr)
	}

	cacheMutex.Lock()
	holder.releaseFileCache(stale)
	cacheMutex.Unlock()
	if _, statErr := os.Stat(staleFile); !os.IsNotExist(statErr) {
		t.Errorf("Expected the stale file to be deleted once the last task released it, stat gave: %v", statErr)
	}
}

func TestRatingUsesLastUsed(t *testing.T) {
	old := &Cache{LastUsed: time.Now().Add(-1 * time.Hour)}
	fresh := &Cache{LastUsed: time.Now()}
	if old.Rating() >= fresh.Rating() {
		t.Error("Fresher cache should have higher rating")
	}
}

func TestLoadFromFileResetsInUse(t *testing.T) {
	dir := t.TempDir()
	cacheDir := filepath.Join(dir, "cache1")
	if err := os.MkdirAll(cacheDir, 0700); err != nil {
		t.Fatal(err)
	}

	data := fmt.Sprintf(`{"test":[{"key":"test","location":%q,"in_use":true,"created":"2026-01-01T00:00:00Z"}]}`, cacheDir)
	stateFile := filepath.Join(dir, "test-caches.json")
	if err := os.WriteFile(stateFile, []byte(data), 0600); err != nil {
		t.Fatal(err)
	}

	cm := &CacheMap{}
	cm.LoadFromFile(stateFile, dir)

	entries := (*cm)["test"]
	if len(entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(entries))
	}
	if entries[0].InUse {
		t.Error("Expected InUse to be reset to false on load")
	}
}

func TestTrimPoolExcess(t *testing.T) {
	origConfig := config
	config = &gwconfig.Config{}
	config.Capacity = 2
	defer func() { config = origConfig }()

	directoryCaches = CacheMap{
		"build": {
			{Key: "build", Location: t.TempDir(), InUse: false, LastUsed: time.Now().Add(-3 * time.Hour), Owner: directoryCaches},
			{Key: "build", Location: t.TempDir(), InUse: false, LastUsed: time.Now().Add(-2 * time.Hour), Owner: directoryCaches},
			{Key: "build", Location: t.TempDir(), InUse: false, LastUsed: time.Now().Add(-1 * time.Hour), Owner: directoryCaches},
			{Key: "build", Location: t.TempDir(), InUse: true, Owner: directoryCaches}, // in-use, should not be counted or trimmed
		},
	}
	// Fix Owner references after map creation
	for _, entries := range directoryCaches {
		for _, e := range entries {
			e.Owner = directoryCaches
		}
	}

	trimPoolExcess()
	remaining := directoryCaches["build"]
	// Should have 2 available + 1 in-use = 3 total (trimmed the oldest available)
	if len(remaining) != 3 {
		t.Errorf("Expected 3 entries after trim, got %d", len(remaining))
	}
	// Verify in-use entry survived
	inUseCount := 0
	for _, e := range remaining {
		if e.InUse {
			inUseCount++
		}
	}
	if inUseCount != 1 {
		t.Errorf("Expected 1 in-use entry, got %d", inUseCount)
	}
}

func TestSweepUnknownContentDeletesOrphansAndKeepsKnown(t *testing.T) {
	cachesDir := t.TempDir()
	known := filepath.Join(cachesDir, "known")
	orphan := filepath.Join(cachesDir, "orphan")
	for _, dir := range []string{known, orphan} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}

	cm := CacheMap{
		"foo": {{Key: "foo", Location: known}},
	}
	sweepUnknownContent(cachesDir, cm)

	if _, err := os.Stat(known); err != nil {
		t.Errorf("Expected known cache %v to be kept: %v", known, err)
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Errorf("Expected orphan %v to be deleted, stat gave: %v", orphan, err)
	}
}

func TestSweepUnknownContentRetriesFailedDeletion(t *testing.T) {
	if os.Geteuid() <= 0 {
		t.Skip("requires a non-root POSIX user, since os.RemoveAll ignores directory permissions otherwise")
	}
	cachesDir := t.TempDir()
	orphan := filepath.Join(cachesDir, "orphan")
	if err := os.Mkdir(orphan, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(cachesDir, 0500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(cachesDir, 0700) })

	sweepUnknownContent(cachesDir, CacheMap{})
	if _, err := os.Stat(orphan); err != nil {
		t.Fatalf("Expected the orphan to remain while deletion is blocked, stat gave: %v", err)
	}

	if err := os.Chmod(cachesDir, 0700); err != nil {
		t.Fatal(err)
	}
	sweepUnknownContent(cachesDir, CacheMap{})
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Errorf("Expected the orphan to be deleted once the parent was writable, stat gave: %v", err)
	}
}

func TestFailedCacheEvictionIsReclaimedBySweep(t *testing.T) {
	if os.Geteuid() <= 0 {
		t.Skip("requires a non-root POSIX user, since os.RemoveAll ignores directory permissions otherwise")
	}
	cachesDir := t.TempDir()
	location := filepath.Join(cachesDir, "cache")
	if err := os.Mkdir(location, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(cachesDir, 0500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(cachesDir, 0700) })

	cm := CacheMap{}
	entry := &Cache{Key: "foo", Location: location, Owner: cm}
	cm["foo"] = []*Cache{entry}

	if err := entry.Evict(nil); err == nil {
		t.Fatal("Expected eviction to fail")
	}
	if len(cm["foo"]) != 0 {
		t.Error("Expected the entry to leave the cache table regardless, as callers rely on")
	}
	if _, err := os.Stat(location); err != nil {
		t.Fatalf("Expected files to remain after the failed deletion, stat gave: %v", err)
	}

	if err := os.Chmod(cachesDir, 0700); err != nil {
		t.Fatal(err)
	}
	sweepUnknownContent(cachesDir, cm)
	if _, err := os.Stat(location); !os.IsNotExist(err) {
		t.Errorf("Expected the leftover to be deleted by the sweep, stat gave: %v", err)
	}
}

func TestGarbageCollectionSweepsCachesDir(t *testing.T) {
	origConfig := config
	origDirectoryCaches := directoryCaches
	origFileCaches := fileCaches
	t.Cleanup(func() {
		config = origConfig
		directoryCaches = origDirectoryCaches
		fileCaches = origFileCaches
	})

	cachesDir := t.TempDir()
	known := filepath.Join(cachesDir, "known")
	orphan := filepath.Join(cachesDir, "orphan")
	for _, dir := range []string{known, orphan} {
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}

	config = &gwconfig.Config{
		CachesDir:                  cachesDir,
		Capacity:                   1,
		TasksDir:                   t.TempDir(),
		RequiredDiskSpaceMegabytes: 1,
	}
	directoryCaches = CacheMap{
		"foo": {{Key: "foo", Location: known}},
	}
	fileCaches = FileCacheMap{}

	if err := garbageCollection(false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(known); err != nil {
		t.Errorf("Expected known cache %v to be kept: %v", known, err)
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Errorf("Expected garbage collection to delete orphan %v, stat gave: %v", orphan, err)
	}
}

func TestMountsInitialiseSweepsOrphanedCaches(t *testing.T) {
	origConfig := config
	origDirectoryCaches := directoryCaches
	origFileCaches := fileCaches
	t.Cleanup(func() {
		config = origConfig
		directoryCaches = origDirectoryCaches
		fileCaches = origFileCaches
	})

	root := t.TempDir()
	t.Chdir(root)
	cachesDir := filepath.Join(root, "caches")
	known := filepath.Join(cachesDir, "known")
	orphan := filepath.Join(cachesDir, "orphan")
	for _, dir := range []string{known, orphan} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}

	config = &gwconfig.Config{
		CachesDir:    cachesDir,
		DownloadsDir: filepath.Join(root, "downloads"),
	}
	directoryCaches = nil
	fileCaches = nil

	state := fmt.Sprintf(`{"foo":[{"key":"foo","location":%q,"created":"2026-01-01T00:00:00Z"}]}`, known)
	if err := os.WriteFile("directory-caches.json", []byte(state), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("file-caches.json", []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}

	if err := (&MountsFeature{}).Initialise(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(known); err != nil {
		t.Errorf("Expected known cache %v to be kept: %v", known, err)
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Errorf("Expected Initialise to delete orphan %v, stat gave: %v", orphan, err)
	}
}
