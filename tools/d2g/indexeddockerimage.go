package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/taskcluster/taskcluster/v55/tools/d2g/genericworker"
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
			File:    "dockerimage",
			Format:  fileExtension(idi.Path),
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
