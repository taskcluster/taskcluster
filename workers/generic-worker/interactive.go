//go:build darwin || linux || freebsd

package main

import (
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"path"
	"strconv"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v54/clients/client-go"
	"github.com/taskcluster/taskcluster/v54/internal/scopes"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/expose"
	"github.com/taskcluster/taskcluster/v54/workers/generic-worker/interactive"
)

type InteractiveFeature struct {
}

func (feature *InteractiveFeature) Name() string {
	return "Interactive"
}

func (feature *InteractiveFeature) Initialise() error {
	return nil
}

func (feature *InteractiveFeature) PersistState() error {
	return nil
}

func (feature *InteractiveFeature) IsEnabled(task *TaskRun) bool {
	return task.Payload.Features.Interactive
}

type InteractiveTask struct {
	task         *TaskRun
	interactive  *interactive.Interactive
	exposure     expose.Exposure
	artifactName string
	cancel       context.CancelFunc
}

func (feature *InteractiveFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	return &InteractiveTask{
		task:         task,
		artifactName: "private/generic-worker/shell.html",
	}
}

func (it *InteractiveTask) RequiredScopes() scopes.Required {
	return scopes.Required{}
}

func (it *InteractiveTask) ReservedArtifacts() []string {
	return []string{
		it.artifactName,
	}
}

func (it *InteractiveTask) Start() *CommandExecutionError {
	if !config.EnableInteractive {
		workerPoolID := config.WorkerGroup + "/" + config.WorkerType
		workerManagerURL := config.RootURL + "/worker-manager/" + url.PathEscape(workerPoolID)
		return MalformedPayloadError(fmt.Errorf(`This task has payload.features.interactive set to true, but enableInteractive is not enabled on this worker pool (%s)
If you do not require an interactive task, remove payload.features.interactive from the task definition.
If you do require an interactive task, please do one of two things:
	1. Contact the owner of the worker pool %s (see %s) and ask for interactive tasks to be enabled.
	2. Use a worker pool that already allows interactive tasks (search for "enableInteractive": "true" in the worker pool definition)`, workerPoolID, workerPoolID, workerManagerURL))
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := func() (*exec.Cmd, error) {
		return it.task.generateInteractiveCommand(ctx)
	}

	interactive, err := interactive.New(config.InteractivePort, cmd, ctx)
	if err != nil {
		it.task.Warnf("[interactive] could not create interactive session: %v", err)
		cancel()
		return nil
	}
	it.interactive = interactive
	it.cancel = cancel

	done := make(chan error, 1)
	go func() {
		done <- it.interactive.ListenAndServe(ctx)
	}()

	err = it.uploadInteractiveArtifact()
	if err != nil {
		it.task.Warnf("[interactive] could not upload interactive artifact: %v", err)
	}

	select {
	case err := <-done:
		if err != nil {
			return &CommandExecutionError{
				Cause: err,
			}
		}
		return nil
	default:
		return nil
	}
}

func (it *InteractiveTask) Stop(err *ExecutionErrors) {
	if it.interactive == nil {
		return
	}

	it.cancel()

	if it.exposure != nil {
		closeErr := it.exposure.Close()
		it.exposure = nil
		if closeErr != nil {
			it.task.Warnf("[interactive] could not terminate interactive exposure: %v", closeErr)
		}
	}
}

func (it *InteractiveTask) uploadInteractiveArtifact() error {
	var err error
	it.exposure, err = exposer.ExposeHTTP(it.interactive.TCPPort)
	if err != nil {
		return err
	}

	// combine the path from the interactive URL with the expose URL
	interactiveURL, err := url.Parse(it.interactive.GetURL)
	if err != nil {
		return err
	}
	exposeURL := it.exposure.GetURL()
	if exposeURL.Path == "/" {
		exposeURL.Path = interactiveURL.Path
	} else {
		exposeURL.Path = path.Join(exposeURL.Path, interactiveURL.Path)
	}
	if exposeURL.Scheme == "https" {
		exposeURL.Scheme = "wss"
	} else {
		exposeURL.Scheme = "ws"
	}

	// query params required in ui/src/views/Shell/index.jsx
	queryParams := url.Values{}
	queryParams.Set("v", "2")
	queryParams.Set("socketUrl", exposeURL.String())
	queryParams.Set("taskId", it.task.TaskID)
	queryParams.Set("runId", strconv.FormatUint(uint64(it.task.RunID), 10))

	// defined in ui/src/App/routes.jsx
	shellPath := "/shell/"
	u, err := url.Parse(config.RootURL + shellPath)
	if err != nil {
		return err
	}
	u.RawQuery = queryParams.Encode()
	url := u.String()

	expires := time.Now().Add(time.Duration(it.task.Payload.MaxRunTime+900) * time.Second)
	uploadErr := it.task.uploadArtifact(
		&artifacts.RedirectArtifact{
			BaseArtifact: &artifacts.BaseArtifact{
				Name:    it.artifactName,
				Expires: tcclient.Time(expires),
			},
			ContentType: "text/html; charset=utf-8",
			URL:         url,
		},
	)

	if uploadErr != nil {
		return uploadErr
	}

	it.task.Infof("[interactive] session available at %s", url)

	return nil
}
