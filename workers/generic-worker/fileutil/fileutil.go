package fileutil

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
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

// File represents a static file to be written to the host environment
// during worker bootstrap (e.g. from worker pool configuration).
type File struct {
	Description string `json:"description"`
	Path        string `json:"path"`
	Content     string `json:"content"`
	Encoding    string `json:"encoding"`
	Format      string `json:"format"`
}

// Extract writes the file content to the configured path. It supports:
//   - format "zip" with encoding "base64": decodes base64 content and extracts the zip archive
//   - format "file" with encoding "base64": decodes base64 content and writes a single file
//   - no format/encoding: writes plain text content directly
func (f *File) Extract() error {
	switch f.Format {
	case "zip":
		return f.extractZip()
	case "file":
		return f.extractFile()
	case "":
		// Legacy/simple mode: plain text content
		dir := filepath.Dir(f.Path)
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("creating directory %v for file %v: %w", dir, f.Path, err)
		}
		return os.WriteFile(f.Path, []byte(f.Content), 0600)
	default:
		return fmt.Errorf("unknown file format %q", f.Format)
	}
}

func (f *File) decodeContent() ([]byte, error) {
	switch f.Encoding {
	case "base64":
		return base64.StdEncoding.DecodeString(f.Content)
	case "":
		return []byte(f.Content), nil
	default:
		return nil, fmt.Errorf("unsupported encoding %q for file %v", f.Encoding, f.Path)
	}
}

func (f *File) extractFile() error {
	data, err := f.decodeContent()
	if err != nil {
		return err
	}
	log.Printf("Writing %v to path %v", f.Description, f.Path)
	dir := filepath.Dir(f.Path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(f.Path, data, 0777)
}

func (f *File) extractZip() error {
	data, err := f.decodeContent()
	if err != nil {
		return err
	}
	log.Printf("Unzipping %v to path %v", f.Description, f.Path)
	dir := filepath.Dir(f.Path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return unzipBytes(data, f.Path)
}

func unzipBytes(b []byte, dest string) error {
	br := bytes.NewReader(b)
	r, err := zip.NewReader(br, int64(len(b)))
	if err != nil {
		return err
	}

	if err := os.MkdirAll(dest, 0755); err != nil {
		return err
	}

	for _, zf := range r.File {
		// Prevent Zip Slip (CWE-22): use filepath.Rel to verify the
		// extracted path stays within the destination directory.
		destPath := filepath.Join(dest, zf.Name)
		relPath, err := filepath.Rel(dest, destPath)
		if err != nil || strings.HasPrefix(relPath, "..") {
			return fmt.Errorf("illegal file path in zip: %s", zf.Name)
		}

		if zf.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, zf.Mode()); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return err
		}

		rc, err := zf.Open()
		if err != nil {
			return err
		}
		outFile, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, zf.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

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
