package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/taskcluster/taskcluster/v62/tools/d2g/genericworker"
)

func (idi *IndexedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	indexedContent := genericworker.IndexedContent{
		Artifact:  idi.Path,
		Namespace: idi.Namespace,
	}
	raw, err := json.MarshalIndent(&indexedContent, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("cannot marshal indexed content %#v into json: %w", indexedContent, err)
	}
	return []genericworker.FileMount{
		{
			Content: json.RawMessage(raw),
			// Instead of trying to preserve the artifact filename, we use a
			// hardcoded name to prevent filename collisions.
			// This _may_ cause issues once concurrent tasks are supported
			// on generic worker (see https://bugzil.la/1609102).
			File:   "dockerimage",
			Format: fileExtension(idi.Path),
		},
	}, nil
}

func (idi *IndexedDockerImage) String() (string, error) {
	return "docker-archive:dockerimage", nil
}

func fileExtension(path string) string {
	extensionFormats := map[string]string{
		".bz2": "bz2",
		".gz":  "gz",
		".lz4": "lz4",
		".xz":  "xz",
		".zst": "zst",
	}

	lowerExt := strings.ToLower(filepath.Ext(path))
	return extensionFormats[lowerExt]
}
