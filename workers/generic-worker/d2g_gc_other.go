//go:build !linux

package main

func removeD2GCacheFile() error {
	return nil
}
