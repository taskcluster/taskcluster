//go:build !linux

package util

// DisableOOM Does nothing outside Linux
func DisableOOM(int) error {
	return nil
}
