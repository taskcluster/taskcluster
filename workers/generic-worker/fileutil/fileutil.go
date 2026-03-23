package fileutil

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/mholt/archives"
	"github.com/taskcluster/slugid-go/slugid"
)

func WriteToFileAsJSON(obj any, filename string) error {
	jsonBytes, err := json.MarshalIndent(obj, "", "  ")
	if err != nil {
		return err
	}
	if !filepath.IsAbs(filename) {
		absPath, err := filepath.Abs(filename)
		if err != nil {
			log.Printf("Saving file %v (unknown absolute path: %v)", filename, err)
		} else {
			log.Printf("Saving file %v (absolute path: %v)", filename, absPath)
		}
	} else {
		log.Printf("Saving file %v", filename)
	}
	tempFilename := filename + "-" + slugid.Nice()
	if err := os.WriteFile(tempFilename, append(jsonBytes, '\n'), 0644); err != nil {
		return fmt.Errorf("failed to write to temp file: %w", err)
	}
	if err := os.Rename(tempFilename, filename); err != nil {
		return fmt.Errorf("failed to rename temp file: %w", err)
	}
	return nil
}

func CalculateSHA256(file string) (hash string, err error) {
	rawContent, err := os.Open(file)
	if err != nil {
		return
	}
	defer rawContent.Close()
	hasher := sha256.New()
	_, err = io.Copy(hasher, rawContent)
	if err != nil {
		panic(err)
	}
	hash = hex.EncodeToString(hasher.Sum(nil))
	return
}

func Copy(dst, src string) (nBytes int64, err error) {
	var sourceFileStat os.FileInfo
	sourceFileStat, err = os.Stat(src)
	if err != nil {
		return
	}
	if !sourceFileStat.Mode().IsRegular() {
		err = fmt.Errorf("cannot copy %s to %s: %s is not a regular file", src, dst, src)
		return
	}
	var source *os.File
	source, err = os.Open(src)
	if err != nil {
		return
	}
	closeFile := func(file *os.File) {
		err2 := file.Close()
		if err == nil {
			err = err2
		}
	}
	defer closeFile(source)
	var destination *os.File
	destination, err = os.Create(dst)
	if err != nil {
		return
	}
	defer closeFile(destination)
	nBytes, err = io.Copy(destination, source)
	return
}

func CopyToTempFile(src string) (tempFilePath string, err error) {
	baseName := filepath.Base(src)
	var tempFile *os.File
	tempFile, err = os.CreateTemp("", baseName)
	if err != nil {
		return
	}
	defer func() {
		err2 := tempFile.Close()
		if err == nil {
			err = err2
		}
	}()
	tempFilePath = tempFile.Name()
	_, err = Copy(tempFilePath, src)
	return
}

func CreateFile(file string) (err error) {
	var f *os.File
	f, err = os.Create(file)
	defer func() {
		closeErr := f.Close()
		if err == nil {
			err = closeErr
		}
	}()
	return
}

func CreateDir(dir string) error {
	return os.MkdirAll(dir, 0700)
}

func CopyDir(src, dst string) error {
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("source is not a directory: %s", src)
	}

	if _, err := os.Stat(dst); err == nil {
		return fmt.Errorf("destination already exists: %s", dst)
	} else if !os.IsNotExist(err) {
		return err
	}

	if err := os.CopyFS(dst, os.DirFS(src)); err != nil {
		return err
	}

	// os.CopyFS creates files owned by the current process. Preserve the
	// source directory's ownership so that CopyDir behaves like a move.
	return preserveOwnership(dst, info)
}

func Unarchive(source, destination, format string) error {
	f, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("opening archive %v: %w", source, err)
	}
	defer f.Close()

	// Identify the archive format using the format string as a filename
	// hint (the actual source files have random slugid names with no
	// extension). Identify also validates the stream content matches.
	detected, stream, err := archives.Identify(context.Background(), "archive."+format, f)
	if err != nil {
		return fmt.Errorf("unsupported or unrecognized archive format %v: %w", format, err)
	}

	extractor, ok := detected.(archives.Extractor)
	if !ok {
		return fmt.Errorf("format %v does not support extraction", format)
	}

	cleanDest := filepath.Clean(destination) + string(os.PathSeparator)

	return extractor.Extract(context.Background(), stream, func(ctx context.Context, info archives.FileInfo) error {
		destPath := filepath.Join(destination, info.NameInArchive)

		// Prevent path traversal (zip-slip)
		if !strings.HasPrefix(destPath, cleanDest) && destPath != filepath.Clean(destination) {
			return fmt.Errorf("illegal file path in archive: %s", info.NameInArchive)
		}

		if info.IsDir() {
			return os.MkdirAll(destPath, info.Mode()|0700)
		}

		if info.LinkTarget != "" {
			if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
				return err
			}
			if info.Mode()&fs.ModeSymlink != 0 {
				// Validate symlink target resolves within destination to prevent path traversal
				resolvedTarget := filepath.Clean(filepath.Join(filepath.Dir(destPath), info.LinkTarget))
				if !strings.HasPrefix(resolvedTarget, cleanDest) && resolvedTarget != filepath.Clean(destination) {
					return fmt.Errorf("illegal symlink target in archive: %s -> %s", info.NameInArchive, info.LinkTarget)
				}
				return os.Symlink(info.LinkTarget, destPath)
			}
			// Hardlink - validate target resolves within destination to prevent path traversal
			hardlinkTarget := filepath.Clean(filepath.Join(destination, info.LinkTarget))
			if !strings.HasPrefix(hardlinkTarget, cleanDest) && hardlinkTarget != filepath.Clean(destination) {
				return fmt.Errorf("illegal hardlink target in archive: %s -> %s", info.NameInArchive, info.LinkTarget)
			}
			return os.Link(hardlinkTarget, destPath)
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return err
		}

		inFile, err := info.Open()
		if err != nil {
			return err
		}
		defer inFile.Close()

		outFile, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		defer outFile.Close()

		_, err = io.Copy(outFile, inFile)
		return err
	})
}
