package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/taskcluster/taskcluster/v79/tools/d2g/genericworker"
)

func (idi *IndexedDockerImage) FileMounts(tool string) ([]genericworker.FileMount, error) {
	indexedContent := genericworker.IndexedContent{
		Artifact:  idi.Path,
		Namespace: idi.Namespace,
	}
	raw, err := json.MarshalIndent(&indexedContent, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("cannot marshal indexed content %#v into json: %w", indexedContent, err)
	}
	fm := genericworker.FileMount{
		Content: json.RawMessage(raw),
		// Instead of trying to preserve the artifact filename, we use a
		// hardcoded name to prevent filename collisions.
		// This _may_ cause issues once concurrent tasks are supported
		// on generic worker (see https://bugzil.la/1609102).
		File:   "dockerimage",
		Format: fileExtension(idi.Path),
	}
	// docker can load images compressed with gzip, bzip2, xz, or zstd
	// https://docs.docker.com/reference/cli/docker/image/load/
	if tool == "docker" {
		for _, ext := range []string{"gz", "bz2", "xz", "zst"} {
			// explicity set to the empty string so generic worker
			// does not decompress the image before running `docker load`
			if ext == fm.Format {
				fm.Format = ""
				break
			}
		}
	}
	return []genericworker.FileMount{fm}, nil
}

func (idi *IndexedDockerImage) LoadCommands(tool string) []string {
	switch tool {
	case "docker":
		return []string{
			`IMAGE_ID=$(docker load --input dockerimage | sed -n '0,/^Loaded image: /s/^Loaded image: //p')`,
		}
	default:
		return []string{}
	}
}

func (idi *IndexedDockerImage) String(tool string) (string, error) {
	switch tool {
	case "docker":
		return `"${IMAGE_ID}"`, nil
	default:
		return "docker-archive:dockerimage", nil
	}
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
