//go:build linux

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/taskcluster/taskcluster/v94/internal/scopes"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v94/workers/generic-worker/process"
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

	// Always want to re-pull the docker image
	// if it's not an image artifact, as the
	// tag could be outdated
	// (see https://github.com/taskcluster/taskcluster/issues/8004)
	if image == nil || !isImageArtifact {
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
			}, taskContext.TaskDir, []string{}, dtf.task.pd)
		} else {
			cmd, err = process.NewCommandNoOutputStreams([]string{
				"docker",
				"pull",
				"--quiet",
				key,
			}, taskContext.TaskDir, []string{}, dtf.task.pd)
		}
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to load docker image: %v", err))
		}
		out, err := cmd.Output()
		if err != nil {
			return executionError(internalError, errored, formatCommandError("[d2g] could not load docker image", err, out))
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
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not determine docker image name from docker load output:\n%v", string(out)))
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
			}, taskContext.TaskDir, []string{}, dtf.task.pd)
			if err != nil {
				return executionError(internalError, errored, fmt.Errorf("[d2g] could not create process to get sha256 of docker image: %v", err))
			}
			out, err = cmd.Output()
			if err != nil {
				return executionError(internalError, errored, formatCommandError("[d2g] could not get sha256 of docker image", err, out))
			}

			// Only use the first line of output for image ID
			// as docker images can output multiple sha256's for the
			// same image (see https://github.com/taskcluster/taskcluster/issues/7967)
			idLine := strings.Split(strings.TrimSpace(string(out)), "\n")[0]
			imageID = strings.TrimPrefix(idLine, "sha256:")
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

	if dtf.task.DockerWorkerPayload.Features.ChainOfTrust {
		cmd, err := process.NewCommandNoOutputStreams([]string{
			"docker",
			"inspect",
			"--format={{index .Id}}",
			image.ID,
		}, taskContext.TaskDir, []string{}, dtf.task.pd)
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

	dtf.evaluateCommandPlaceholders(image.ID)

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
			dtf.task.Warnf("%v", formatCommandError(fmt.Sprintf("[d2g] Artifact %q not found at %q", artifact.Name, artifact.SrcPath), e, out))
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
		err.add(executionError(internalError, errored, formatCommandError("[d2g] could not remove docker container", e, out)))
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
