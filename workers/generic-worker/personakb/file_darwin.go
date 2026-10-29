package personakb

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
)

var (
	// maxFileSize is the largest persona database PruneFile reads.
	maxFileSize int64 = 16 << 20

	// beforeRename is called by PruneFile immediately before it re-reads the
	// original file and renames the pruned file over it.
	beforeRename func()

	rename = os.Rename

	pruneFileMutex sync.Mutex
)

// PruneFile prunes the persona database at path in place (see Prune), if it
// exists and has at least minRecords records. It returns the number of
// records removed. It first removes temporary files left in the directory of
// path by earlier calls that did not complete.
func PruneFile(path string, live map[string]bool, minRecords int) (removed int, err error) {
	pruneFileMutex.Lock()
	defer pruneFileMutex.Unlock()

	dir := filepath.Dir(path)
	tmpPrefix := "." + filepath.Base(path) + "."
	if err := removeStaleTempFiles(dir, tmpPrefix); err != nil {
		return 0, err
	}
	fi, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if !fi.Mode().IsRegular() {
		return 0, fmt.Errorf("%v is not a regular file", path)
	}
	data, err := readFile(path)
	if err != nil {
		return 0, err
	}
	pruned, removed, err := prune(data, live, minRecords)
	if err != nil || removed == 0 {
		return 0, err
	}

	tmp, err := os.CreateTemp(dir, tmpPrefix+"*")
	if err != nil {
		return 0, err
	}
	tmpName := tmp.Name()
	renamed := false
	defer func() {
		if !renamed {
			_ = tmp.Close()
			_ = os.Remove(tmpName)
		}
	}()
	if _, err := tmp.Write(pruned); err != nil {
		return 0, err
	}
	if err := copyOwner(tmp, fi); err != nil {
		return 0, err
	}
	if err := tmp.Chmod(fi.Mode().Perm()); err != nil {
		return 0, err
	}
	if err := tmp.Sync(); err != nil {
		return 0, err
	}
	if err := tmp.Close(); err != nil {
		return 0, err
	}

	if beforeRename != nil {
		beforeRename()
	}
	current, err := readFile(path)
	if err != nil {
		return 0, err
	}
	if !bytes.Equal(current, data) {
		return 0, fmt.Errorf("%v changed while being pruned", path)
	}
	if err := rename(tmpName, path); err != nil {
		return 0, err
	}
	renamed = true
	if err := syncDir(dir); err != nil {
		return removed, err
	}
	return removed, nil
}

func readFile(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxFileSize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxFileSize {
		return nil, fmt.Errorf("%v is larger than %v bytes", path, maxFileSize)
	}
	return data, nil
}

// removeStaleTempFiles removes regular files in dir named prefix followed by
// the decimal suffix that os.CreateTemp generates.
func removeStaleTempFiles(dir, prefix string) error {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, e := range entries {
		suffix, ok := strings.CutPrefix(e.Name(), prefix)
		if !ok || suffix == "" || strings.Trim(suffix, "0123456789") != "" || !e.Type().IsRegular() {
			continue
		}
		if err := os.Remove(filepath.Join(dir, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyOwner(f *os.File, fi os.FileInfo) error {
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("cannot determine owner of %v", fi.Name())
	}
	return f.Chown(int(st.Uid), int(st.Gid))
}

func syncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}
