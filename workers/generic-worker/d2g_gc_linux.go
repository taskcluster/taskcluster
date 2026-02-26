//go:build linux

package main

import "os"

// removeD2GCacheFile safely removes the d2g-image-cache.json file
// with mutex protection for concurrent task execution (capacity > 1)
func removeD2GCacheFile() error {
	d2gCacheMutex.Lock()
	defer d2gCacheMutex.Unlock()
	err := os.Remove("d2g-image-cache.json")
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
