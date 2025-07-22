//go:build linux

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/taskcluster/taskcluster/v88/internal/scopes"
	"github.com/taskcluster/taskcluster/v88/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v88/workers/generic-worker/process"
)

type (
	D2GFeature struct {
	}

	D2GTaskFeature struct {
		task       *TaskRun
		imageCache ImageCache
	}

	ImageCache map[string]*Image
	Image      struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
)

func (df *D2GFeature) Name() string {
	return "D2G"
}

func (df *D2GFeature) Initialise() error {
	return nil
}

func (df *D2GFeature) IsEnabled() bool {
	return config.D2GEnabled()
}

func (df *D2GFeature) IsRequested(task *TaskRun) bool {
	return task.D2GInfo != nil
}

func (df *D2GFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &D2GTaskFeature{
		task:       task,
		imageCache: ImageCache{},
	}
}

func (dtf *D2GTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (dtf *D2GTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (dtf *D2GTaskFeature) Start() *CommandExecutionError {
	// load cache on every start in case the garbage
	// collector has pruned docker images between tasks
	dtf.imageCache.loadFromFile("d2g-image-cache.json")

	imageLoader := dtf.task.D2GInfo.Image.ImageLoader()

	var isImageArtifact bool
	var key string
	imageArtifactPath := filepath.Join(taskContext.TaskDir, "dockerimage")
	if _, err := os.Stat(imageArtifactPath); os.IsNotExist(err) {
		// DockerImageName or NamedDockerImage, no image artifact
		key = dtf.task.D2GInfo.Image.String()
	} else {
		// DockerImageArtifact or IndexedDockerImage
		isImageArtifact = true
		key, err = fileutil.CalculateSHA256(imageArtifactPath)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not calculate SHA256 of docker image artifact: %v", err))
		}
	}

	image := dtf.imageCache[key]

	if image == nil {
		dtf.task.Info("[d2g] Loading docker image")
		cmd, err := process.NewCommandNoOutputStreams([]string{
			"/usr/bin/env",
			"bash",
			"-c",
			imageLoader.LoadCommand(),
		}, taskContext.TaskDir, []string{}, dtf.task.pd)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to load docker image: %v", err))
		}
		out, err := cmd.Output()
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not load docker image: %v\n%v", err, string(out)))
		}

		imageName := strings.TrimSpace(string(out))
		imageID := imageName

		// DockerImageArtifact or IndexedDockerImage, need to get
		// sha256 of the image to differentiate between images
		// with the same name/tag
		if isImageArtifact {
			cmd, err = process.NewCommandNoOutputStreams([]string{
				"/usr/bin/env",
				"bash",
				"-c",
				fmt.Sprintf("docker images --no-trunc -q %s", imageName),
			}, taskContext.TaskDir, []string{}, dtf.task.pd)
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to get sha256 of docker image: %v", err))
			}
			out, err = cmd.Output()
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not get sha256 of docker image: %v\n%v", err, string(out)))
			}

			imageID = strings.Split(strings.TrimSpace(string(out)), ":")[1]
		}

		image = &Image{
			ID:   imageID,
			Name: imageName,
		}
		dtf.imageCache[key] = image
		dtf.task.Infof("[d2g] Loaded docker image %q", image.Name)
	} else {
		dtf.task.Infof("[d2g] Using cached docker image %q", image.Name)
	}

	if dtf.task.Payload.Env == nil {
		dtf.task.Payload.Env = make(map[string]string)
	}

	dtf.task.Payload.Env["D2G_IMAGE_ID"] = image.ID
	err := dtf.task.setVariable("D2G_IMAGE_ID", image.ID)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("[d2g] could not set D2G_IMAGE_ID environment variable: %v", err))
	}

	if dtf.task.DockerWorkerPayload.Features.ChainOfTrust {
		cmd, err := process.NewCommandNoOutputStreams([]string{
			"/usr/bin/env",
			"bash",
			"-c",
			imageLoader.ChainOfTrustCommand(),
		}, taskContext.TaskDir, []string{fmt.Sprintf("D2G_IMAGE_ID=%s", image.ID)}, dtf.task.pd)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to create chain of trust additional data file: %v", err))
		}
		out, err := cmd.CombinedOutput()
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not create chain of trust additional data file: %v\n%v", err, string(out)))
		}
	}
	return nil
}

func (dtf *D2GTaskFeature) Stop(err *ExecutionErrors) {
	if dtf.task.DockerWorkerPayload.Features.DockerSave {
		cmd, e := process.NewCommandNoOutputStreams([]string{
			"docker",
			"commit",
			dtf.task.D2GInfo.ContainerName,
			dtf.task.D2GInfo.ContainerName,
		}, taskContext.TaskDir, []string{}, dtf.task.pd)
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to commit docker container: %v", e)))
		}
		out, e := cmd.CombinedOutput()
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not commit docker container: %v\n%v", e, string(out))))
		}

		cmd, e = process.NewCommandNoOutputStreams([]string{
			"/usr/bin/env",
			"bash",
			"-c",
			fmt.Sprintf("docker save %s | gzip > image.tar.gz", dtf.task.D2GInfo.ContainerName),
		}, taskContext.TaskDir, []string{}, dtf.task.pd)
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to save docker image: %v", e)))
		}
		out, e = cmd.CombinedOutput()
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not save docker image: %v\n%v", e, string(out))))
		}
	}

	for _, artifact := range dtf.task.D2GInfo.CopyArtifacts {
		cmd, e := process.NewCommandNoOutputStreams([]string{
			"docker",
			"cp",
			fmt.Sprintf("%s:%s", dtf.task.D2GInfo.ContainerName, artifact.SrcPath),
			artifact.DestPath,
		}, taskContext.TaskDir, []string{}, dtf.task.pd)
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to copy artifact: %v", e)))
		}
		out, e := cmd.CombinedOutput()
		if e != nil {
			dtf.task.Warnf("[d2g] Artifact %q not found at %q: %v\n%v", artifact.Name, artifact.SrcPath, e, string(out))
		}
	}

	cmd, e := process.NewCommandNoOutputStreams([]string{
		"docker",
		"rm",
		"--force",
		"--volumes",
		dtf.task.D2GInfo.ContainerName,
	}, taskContext.TaskDir, []string{}, dtf.task.pd)
	if e != nil {
		err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to remove docker container: %v", e)))
	}
	out, e := cmd.CombinedOutput()
	if e != nil {
		err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not remove docker container: %v\n%v", e, string(out))))
	}

	err.add(executionError(internalError, errored, fileutil.WriteToFileAsJSON(&dtf.imageCache, "d2g-image-cache.json")))
	err.add(executionError(internalError, errored, fileutil.SecureFiles("d2g-image-cache.json")))
}

func (ic *ImageCache) loadFromFile(stateFile string) {
	_, err := os.Stat(stateFile)
	if err != nil {
		log.Printf("[d2g] No %v file found, creating empty ImageCache", stateFile)
		*ic = ImageCache{}
		return
	}
	err = loadFromJSONFile(ic, stateFile)
	if err != nil {
		panic(err)
	}
}
