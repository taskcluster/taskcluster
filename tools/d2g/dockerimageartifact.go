package d2g

import (
	"encoding/json"
	"fmt"

	"slices"

	"github.com/taskcluster/taskcluster/v94/tools/d2g/genericworker"
)

func (dia *DockerImageArtifact) FileMounts() ([]genericworker.FileMount, error) {
	artifactContent := genericworker.ArtifactContent{
		Artifact: dia.Path,
		SHA256:   "", // We could add this as an optional property to docker worker schema
		TaskID:   dia.TaskID,
	}
	raw, err := json.MarshalIndent(&artifactContent, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("cannot marshal artifact content %#v into json: %w", artifactContent, err)
	}
	fm := genericworker.FileMount{
		Content: json.RawMessage(raw),
		// Instead of trying to preserve the artifact filename, we use a
		// hardcoded name to prevent filename collisions.
		// This _may_ cause issues once concurrent tasks are supported
		// on generic worker (see https://bugzil.la/1609102).
		File:   "dockerimage",
		Format: fileExtension(dia.Path),
	}
	// docker can load images compressed with gzip, bzip2, xz, or zstd
	// https://docs.docker.com/reference/cli/docker/image/load/
	if slices.Contains([]string{"gz", "bz2", "xz", "zst"}, fm.Format) {
		// explicity set to the empty string so generic worker
		// does not decompress the image before running `docker load`
		fm.Format = ""
	}
	return []genericworker.FileMount{fm}, nil
}

func (dia *DockerImageArtifact) String() string {
	return "__D2G_IMAGE_ID__"
}
