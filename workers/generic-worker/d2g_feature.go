//go:build linux

package main

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster/v86/internal/scopes"
	"github.com/taskcluster/taskcluster/v86/workers/generic-worker/process"
)

type (
	D2GFeature struct {
	}

	D2GTaskFeature struct {
		task *TaskRun
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
		task: task,
	}
}

func (dtf *D2GTaskFeature) ReservedArtifacts() []string {
	return []string{}
}

func (dtf *D2GTaskFeature) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (dtf *D2GTaskFeature) Start() *CommandExecutionError {
	imageLoader := dtf.task.D2GInfo.Image.ImageLoader()
	cmd, err := process.NewCommandNoOutputStreams([]string{
		"/usr/bin/env",
		"bash",
		"-c",
		imageLoader.LoadCommand(),
	}, taskContext.TaskDir, []string{}, dtf.task.pd)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not create process to load docker image: %v", err))
	}
	out, err := cmd.Output()
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not load docker image: %v\n%v", err, string(out)))
	}

	imageID := strings.TrimSpace(string(out))

	if dtf.task.Payload.Env == nil {
		dtf.task.Payload.Env = make(map[string]string)
	}

	dtf.task.Payload.Env["D2G_IMAGE_ID"] = imageID
	err = dtf.task.setVariable("D2G_IMAGE_ID", imageID)
	if err != nil {
		return executionError(internalError, errored, fmt.Errorf("could not set D2G_IMAGE_ID environment variable: %v", err))
	}

	if dtf.task.DockerWorkerPayload.Features.ChainOfTrust {
		cmd, err := process.NewCommandNoOutputStreams([]string{
			"/usr/bin/env",
			"bash",
			"-c",
			imageLoader.ChainOfTrustCommand(),
		}, taskContext.TaskDir, []string{fmt.Sprintf("D2G_IMAGE_ID=%s", imageID)}, dtf.task.pd)
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not create process to create chain of trust additional data file: %v", err))
		}
		out, err := cmd.CombinedOutput()
		if err != nil {
			return executionError(internalError, errored, fmt.Errorf("could not create chain of trust additional data file: %v\n%v", err, string(out)))
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
			err.add(executionError(internalError, errored, fmt.Errorf("could not create process to commit docker container: %v", e)))
		}
		out, e := cmd.CombinedOutput()
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("could not commit docker container: %v\n%v", e, string(out))))
		}

		cmd, e = process.NewCommandNoOutputStreams([]string{
			"/usr/bin/env",
			"bash",
			"-c",
			fmt.Sprintf("docker save %s | gzip > image.tar.gz", dtf.task.D2GInfo.ContainerName),
		}, taskContext.TaskDir, []string{}, dtf.task.pd)
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("could not create process to save docker image: %v", e)))
		}
		out, e = cmd.CombinedOutput()
		if e != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("could not save docker image: %v\n%v", e, string(out))))
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
			err.add(executionError(internalError, errored, fmt.Errorf("could not create process to copy artifact: %v", e)))
		}
		out, e := cmd.CombinedOutput()
		if e != nil {
			dtf.task.Warnf("Artifact %q not found at %q: %v\n%v", artifact.Name, artifact.SrcPath, e, string(out))
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
		err.add(executionError(internalError, errored, fmt.Errorf("could not create process to remove docker container: %v", e)))
	}
	out, e := cmd.CombinedOutput()
	if e != nil {
		err.add(executionError(internalError, errored, fmt.Errorf("could not remove docker container: %v\n%v", e, string(out))))
	}
}
