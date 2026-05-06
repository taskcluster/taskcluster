package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster/v100/workers/generic-worker/gwconfig"
)

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
