package main

import (
	"io"
	"os"

	"github.com/taskcluster/taskcluster/v108/workers/generic-worker/safefs"
)

type reservedContentSource string

func (f reservedContentSource) OpenForUpload() (*os.File, error) {
	return safefs.OpenExistingReadonly(string(f))
}

func (f reservedContentSource) WriteContent(w io.Writer) (int64, error) {
	source, err := f.OpenForUpload()
	if err != nil {
		return 0, err
	}
	defer source.Close()
	return io.Copy(w, source)
}
