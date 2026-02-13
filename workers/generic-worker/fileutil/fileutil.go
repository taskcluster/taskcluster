package fileutil

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/mholt/archiver/v3"
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

	return os.CopyFS(dst, os.DirFS(src))
}

func Unarchive(source, destination, format string) error {
	var unarchiver archiver.Unarchiver
	switch format {
	case "zip":
		unarchiver = &archiver.Zip{}
	case "tar.gz":
		unarchiver = &archiver.TarGz{
			Tar: &archiver.Tar{},
		}
	case "rar":
		unarchiver = &archiver.Rar{}
	case "tar.bz2":
		unarchiver = &archiver.TarBz2{
			Tar: &archiver.Tar{},
		}
	case "tar.xz":
		unarchiver = &archiver.TarXz{
			Tar: &archiver.Tar{},
		}
	case "tar.zst":
		unarchiver = &archiver.TarZstd{
			Tar: &archiver.Tar{},
		}
	case "tar.lz4":
		unarchiver = &archiver.TarLz4{
			Tar: &archiver.Tar{},
		}
	default:
		return fmt.Errorf("unsupported archive format %v", format)
	}
	return unarchiver.Unarchive(source, destination)
}
