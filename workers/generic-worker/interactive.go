package main

import (
	"context"
	"log"
	"net/url"
	"strconv"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v49/clients/client-go"
	"github.com/taskcluster/taskcluster/v49/internal/scopes"
	"github.com/taskcluster/taskcluster/v49/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v49/workers/generic-worker/expose"
	"github.com/taskcluster/taskcluster/v49/workers/generic-worker/interactive"
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
		artifactName: "private/generic-worker/shell.html", // TODO: make configurable?
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
	ctx, cancel := context.WithCancel(context.Background())
	interactive, err := interactive.New(config.InteractivePort, ctx)
	if err != nil {
		log.Printf("WARNING: could not create interactive session: %v", err)
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
		log.Printf("WARNING: could not upload interactive artifact: %v", err)
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

	errTerminate := it.interactive.Terminate()
	if errTerminate != nil {
		// no need to raise an exception
		log.Printf("WARNING: could not terminate interactive writer: %s", errTerminate)
	}

	if it.exposure != nil {
		closeErr := it.exposure.Close()
		it.exposure = nil
		if closeErr != nil {
			log.Printf("WARNING: could not terminate interactive exposure: %s", closeErr)
		}
	}
}

func (it *InteractiveTask) uploadInteractiveArtifact() error {
	var err error
	it.exposure, err = exposer.ExposeTCPPort(it.interactive.TCPPort)
	if err != nil {
		return err
	}

	// defined in ui/src/App/routes.jsx
	path := "/shell/"
	// query params required in ui/src/views/Shell/index.jsx
	queryParams := url.Values{}
	queryParams.Set("v", "2")
	socketURL := it.exposure.GetURL()
	if socketURL.Scheme == "https" {
		socketURL.Scheme = "wss"
	} else if socketURL.Scheme == "http" {
		socketURL.Scheme = "ws"
	}
	queryParams.Set("socketUrl", socketURL.String())
	queryParams.Set("taskId", it.task.TaskID)
	queryParams.Set("runId", strconv.FormatUint(uint64(it.task.RunID), 10))
	u, err := url.Parse(config.RootURL + path)
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

	return nil
}
