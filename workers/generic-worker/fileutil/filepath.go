package fileutil

import (
	"path/filepath"
)

// AbsFrom returns path if an absolute path, otherwise the result of joining it
// to the parent path. This mimics filepath.Abs(path) without restricting
// parent to the current working directory.
func AbsFrom(parent string, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(parent, path)
}
