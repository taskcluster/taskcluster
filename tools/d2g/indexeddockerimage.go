package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"

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
			// TODO check if this could conflict with other files(?)
			File: filepath.Base(idi.Path),
		},
	}, nil
}

func (idi *IndexedDockerImage) String() (string, error) {
	return fmt.Sprintf("docker-archive:%s", filepath.Base(idi.Path)), nil
}
