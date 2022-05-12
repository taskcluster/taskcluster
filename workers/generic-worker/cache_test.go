package main

import "testing"

func TestIssue5363(t *testing.T) {
	cacheMap := &CacheMap{}
	// This cache file has two entries with locations that do not exist on the filesystem, and three that do
	cacheMap.LoadFromFile("testdata/testcaches.json", "fakedir")
	// Make sure two entries were removed
	if len(*cacheMap) != 3 {
		t.Errorf("Was expecting 3 cache entries in testdata/testcaches.json but found %v", len(*cacheMap))
	}
}
