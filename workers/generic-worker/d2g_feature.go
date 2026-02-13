//go:build linux

package main

import (
	"fmt"
	"log"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
)

var (
	// d2gCacheMutex protects access to the d2g-image-cache.json file
	// for concurrent task execution (capacity > 1)
	d2gCacheMutex sync.Mutex
	// d2gImageLoadMutex protects concurrent docker image loads
	// for concurrent task execution (capacity > 1)
	d2gImageLoadMutex sync.Mutex
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
	d2gCacheMutex.Lock()
	dtf.imageCache.loadFromFile("d2g-image-cache.json")
	d2gCacheMutex.Unlock()

	taskDir := dtf.task.TaskDir()
	var isImageArtifact bool
	var key string
	imageArtifactPath := filepath.Join(taskDir, "dockerimage")
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
	loadedImage := false
	loadImage := func() (*Image, *CommandExecutionError) {
		dtf.task.Info("[d2g] Loading docker image")

		var cmd *process.Command
		var err error
		if isImageArtifact {
			cmd, err = process.NewCommandNoOutputStreams([]string{
				"docker",
				"load",
				"--quiet",
				"--input",
				"dockerimage",
			}, taskDir, []string{}, dtf.task.pd)
		} else {
			cmd, err = process.NewCommandNoOutputStreams([]string{
				"docker",
				"pull",
				"--quiet",
				key,
			}, taskDir, []string{}, dtf.task.pd)
		}
		if err != nil {
			return nil, executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to load docker image: %v", err))
		}
		out, err := cmd.Output()
		if err != nil {
			return nil, executionError(internalError, errored, formatCommandError("[d2g] could not load docker image", err, out))
		}

		// Default to use the first line of output for image
		// name as docker load can output multiple tags for the
		// same image (see https://github.com/taskcluster/taskcluster/issues/7967)
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		imageName := lines[0]
		if isImageArtifact {
			imageNameFound := false
			// Find the first line with "Loaded image: " prefix
			// (see https://github.com/taskcluster/taskcluster/issues/7969)
			for _, line := range lines {
				if name, found := strings.CutPrefix(line, "Loaded image: "); found {
					imageName = name
					imageNameFound = true
					break
				}
			}

			if !imageNameFound {
				return nil, executionError(internalError, errored, fmt.Errorf("[d2g] could not determine docker image name from docker load output:\n%v", string(out)))
			}
		}
		imageID := imageName

		// DockerImageArtifact or IndexedDockerImage, need to get
		// sha256 of the image to differentiate between images
		// with the same name/tag
		if isImageArtifact {
			cmd, err = process.NewCommandNoOutputStreams([]string{
				"docker",
				"images",
				"--no-trunc",
				"--quiet",
				imageName,
			}, taskDir, []string{}, dtf.task.pd)
			if err != nil {
				return nil, executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to get sha256 of docker image: %v", err))
			}
			out, err = cmd.Output()
			if err != nil {
				return nil, executionError(internalError, errored, formatCommandError("[d2g] could not get sha256 of docker image", err, out))
			}

			// Only use the first line of output for image ID
			// as docker images can output multiple sha256's for the
			// same image (see https://github.com/taskcluster/taskcluster/issues/7967)
			idLine := strings.Split(strings.TrimSpace(string(out)), "\n")[0]
			imageID = strings.TrimPrefix(idLine, "sha256:")
		}

		return &Image{
			ID:   imageID,
			Name: imageName,
		}, nil
	}

	// Always want to re-pull the docker image
	// if it's not an image artifact, as the
	// tag could be outdated
	// (see https://github.com/taskcluster/taskcluster/issues/8004)
	if isImageArtifact {
		if image == nil {
			// Docker image artifacts frequently reuse tags. Serialize loads so that
			// tag -> ID resolution isn't raced by another load.
			d2gImageLoadMutex.Lock()

			// Refresh cache from disk in case another task loaded this image
			// while we were waiting to acquire the lock.
			latestCache := ImageCache{}
			d2gCacheMutex.Lock()
			latestCache.loadFromFile("d2g-image-cache.json")
			d2gCacheMutex.Unlock()
			maps.Copy(dtf.imageCache, latestCache)
			image = latestCache[key]

			if image == nil {
				var loadErr *CommandExecutionError
				image, loadErr = loadImage()
				if loadErr != nil {
					d2gImageLoadMutex.Unlock()
					return loadErr
				}
				dtf.imageCache[key] = image
				loadedImage = true
			}

			d2gImageLoadMutex.Unlock()
		}
	} else {
		var loadErr *CommandExecutionError
		image, loadErr = loadImage()
		if loadErr != nil {
			return loadErr
		}
		dtf.imageCache[key] = image
		loadedImage = true
	}

	if loadedImage {
		dtf.task.Infof("[d2g] Loaded docker image %q", image.Name)
	} else {
		dtf.task.Infof("[d2g] Using cached docker image %q", image.Name)
	}

	if dtf.task.Payload.Env == nil {
		dtf.task.Payload.Env = make(map[string]string)
	}

	if dtf.task.DockerWorkerPayload.Features.ChainOfTrust {
		cmd, err := process.NewCommandNoOutputStreams([]string{
			"docker",
			"inspect",
			"--format={{index .Id}}",
			image.ID,
		}, taskDir, []string{}, dtf.task.pd)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to inspect docker image: %v", err))
		}
		out, err := cmd.Output()
		if err != nil {
			return executionError(internalError, errored, formatCommandError("[d2g] could not inspect docker image", err, out))
		}
		imageHash := strings.TrimSpace(string(out))

		var chainOfTrustAdditionalData string
		if isImageArtifact {
			chainOfTrustAdditionalData = fmt.Sprintf(`{"environment":{"imageHash":"%s","imageArtifactHash":"sha256:%s"}}`, imageHash, key)
		} else {
			chainOfTrustAdditionalData = fmt.Sprintf(`{"environment":{"imageHash":"%s"}}`, imageHash)
		}

		chainOfTrustAdditionalDataPath := filepath.Join(taskDir, "chain-of-trust-additional-data.json")
		err = os.WriteFile(chainOfTrustAdditionalDataPath, []byte(chainOfTrustAdditionalData), 0644)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not write chain of trust additional data file: %v", err))
		}
	}

	envFile, err := os.Create(filepath.Join(taskDir, "env.list"))
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("[d2g] could not create env.list file: %v", err))
	}
	defer envFile.Close()

	_, err = envFile.WriteString(dtf.task.D2GInfo.EnvVars)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("[d2g] could not write to env.list file: %v", err))
	}

	dtf.evaluateCommandPlaceholders(image.ID, taskDir)

	d2gCacheMutex.Lock()
	mergedCache := ImageCache{}
	mergedCache.loadFromFile("d2g-image-cache.json")
	maps.Copy(mergedCache, dtf.imageCache)
	if writeErr := fileutil.WriteToFileAsJSON(&mergedCache, "d2g-image-cache.json"); writeErr != nil {
		d2gCacheMutex.Unlock()
		return executionError(internalError, errored, writeErr)
	}
	if secErr := fileutil.SecureFiles("d2g-image-cache.json"); secErr != nil {
		d2gCacheMutex.Unlock()
		return executionError(internalError, errored, secErr)
	}
	d2gCacheMutex.Unlock()

	return nil
}

func (dtf *D2GTaskFeature) Stop(err *ExecutionErrors) {
	taskDir := dtf.task.TaskDir()
	for _, artifact := range dtf.task.D2GInfo.CopyArtifacts {
		cmd, e := process.NewCommandNoOutputStreams([]string{
			"docker",
			"cp",
			fmt.Sprintf("%s:%s", dtf.task.D2GInfo.ContainerName, artifact.SrcPath),
			artifact.DestPath,
		}, taskDir, []string{}, dtf.task.pd)
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to copy artifact: %v", e)))
		}
		out, e := cmd.CombinedOutput()
		if e != nil {
			dtf.task.Warnf("%v", formatCommandError(fmt.Sprintf("[d2g] Artifact %q not found at %q", artifact.Name, artifact.SrcPath), e, out))
		}
	}

	cmd, e := process.NewCommandNoOutputStreams([]string{
		"docker",
		"rm",
		"--force",
		dtf.task.D2GInfo.ContainerName,
	}, taskDir, []string{}, dtf.task.pd)
	if e != nil {
		err.add(executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to remove docker container: %v", e)))
	}
	out, e := cmd.CombinedOutput()
	if e != nil {
		err.add(executionError(internalError, errored, formatCommandError("[d2g] could not remove docker container", e, out)))
	}

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

func (dtf *D2GTaskFeature) evaluateCommandPlaceholders(imageID string, taskDir string) {
	videoDevice, _ := dtf.task.getVariable("TASKCLUSTER_VIDEO_DEVICE")
	dockerNetwork, _ := dtf.task.getVariable("TASKCLUSTER_DOCKER_NETWORK")
	proxyGateway, _ := dtf.task.getVariable("TASKCLUSTER_PROXY_GATEWAY")
	placeholders := strings.NewReplacer(
		"__D2G_IMAGE_ID__", imageID,
		"__TASK_DIR__", taskDir,
		"__TASKCLUSTER_VIDEO_DEVICE__", videoDevice,
		"__TASKCLUSTER_DOCKER_NETWORK__", dockerNetwork,
		"__TASKCLUSTER_PROXY_GATEWAY__", proxyGateway,
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

// formatCommandError creates a detailed error message from command execution failure
// For cmd.Output(), out contains stdout and stderr may be in ExitError
// For cmd.CombinedOutput(), out contains both stdout and stderr combined
func formatCommandError(prefix string, err error, out []byte) error {
	errorMsg := fmt.Sprintf("%s: %v\n%v", prefix, err, string(out))
	if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
		// This is from cmd.Output() where stderr is separate
		errorMsg = fmt.Sprintf("%s: %v\nstdout: %v\nstderr: %v", prefix, err, string(out), string(exitErr.Stderr))
	}
	return fmt.Errorf("%s", errorMsg)
}
