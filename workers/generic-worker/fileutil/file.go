package fileutil

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

type File struct {
	Description string `json:"description"`
	Path        string `json:"path"`
	Content     string `json:"content"`
	Encoding    string `json:"encoding"`
	Format      string `json:"format"`
}

func (f File) Extract() error {
	switch f.Format {
	case "file":
		return f.ExtractFile()
	case "zip":
		return f.ExtractZip()
	default:
		return errors.New("Unknown file format " + f.Format + " in worker type secret")
	}
}

func (f File) ExtractFile() error {
	switch f.Encoding {
	case "base64":
		data, err := base64.StdEncoding.DecodeString(f.Content)
		if err != nil {
			return err
		}
		log.Printf("Writing %v to path %v", f.Description, f.Path)
		return ioutil.WriteFile(f.Path, data, 0777)
	default:
		return errors.New("Unsupported encoding " + f.Encoding + " for file secret in worker type definition")
	}
}

func (f File) ExtractZip() error {
	switch f.Encoding {
	case "base64":
		data, err := base64.StdEncoding.DecodeString(f.Content)
		if err != nil {
			return err
		}
		log.Printf("Unzipping %v to path %v", f.Description, f.Path)
		return Unzip(data, f.Path)
	default:
		return errors.New("Unsupported encoding " + f.Encoding + " for zip secret in worker type definition")
	}
}

// This is a modified version of
// http://stackoverflow.com/questions/20357223/easy-way-to-unzip-file-with-golang
// to work with in memory zip, rather than a file
func Unzip(b []byte, dest string) error {
	br := bytes.NewReader(b)
	r, err := zip.NewReader(br, int64(len(b)))
	if err != nil {
		return err
	}

	os.MkdirAll(dest, 0755)

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

		path := filepath.Join(dest, f.Name)

		if f.FileInfo().IsDir() {
			os.MkdirAll(path, f.Mode())
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
