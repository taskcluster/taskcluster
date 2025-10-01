//go:build linux

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	dockerContainer "github.com/docker/docker/api/types/container"
	dockerImage "github.com/docker/docker/api/types/image"
	dockerClient "github.com/docker/docker/client"
	"github.com/taskcluster/taskcluster/v90/internal/scopes"
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/process"
)

type (
	D2GFeature struct {
	}

	D2GTaskFeature struct {
		task         *TaskRun
		imageCache   ImageCache
		dockerClient *dockerClient.Client
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

	var err error
	dtf.dockerClient, err = dockerClient.NewClientWithOpts(dockerClient.FromEnv, dockerClient.WithAPIVersionNegotiation())
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("[d2g] could not create docker client: %v", err))
	}

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

	cachedImage := dtf.imageCache[key]

	if cachedImage == nil {
		dtf.task.Info("[d2g] Loading docker image")

		imageName := key
		if isImageArtifact {
			image, err := os.Open(imageArtifactPath)
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not open docker image artifact: %v", err))
			}
			defer image.Close()

			loadResp, err := dtf.dockerClient.ImageLoad(context.Background(), image, dockerClient.ImageLoadWithQuiet(true))
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not load docker image artifact: %v", err))
			}
			defer loadResp.Body.Close()

			bodyBytes, err := io.ReadAll(loadResp.Body)
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not read docker load response: %v", err))
			}

			var loadResult struct {
				Stream string `json:"stream"`
			}
			err = json.Unmarshal(bodyBytes, &loadResult)
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not parse docker load response: %v", err))
			}

			imageName = strings.TrimSpace(loadResult.Stream)
		} else {
			image, err := dtf.dockerClient.ImagePull(context.Background(), key, dockerImage.PullOptions{})
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not pull docker image %q: %v", key, err))
			}
			defer image.Close()
		}

		// Default to use the first line of output for image
		// name as docker load can output multiple tags for the
		// same image (see https://github.com/taskcluster/taskcluster/issues/7967)
		imageNameLines := strings.Split(imageName, "\n")
		imageName = imageNameLines[0]
		if isImageArtifact {
			imageNameFound := false
			// Find the first line with "Loaded image: " prefix
			// (see https://github.com/taskcluster/taskcluster/issues/7969)
			for _, line := range imageNameLines {
				if name, found := strings.CutPrefix(line, "Loaded image: "); found {
					imageName = name
					imageNameFound = true
					break
				}
			}

			if !imageNameFound {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not determine docker image name from docker load output:\n%v", imageNameLines))
			}
		}
		imageID := imageName

		// DockerImageArtifact or IndexedDockerImage, need to get
		// sha256 of the image to differentiate between images
		// with the same name/tag
		if isImageArtifact {
			loadResp, err := dtf.dockerClient.ImageInspect(context.Background(), imageName)
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not inspect docker image: %v", err))
			}

			imageID = strings.TrimPrefix(loadResp.ID, "sha256:")
		}

		cachedImage = &Image{
			ID:   imageID,
			Name: imageName,
		}
		dtf.imageCache[key] = cachedImage
		dtf.task.Infof("[d2g] Loaded docker image %q", cachedImage.Name)
	} else {
		dtf.task.Infof("[d2g] Using cached docker image %q", cachedImage.Name)
	}

	if dtf.task.Payload.Env == nil {
		dtf.task.Payload.Env = make(map[string]string)
	}

	if dtf.task.DockerWorkerPayload.Features.ChainOfTrust {
		loadResp, err := dtf.dockerClient.ImageInspect(context.Background(), cachedImage.Name)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not inspect docker image: %v", err))
		}

		var chainOfTrustAdditionalData string
		if isImageArtifact {
			chainOfTrustAdditionalData = fmt.Sprintf(`{"environment":{"imageHash":"%s","imageArtifactHash":"sha256:%s"}}`, loadResp.ID, key)
		} else {
			chainOfTrustAdditionalData = fmt.Sprintf(`{"environment":{"imageHash":"%s"}}`, loadResp.ID)
		}

		chainOfTrustAdditionalDataPath := filepath.Join(taskContext.TaskDir, "chain-of-trust-additional-data.json")
		err = os.WriteFile(chainOfTrustAdditionalDataPath, []byte(chainOfTrustAdditionalData), 0644)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not write chain of trust additional data file: %v", err))
		}
	}

	envFile, err := os.Create(filepath.Join(taskContext.TaskDir, "env.list"))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("[d2g] could not create env.list file: %v", err))
	}
	defer envFile.Close()

	_, err = envFile.WriteString(dtf.task.D2GInfo.EnvVars)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("[d2g] could not write to env.list file: %v", err))
	}

	dtf.evaluateCommandPlaceholders(cachedImage.ID)

	return nil
}

func (dtf *D2GTaskFeature) Stop(err *ExecutionErrors) {
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

	err.add(executionError(internalError, errored, dtf.dockerClient.ContainerRemove(
		context.Background(),
		dtf.task.D2GInfo.ContainerName,
		dockerContainer.RemoveOptions{
			RemoveVolumes: true,
			Force:         true,
		},
	)))
	err.add(executionError(internalError, errored, dtf.dockerClient.Close()))
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

func (dtf *D2GTaskFeature) evaluateCommandPlaceholders(imageID string) {
	videoDevice, _ := dtf.task.getVariable("TASKCLUSTER_VIDEO_DEVICE")
	placeholders := strings.NewReplacer(
		"__D2G_IMAGE_ID__", imageID,
		"__TASK_DIR__", taskContext.TaskDir,
		"__TASKCLUSTER_VIDEO_DEVICE__", videoDevice,
	)

	// Update commands in the payload so that
	// task.formatCommand() correctly logs out
	// the commands with placeholders replaced
	// before task execution
	for _, command := range dtf.task.Payload.Command {
		for i, arg := range command {
			command[i] = placeholders.Replace(arg)
		}
	}

	// Update commands that are actually executed
	for _, command := range dtf.task.Commands {
		for i, arg := range command.Args {
			command.Args[i] = placeholders.Replace(arg)
		}
	}
}
