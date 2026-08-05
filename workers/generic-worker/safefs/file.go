package safefs

import (
	"io"
	"os"
)

// ReadFile reads path, following no symlink anywhere.
func ReadFile(path string) ([]byte, error) {
	f, err := OpenExistingReadonly(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}

// CopyFile copies src to dst, following no symlink at either end.
func CopyFile(src, dst string, perm os.FileMode) error {
	in, err := OpenExistingReadonly(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := Create(dst, perm)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// WriteFile writes data to path, following no symlink at the leaf or
// anywhere in its prefix.
func WriteFile(path string, data []byte, perm os.FileMode) error {
	f, err := Create(path, perm)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}
