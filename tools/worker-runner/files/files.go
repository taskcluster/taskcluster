package files

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
)

func ExtractAll(files []File) error {
	for _, f := range files {
		err := f.extract()
		if err != nil {
			return fmt.Errorf("Error extracting file %v: %v", f.Path, err)
		}
	}
	return nil
}

// originally copied from
// https://github.com/taskcluster/generic-worker/blob/01b581bfac21167dbd90a88ac0f81fd952cc0a64/aws.go

type File struct {
	Description string `json:"description"`
	Path        string `json:"path"`
	Content     string `json:"content"`
	Encoding    string `json:"encoding"`
	Format      string `json:"format"`
}

func (f File) extract() error {
	switch f.Format {
	case "file":
		return f.extractFile()
	case "zip":
		return f.extractZip()
	default:
		return errors.New("Unknown file format " + f.Format + " in worker files")
	}
}

func (f File) extractFile() error {
	switch f.Encoding {
	case "base64":
		data, err := base64.StdEncoding.DecodeString(f.Content)
		if err != nil {
			return err
		}
		log.Printf("Writing %v to path %v", f.Description, f.Path)
		dir := filepath.Dir(f.Path)
		err = os.MkdirAll(dir, 0755)
		if err != nil {
			return err
		}
		return os.WriteFile(f.Path, data, 0777)
	default:
		return errors.New("Unsupported encoding " + f.Encoding + " for worker file")
	}
}

func (f File) extractZip() error {
	switch f.Encoding {
	case "base64":
		data, err := base64.StdEncoding.DecodeString(f.Content)
		if err != nil {
			return err
		}
		log.Printf("Unzipping %v to path %v", f.Description, f.Path)
		dir := filepath.Dir(f.Path)
		err = os.MkdirAll(dir, 0755)
		if err != nil {
			return err
		}
		return unzip(data, f.Path)
	default:
		return errors.New("Unsupported encoding " + f.Encoding + " for worker file")
	}
}

// This is a modified version of
// http://stackoverflow.com/questions/20357223/easy-way-to-unzip-file-with-golang
// to work with in memory zip, rather than a file
func unzip(b []byte, dest string) error {
	br := bytes.NewReader(b)
	r, err := zip.NewReader(br, int64(len(b)))
	if err != nil {
		return err
	}

	err = os.MkdirAll(dest, 0755)
	if err != nil {
		return err
	}

	// Closure to address file descriptors issue with all the deferred .Close() methods
	extractAndWriteFile := func(f *zip.File) error {
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer func() {
			if err := rc.Close(); err != nil {
				panic(err)
			}
		}()

		// note that the ZIP file here is trusted so `..` in this path does not
		// constitute a vulnerability (just an odd way to get things done)
		path := filepath.Join(dest, f.Name)

		dir := filepath.Dir(path)
		err = os.MkdirAll(dir, 0755)
		if err != nil {
			return err
		}

		if f.FileInfo().IsDir() {
			err := os.MkdirAll(path, f.Mode())
			if err != nil {
				return err
			}
		} else {
			f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
			if err != nil {
				return err
			}
			defer func() {
				if err := f.Close(); err != nil {
					panic(err)
				}
			}()

			_, err = io.Copy(f, rc)
			if err != nil {
				return err
			}
		}
		return nil
	}

	for _, f := range r.File {
		err := extractAndWriteFile(f)
		if err != nil {
			return err
		}
	}

	return nil
}
