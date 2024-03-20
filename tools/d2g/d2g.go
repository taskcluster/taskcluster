//go:generate go run ../../workers/generic-worker/gw-codegen file://../../workers/docker-worker/schemas/v1/payload.yml dockerworker/generated_types.go
//go:generate go run ../../workers/generic-worker/gw-codegen file://../../workers/generic-worker/schemas/multiuser_posix.yml genericworker/generated_types.go

package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/taskcluster/taskcluster/v63/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v63/tools/d2g/genericworker"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/shell"
)

type (
	DockerImageName     string
	IndexedDockerImage  dockerworker.IndexedDockerImage
	NamedDockerImage    dockerworker.NamedDockerImage
	DockerImageArtifact dockerworker.DockerImageArtifact
	Image               interface {
		FileMounts() ([]genericworker.FileMount, error)
		String() (string, error)
	}
)

func ConvertTaskDefinition(dwTaskDef json.RawMessage) (json.RawMessage, error) {
	var gwTaskDef json.RawMessage
	var parsedTaskDef map[string]interface{}
	err := json.Unmarshal(dwTaskDef, &parsedTaskDef)
	if err != nil {
		return nil, fmt.Errorf("cannot parse task definition: %v", err)
	}

	if _, exists := parsedTaskDef["payload"]; !exists {
		return nil, fmt.Errorf("task definition does not contain a payload")
	}

	dwPayload := new(dockerworker.DockerWorkerPayload)
	defaults.SetDefaults(dwPayload)
	dwPayloadJSON, err := json.Marshal(parsedTaskDef["payload"])
	if err != nil {
		return nil, fmt.Errorf("cannot marshal Docker Worker payload: %v", err)
	}
	err = json.Unmarshal(dwPayloadJSON, &dwPayload)
	if err != nil {
		return nil, fmt.Errorf("cannot unmarshal Docker Worker payload: %v", err)
	}

	gwPayload, err := Convert(dwPayload)
	if err != nil {
		return nil, fmt.Errorf("cannot convert Docker Worker payload: %v", err)
	}

	if scopes, exists := parsedTaskDef["scopes"]; exists {
		var dwScopes []string
		for _, scope := range scopes.([]interface{}) {
			dwScopes = append(dwScopes, scope.(string))
		}
		var taskQueueID string
		if parsedTaskDef["taskQueueId"] == nil {
			if parsedTaskDef["provisionerId"] == nil || parsedTaskDef["workerType"] == nil {
				return nil, fmt.Errorf("taskQueueId ('provisionerId/workerType') is required")
			}
			taskQueueID = fmt.Sprintf("%s/%s", parsedTaskDef["provisionerId"].(string), parsedTaskDef["workerType"].(string))
		} else {
			taskQueueID = parsedTaskDef["taskQueueId"].(string)
		}
		if taskQueueID == "" {
			return nil, fmt.Errorf("taskQueueId ('provisionerId/workerType') is required")
		}
		parsedTaskDef["scopes"] = Scopes(dwScopes, dwPayload, taskQueueID)
	}

	d2gConvertedPayloadJSON, err := json.Marshal(*gwPayload)
	if err != nil {
		return nil, fmt.Errorf("cannot marshal Generic Worker payload: %v", err)
	}

	parsedTaskDef["payload"] = json.RawMessage(d2gConvertedPayloadJSON)

	gwTaskDef, err = json.MarshalIndent(parsedTaskDef, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("cannot marshal Generic Worker task definition: %v", err)
	}

	return json.RawMessage(gwTaskDef), nil
}

// Scopes takes a slice of Docker Worker task scopes and returns a slice of
// equivalent Generic Worker scopes. These scopes should be used together with
// a converted Docker Worker task payload (see d2g.Convert function) to run
// Docker Worker tasks under Generic Worker.
func Scopes(dwScopes []string, dwPayload *dockerworker.DockerWorkerPayload, taskQueueID string) (gwScopes []string) {
	gwScopes = make([]string, len(dwScopes))
	for i, s := range dwScopes {
		switch true {
		case s == "docker-worker:capability:device:loopbackVideo":
			gwScopes[i] = "generic-worker:loopback-video:*"
		case strings.HasPrefix(s, "docker-worker:capability:device:loopbackVideo:"):
			gwScopes[i] = "generic-worker:loopback-video:" + s[len("docker-worker:capability:device:loopbackVideo:"):]
		case s == "docker-worker:capability:device:loopbackAudio":
			gwScopes[i] = "generic-worker:loopback-audio:*"
		case strings.HasPrefix(s, "docker-worker:capability:device:loopbackAudio:"):
			gwScopes[i] = "generic-worker:loopback-audio:" + s[len("docker-worker:capability:device:loopbackAudio:"):]
		case strings.HasPrefix(s, "docker-worker:"):
			gwScopes[i] = "generic-worker:" + s[len("docker-worker:"):]
		default:
			gwScopes[i] = s
		}
	}

	if dwPayload != nil && dwPayload.Capabilities.Devices.KVM {
		gwScopes = append(gwScopes, fmt.Sprintf("generic-worker:os-group:%s/kvm", taskQueueID))
	}

	return
}

// Dev notes: https://docs.google.com/document/d/1QNfHVpxtzXAlLWqZNz3b5mvbQWOrtsWpvadJHiMNbRc/edit#heading=h.uib8l9zhaz1n

// Convert transforms a Docker Worker task payload into an equivalent Generic
// Worker Multiuser POSIX task payload. The resulting Generic Worker payload is
// a BASH script which uses Podman to contain the Docker Worker payload. Since
// scopes fall outside of the payload in a task definition, scopes need to be
// converted separately (see d2g.Scopes function).
func Convert(dwPayload *dockerworker.DockerWorkerPayload) (gwPayload *genericworker.GenericWorkerPayload, err error) {
	gwPayload = new(genericworker.GenericWorkerPayload)
	defaults.SetDefaults(gwPayload)

	setArtifacts(dwPayload, gwPayload)

	gwWritableDirectoryCaches := writableDirectoryCaches(dwPayload.Cache)
	dwImage, err := imageObject(&dwPayload.Image)
	if err != nil {
		return
	}
	switch dwImage.(type) {
	case *IndexedDockerImage:
		// we want to be sure that TaskclusterProxy
		// is enabled for IndexedDockerImages
		// during the remainder of this translation
		// it's used to access the index service API
		gwPayload.Features.TaskclusterProxy = true
	}
	err = setCommand(dwPayload, gwPayload, dwImage, gwWritableDirectoryCaches)
	if err != nil {
		return
	}
	gwFileMounts, err := dwImage.FileMounts()
	if err != nil {
		return
	}
	err = setMounts(gwPayload, gwWritableDirectoryCaches, gwFileMounts)
	if err != nil {
		return
	}

	setEnv(dwPayload, gwPayload)
	setFeatures(dwPayload, gwPayload)
	setLogs(dwPayload, gwPayload)
	setMaxRunTime(dwPayload, gwPayload)
	setOnExitStatus(dwPayload, gwPayload)
	setSupersederURL(dwPayload, gwPayload)
	setOSGroups(dwPayload, gwPayload)

	return
}

func mounts(gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, gwFileMounts []genericworker.FileMount) (result []json.RawMessage, err error) {
	result = make([]json.RawMessage, 0, len(gwWritableDirectoryCaches)+len(gwFileMounts))
	marshalAndAddToSlice := func(i interface{}) {
		var bytes []byte
		bytes, err = json.Marshal(i)
		if err != nil {
			err = fmt.Errorf("cannot convert a genericworker.WritableDirectoryCache to json: %w", err)
			return
		}
		result = append(result, json.RawMessage(bytes))
	}
	for _, wdc := range gwWritableDirectoryCaches {
		marshalAndAddToSlice(wdc)
	}
	for _, fm := range gwFileMounts {
		marshalAndAddToSlice(fm)
	}
	return
}

func artifacts(dwPayload *dockerworker.DockerWorkerPayload) []genericworker.Artifact {
	gwArtifacts := make([]genericworker.Artifact, len(dwPayload.Artifacts))
	names := make([]string, len(dwPayload.Artifacts))
	i := 0
	for name := range dwPayload.Artifacts {
		names[i] = name
		i++
	}
	sort.Strings(names)
	for i, name := range names {
		gwArt := new(genericworker.Artifact)
		defaults.SetDefaults(gwArt)

		gwArt.Expires = dwPayload.Artifacts[name].Expires
		gwArt.Name = name
		ext := filepath.Ext(dwPayload.Artifacts[name].Path)
		gwArt.Path = "artifact" + strconv.Itoa(i) + ext
		gwArt.Type = dwPayload.Artifacts[name].Type

		gwArtifacts[i] = *gwArt
	}

	if dwPayload.Features.DockerSave {
		gwArt := new(genericworker.Artifact)
		defaults.SetDefaults(gwArt)

		gwArt.Name = "public/dockerImage.tar.gz"
		gwArt.Path = "image.tar.gz"
		gwArt.Type = "file"

		gwArtifacts = append(gwArtifacts, *gwArt)
	}

	return gwArtifacts
}

func command(dwPayload *dockerworker.DockerWorkerPayload, dwImage Image, gwArtifacts []genericworker.Artifact, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache) ([][]string, error) {
	containerName := ""
	if len(gwArtifacts) > 0 {
		containerName = "taskcontainer"
	}

	commands := []string{}

	podmanRunString, err := podmanRunCommand(containerName, dwPayload, dwImage, gwWritableDirectoryCaches)
	if err != nil {
		return nil, fmt.Errorf("could not form podman run command: %w", err)
	}

	commands = append(
		commands,
		podmanRunString,
	)

	if containerName != "" {
		commands = append(
			commands,
			"exit_code=$?",
		)
	}

	commands = append(
		commands,
		podmanCopyArtifacts(containerName, dwPayload, gwArtifacts)...,
	)
	if dwPayload.Features.DockerSave {
		commands = append(
			commands,
			"podman commit "+containerName+" "+containerName,
			"podman save "+containerName+" | gzip > image.tar.gz",
		)
	}

	if containerName != "" {
		commands = append(
			commands,
			"podman rm "+containerName,
			`exit "${exit_code}"`,
		)
	}

	return [][]string{
		{
			"bash",
			"-cx",
			strings.Join(commands, "\n"),
		},
	}, nil
}

func podmanRunCommand(containerName string, dwPayload *dockerworker.DockerWorkerPayload, dwImage Image, wdcs []genericworker.WritableDirectoryCache) (string, error) {
	command := strings.Builder{}
	// Docker Worker used to attach a pseudo tty, see:
	// https://github.com/taskcluster/taskcluster/blob/6b99f0ef71d9d8628c50adc17424167647a1c533/workers/docker-worker/src/task.js#L384
	switch containerName {
	case "":
		command.WriteString("podman run -t --rm")
	default:
		command.WriteString(fmt.Sprintf("timeout %v podman run -t --name %v", dwPayload.MaxRunTime, containerName))
	}
	// Sometimes --privileged is needed, even where there are no capabilities
	// defined. Therefore always add it, regardless. See e.g.
	// https://github.com/taskcluster/taskcluster/issues/6888
	command.WriteString(" --privileged")
	if dwPayload.Capabilities.DisableSeccomp {
		command.WriteString(" --security-opt=seccomp=unconfined")
	}
	if dwPayload.Features.AllowPtrace {
		command.WriteString(" --cap-add=SYS_PTRACE")
	}
	command.WriteString(createVolumeMountsString(dwPayload, wdcs))
	if dwPayload.Features.TaskclusterProxy {
		command.WriteString(" --add-host=taskcluster:127.0.0.1 --net=host")
	}
	command.WriteString(podmanEnvMappings(dwPayload))
	dockerImageString, err := dwImage.String()
	if err != nil {
		return "", fmt.Errorf("could not form docker image string: %w", err)
	}
	// note, dockerImageString is already shell escaped
	command.WriteString(" " + dockerImageString)
	command.WriteString(" " + shell.Escape(dwPayload.Command...))
	return command.String(), nil
}

func podmanCopyArtifacts(containerName string, dwPayload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact) []string {
	commands := []string{}
	for i := range gwArtifacts {
		// An image artifact will be in the generic worker payload
		// when dockerSave is enabled. That artifact will not be
		// found in either the docker worker payload or the container
		// after the podman run command is complete, so no podman cp
		// command is needed for it.
		// The image artifact is created after the podman run
		// command is complete.
		if _, ok := dwPayload.Artifacts[gwArtifacts[i].Name]; !ok {
			continue
		}
		commands = append(commands, fmt.Sprintf("podman cp %s:%s %s", containerName, shell.Escape(dwPayload.Artifacts[gwArtifacts[i].Name].Path), shell.Escape(gwArtifacts[i].Path)))
	}
	return commands
}

func setEnv(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.Env = dwPayload.Env
}

func setFeatures(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.Features.ChainOfTrust = dwPayload.Features.ChainOfTrust
	// need to keep TaskclusterProxy to true if it's already been enabled for IndexedDockerImages
	gwPayload.Features.TaskclusterProxy = gwPayload.Features.TaskclusterProxy || dwPayload.Features.TaskclusterProxy
	gwPayload.Features.Interactive = dwPayload.Features.Interactive
	gwPayload.Features.LoopbackVideo = dwPayload.Capabilities.Devices.LoopbackVideo
	gwPayload.Features.LoopbackAudio = dwPayload.Capabilities.Devices.LoopbackAudio

	switch dwPayload.Features.Artifacts {
	case true:
		gwPayload.Features.LiveLog = dwPayload.Features.LocalLiveLog
		gwPayload.Features.BackingLog = dwPayload.Features.BulkLog
	case false:
		gwPayload.Features.BackingLog = false
		gwPayload.Features.LiveLog = false
	}
}

func setArtifacts(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	if dwPayload.Features.Artifacts {
		gwPayload.Artifacts = artifacts(dwPayload)
	}
}

func setCommand(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, dwImage Image, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache) (err error) {
	gwPayload.Command, err = command(dwPayload, dwImage, gwPayload.Artifacts, gwWritableDirectoryCaches)
	return
}

func setMounts(gwPayload *genericworker.GenericWorkerPayload, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, gwFileMounts []genericworker.FileMount) (err error) {
	gwPayload.Mounts, err = mounts(gwWritableDirectoryCaches, gwFileMounts)
	return
}

func setMaxRunTime(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.MaxRunTime = dwPayload.MaxRunTime
	if len(gwPayload.Artifacts) > 0 {
		// Add 15 minutes as buffer for task to be able to upload artifacts
		gwPayload.MaxRunTime += 900
	}
}

func setOnExitStatus(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.OnExitStatus.Retry = dwPayload.OnExitStatus.Retry
	gwPayload.OnExitStatus.PurgeCaches = dwPayload.OnExitStatus.PurgeCaches

	appendIfNotPresent := func(exitCode int64) {
		for _, retryCode := range gwPayload.OnExitStatus.Retry {
			if retryCode == exitCode {
				return
			}
		}
		gwPayload.OnExitStatus.Retry = append(gwPayload.OnExitStatus.Retry, exitCode)
	}

	// An error sometimes occurs while pulling the docker image:
	// Error: reading blob sha256:<SHA>: Get "<URL>": remote error: tls: handshake failure
	// And this exits 125, so we'd like to retry.
	// Another error sometimes occurs while pulling the docker image:
	// error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)
	// And this exits 128, so we'd like to retry.
	appendIfNotPresent(125)
	appendIfNotPresent(128)
}

func setSupersederURL(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.SupersederURL = dwPayload.SupersederURL
}

func setOSGroups(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	if dwPayload.Capabilities.Devices.KVM {
		// task user needs to be in the kvm group for KVM to work
		// https://help.ubuntu.com/community/KVM/Installation
		gwPayload.OSGroups = append(gwPayload.OSGroups, "kvm")
	}
}

func writableDirectoryCaches(caches map[string]string) []genericworker.WritableDirectoryCache {
	wdcs := make([]genericworker.WritableDirectoryCache, len(caches))
	i := 0
	for cacheName := range caches {
		wdc := new(genericworker.WritableDirectoryCache)
		defaults.SetDefaults(wdc)

		wdc.CacheName = cacheName
		wdc.Directory = "cache" + strconv.Itoa(i)

		wdcs[i] = *wdc
		i++
	}
	return wdcs
}

func setLogs(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.Logs.Live = dwPayload.Log
	gwPayload.Logs.Backing = createBackingLogName(dwPayload.Log)
}

func createBackingLogName(log string) string {
	return filepath.Join(filepath.Dir(log), fileNameWithoutExtension(filepath.Base(log))+"_backing"+filepath.Ext(log))
}

func fileNameWithoutExtension(fileName string) string {
	return strings.TrimSuffix(fileName, filepath.Ext(fileName))
}

func createVolumeMountsString(dwPayload *dockerworker.DockerWorkerPayload, wdcs []genericworker.WritableDirectoryCache) string {
	volumeMounts := strings.Builder{}
	for _, wdc := range wdcs {
		volumeMounts.WriteString(` -v "$(pwd)/` + wdc.Directory + ":" + dwPayload.Cache[wdc.CacheName] + `"`)
	}
	if dwPayload.Capabilities.Devices.KVM {
		volumeMounts.WriteString(" --device=/dev/kvm")
	}
	if dwPayload.Capabilities.Devices.HostSharedMemory {
		volumeMounts.WriteString(" --device=/dev/shm")
	}
	if dwPayload.Capabilities.Devices.LoopbackVideo {
		volumeMounts.WriteString(` --device="${TASKCLUSTER_VIDEO_DEVICE}"`)
	}
	if dwPayload.Capabilities.Devices.LoopbackAudio {
		volumeMounts.WriteString(" --device=/dev/snd")
	}
	return volumeMounts.String()
}

func podmanEnvSetting(envVarName string) string {
	return fmt.Sprintf(" -e %s", shell.Escape(envVarName))
}

func imageObject(payloadImage *json.RawMessage) (Image, error) {
	var parsed interface{}
	err := json.Unmarshal(*payloadImage, &parsed)
	if err != nil {
		return nil, fmt.Errorf("cannot parse docker image: %w", err)
	}
	switch val := parsed.(type) {
	case string:
		din := DockerImageName(val)
		return &din, nil
	case map[string]interface{}: // NamedDockerImage|IndexedDockerImage|DockerImageArtifact
		switch val["type"] {
		case "docker-image": // NamedDockerImage
			namedDockerImage := NamedDockerImage{}
			err = json.Unmarshal(*payloadImage, &namedDockerImage)
			return &namedDockerImage, err
		case "indexed-image": // IndexedDockerImage
			indexDockerImage := IndexedDockerImage{}
			err = json.Unmarshal(*payloadImage, &indexDockerImage)
			return &indexDockerImage, err
		case "task-image": // DockerImageArtifact
			dockerImageArtifact := DockerImageArtifact{}
			err = json.Unmarshal(*payloadImage, &dockerImageArtifact)
			return &dockerImageArtifact, err
		default:
			return nil, fmt.Errorf("parsed docker image %#v is not of a supported type: %w", val, err)
		}
	default:
		return nil, fmt.Errorf("parsed docker image is not of a supported type: %w", err)
	}
}

func podmanEnvMappings(dwPayload *dockerworker.DockerWorkerPayload) string {
	envStrBuilder := strings.Builder{}

	dwManagedEnvVars := []string{
		"RUN_ID",
		"TASKCLUSTER_ROOT_URL",
		"TASK_ID",
		"TASKCLUSTER_WORKER_LOCATION",
	}

	if dwPayload.Features.TaskclusterProxy {
		dwManagedEnvVars = append(dwManagedEnvVars, "TASKCLUSTER_PROXY_URL")
	}

	envVarNames := []string{}
	for envVarName := range dwPayload.Env {
		envVarNames = append(envVarNames, envVarName)
	}
	envVarNames = append(envVarNames, dwManagedEnvVars...)
	sort.Strings(envVarNames)
	for _, envVarName := range envVarNames {
		envStrBuilder.WriteString(podmanEnvSetting(envVarName))
	}
	return envStrBuilder.String()
}
