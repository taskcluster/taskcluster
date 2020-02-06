package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/ghodss/yaml"
	"github.com/taskcluster/shell"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

// Data types that map to sections of tasks.yml
type (
	TasksConfig struct {
		Types       map[string]*Type       `json:"Types"`
		Tasks       map[string][]*Task     `json:"Tasks"`
		WorkerPools map[string]*WorkerPool `json:"WorkerPools"`
		Commands    map[string]*CommandSet `json:"Commands"`
		Mounts      map[string]*Mount      `json:"Mounts"`
	}
	Type struct {
		Name        string                 `json:"Name"`
		Description string                 `json:"Description"`
		Mounts      []string               `json:"Mounts"`
		Command     string                 `json:"Command"`
		Features    map[string]interface{} `json:"Features"`
		Scopes      []string               `json:"Scopes"`
		Artifacts   []*Artifact            `json:"Artifacts"`
		MaxRunTime  uint                   `json:"MaxRunTime"`
	}
	Artifact struct {
		Name string `json:"name"`
		Path string `json:"path"`
		Type string `json:"type"`
	}
	Task struct {
		WorkerPool string            `json:"WorkerPool"`
		Env        map[string]string `json:"Env"`
	}
	WorkerPool struct {
		Platform string `json:"Platform"`
		OS       string `json:"OS"`
		Arch     string `json:"Arch"`
	}
	CommandSet struct {
		Posix   [][]string `json:"Posix"`
		Windows []string   `json:"Windows"`
	}
	Mount struct {
		Directory string                         `json:"directory"`
		File      string                         `json:"file"`
		Content   map[string]map[string]*Content `json:"content"`
	}
	Content struct {
		URL    string `json:"url"`
		SHA256 string `json:"sha256"`
		Format string `json:"format"`
	}
)

// Internal types used by program
type (
	DecisionTask struct {
		TasksConfig *TasksConfig
		TaskID      string
		TaskGroupID string
	}
	TaskGroup struct {
		// map from taskID to task definition
		taskDefs map[string]*tcqueue.TaskDefinitionRequest
	}
)

func main() {
	if len(os.Args) != 3 {
		log.Printf("Usage: %v TASKS_YAML_FILE GIT_REVISION", os.Args[0])
		log.Fatalf("You ran: %v", shell.Escape(os.Args...))
	}
	decisionTask, err := NewDecisionTask(os.Args[1], os.Args[2])
	if err != nil {
		log.Fatalf("%s", err)
	}
	err = decisionTask.Execute()
	if err != nil {
		log.Fatalf("%s", err)
	}
}

func NewDecisionTask(yamlPath string, gitRevision string) (*DecisionTask, error) {
	absYAMLPath, err := filepath.Abs(yamlPath)
	if err != nil {
		return nil, fmt.Errorf("Could not determine absolute file location of decision task YAML config file %q: %s", yamlPath, err)
	}
	data, err := ioutil.ReadFile(absYAMLPath)
	if err != nil {
		return nil, fmt.Errorf("Could not read decision task YAML config file %q: %s", absYAMLPath, err)
	}
	// JSON is valid YAML, so we can safely convert, even if it is already JSON
	rawJSON, err := yaml.YAMLToJSON(data)
	if err != nil {
		return nil, fmt.Errorf("Could not interpret decision task YAML config file %q as YAML: %s", absYAMLPath, err)
	}
	tc := new(TasksConfig)
	dec := json.NewDecoder(bytes.NewBuffer(rawJSON))
	dec.DisallowUnknownFields()
	err = dec.Decode(tc)
	if err != nil {
		return nil, fmt.Errorf("Decision task YAML config file %q has invalid content: %s", absYAMLPath, err)
	}

	d := &DecisionTask{
		TasksConfig: tc,
	}
	// TaskID will be "" if running outside of taskcluster, e.g. locally by a developer
	d.TaskID = os.Getenv("TASK_ID")
	if d.TaskID != "" {
		d.TaskGroupID = d.TaskID
	} else {
		// If running decision task code outside of taskcluster (e.g. developer
		// manually runs `gw-decision-task tasks.yml`), then still generate
		// tasks, but do not make them dependent on the decision task, since
		// there isn't one. However, still place all generated tasks in the
		// same task group, so create a new taskGroupId.
		d.TaskGroupID = slugid.Nice()
	}
	return d, nil
}

func (dt *DecisionTask) Execute() (err error) {
	tasks, err := dt.GenerateTasks()
	if err != nil {
		return err
	}
	return tasks.Submit()
}

func (dt *DecisionTask) GenerateTasks() (*TaskGroup, error) {
	tg := &TaskGroup{
		taskDefs: map[string]*tcqueue.TaskDefinitionRequest{},
	}
	for taskType, tasks := range dt.TasksConfig.Tasks {
		for _, task := range tasks {

			typ := dt.TasksConfig.Types[taskType]

			workerPool := dt.TasksConfig.WorkerPools[task.WorkerPool]
			commandSet := dt.TasksConfig.Commands[typ.Command]

			// context contains all variable names that can be referred to in
			// task name/description, artifact name/path in ${VARNAME} format
			context := map[string]string{
				"PLATFORM": workerPool.Platform,
				"OS":       workerPool.OS,
				"ARCH":     workerPool.Arch,
			}
			// add task env vars to context, so that task name/description
			// can refer to them
			for k, v := range task.Env {
				context[k] = v
			}
			var command interface{}
			if workerPool.OS == "windows" {
				command = commandSet.Windows
				context["EXTENSION"] = ".exe"
			} else {
				command = commandSet.Posix
				context["EXTENSION"] = ""
			}

			taskName := substituteVars(context, typ.Name)
			taskDescription := substituteVars(context, typ.Description)

			mounts := []map[string]interface{}{}

			for _, mountName := range typ.Mounts {
				mount := dt.TasksConfig.Mounts[mountName]
				osContent := mount.Content[workerPool.OS]
				if osContent == nil {
					osContent = mount.Content["all"]
				}
				content := osContent[workerPool.Arch]
				if content == nil {
					content = osContent["all"]
				}
				if content != nil {
					mountEntry := map[string]interface{}{
						"content": map[string]string{
							"url":    content.URL,
							"sha256": content.SHA256,
						},
					}
					if mount.Directory != "" {
						mountEntry["directory"] = mount.Directory
					}
					if mount.File != "" {
						mountEntry["file"] = mount.File
					}
					if content.Format != "" {
						mountEntry["format"] = content.Format
					}
					mounts = append(mounts, mountEntry)
				}
			}

			payload := map[string]interface{}{
				"env": map[string]string{
					"GITHUB_SHA":       os.Getenv("GITHUB_SHA"),
					"GITHUB_CLONE_URL": os.Getenv("GITHUB_CLONE_URL"),
				},
			}
			for k, v := range task.Env {
				payload["env"].(map[string]string)[k] = v
			}
			if typ.MaxRunTime > 0 {
				payload["maxRunTime"] = typ.MaxRunTime
			}
			artifacts := make([]*Artifact, len(typ.Artifacts), len(typ.Artifacts))
			for i, a := range typ.Artifacts {
				artifacts[i] = &Artifact{
					Name: substituteVars(context, a.Name),
					Path: substituteVars(context, a.Path),
					Type: a.Type,
				}
			}
			for key, value := range map[string]interface{}{
				"artifacts": artifacts,
				"command":   command,
				"features":  typ.Features,
				"mounts":    mounts,
			} {
				if reflect.ValueOf(value).IsValid() {
					if !reflect.ValueOf(value).IsNil() {
						payload[key] = value
					}
				}
			}
			scopes := typ.Scopes
			td, err := dt.TaskDefinition(task.WorkerPool, taskName, taskDescription, scopes, payload)
			if err != nil {
				return nil, err
			}
			tg.taskDefs[slugid.Nice()] = td
		}
	}
	return tg, nil
}

func substituteVars(context map[string]string, expression string) string {
	result := expression
	for k, v := range context {
		result = strings.Replace(result, "${"+k+"}", v, -1)
	}
	return result
}

func (dt *DecisionTask) TaskDefinition(workerPool string, name string, description string, scopes []string, payload interface{}) (*tcqueue.TaskDefinitionRequest, error) {
	workerPoolSplit := strings.Split(workerPool, "/")
	if len(workerPoolSplit) != 2 {
		return nil, fmt.Errorf("Worker pool %q should contain precisely one '/' but contains %v", workerPool, len(workerPoolSplit))
	}
	provisionerID := workerPoolSplit[0]
	workerType := workerPoolSplit[1]

	var dependencies []string
	var schedulerID string
	// Are we running inside a task, or being run e.g. locally by a developer?
	if dt.TaskID != "" {
		dependencies = []string{dt.TaskID}
		schedulerID = "taskcluster-github"
	} else {
		dependencies = []string{}
		schedulerID = "-"
	}

	payloadBytes, err := json.MarshalIndent(payload, "", "  ")
	log.Printf("Payload:\n\n%v\n\n", string(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("Cannot convert payload %#v to JSON: %s", payload, err)
	}

	created := time.Now()
	deadline := created.AddDate(0, 0, 1)
	expires := deadline.AddDate(1, 0, 0)
	return &tcqueue.TaskDefinitionRequest{
		Created:      tcclient.Time(created),
		Deadline:     tcclient.Time(deadline),
		Dependencies: dependencies,
		Expires:      tcclient.Time(expires),
		Metadata: tcqueue.TaskMetadata{
			Description: description,
			Name:        name,
			Owner:       "taskcluster-internal@mozilla.com",
			Source:      "https://github.com/taskcluster/generic-worker",
		},
		Payload:       json.RawMessage(payloadBytes),
		ProvisionerID: provisionerID,
		SchedulerID:   schedulerID,
		Scopes:        scopes,
		TaskGroupID:   dt.TaskGroupID,
		WorkerType:    workerType,
	}, nil
}

func (tg *TaskGroup) Submit() error {
	queue := tcqueue.NewFromEnv()
	for taskID, tdr := range tg.taskDefs {
		resp, err := queue.CreateTask(taskID, tdr)
		if err != nil {
			return fmt.Errorf("Error submitting task:\n%#v\n\n%s", *tdr, err)
		}
		fmt.Printf("Task %v %v...\n", taskID, resp.Status.State)
	}
	return nil
}
