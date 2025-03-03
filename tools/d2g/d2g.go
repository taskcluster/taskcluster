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
	"testing"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v83/internal/scopes"
	"github.com/taskcluster/taskcluster/v83/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v83/tools/d2g/genericworker"

	"slices"

	"github.com/mcuadros/go-defaults"
	"github.com/taskcluster/shell"
)

var MaxArtifactCopyDuration int64 = 900

type (
	DockerImageName     string
	IndexedDockerImage  dockerworker.IndexedDockerImage
	NamedDockerImage    dockerworker.NamedDockerImage
	DockerImageArtifact dockerworker.DockerImageArtifact
	Image               interface {
		FileMounts() ([]genericworker.FileMount, error)
		String() string
		ImageLoader() ImageLoader
	}
	ImageLoader interface {
		LoadCommands() []string
		ChainOfTrustCommands() []string
	}
	ConversionInfo struct {
		ContainerName string
	}
	FileImageLoader struct {
		Image Image
	}
	RegistryImageLoader struct {
		Image Image
	}
)

func ConvertTaskDefinition(dwTaskDef json.RawMessage, config map[string]any, scopeExpander scopes.ScopeExpander) (json.RawMessage, error) {
	var gwTaskDef json.RawMessage
	var parsedTaskDef map[string]any
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

	gwPayload, _, err := ConvertPayload(dwPayload, config)
	if err != nil {
		return nil, fmt.Errorf("cannot convert Docker Worker payload: %v", err)
	}

	if scopes, exists := parsedTaskDef["scopes"]; exists {
		var dwScopes []string
		for _, scope := range scopes.([]any) {
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
		parsedTaskDef["scopes"], err = ConvertScopes(dwScopes, dwPayload, taskQueueID, scopeExpander)
		if err != nil {
			return nil, fmt.Errorf("cannot convert scopes: %v", err)
		}
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

// ConvertScopes takes a slice of Docker Worker task scopes and returns a slice of
// equivalent Generic Worker scopes. These scopes should be used together with
// a converted Docker Worker task payload (see d2g.Convert function) to run
// Docker Worker tasks under Generic Worker.
func ConvertScopes(dwScopes []string, dwPayload *dockerworker.DockerWorkerPayload, taskQueueID string, scopeExpander scopes.ScopeExpander) (gwScopes []string, err error) {
	var expandedScopes scopes.Given
	expandedScopes, err = validateDockerWorkerScopes(dwPayload, dwScopes, taskQueueID, scopeExpander)
	if err != nil {
		return
	}
	gwScopes = make([]string, len(dwScopes))
	copy(gwScopes, dwScopes)
	// scopes to use docker, by default, should just come "for free"
	gwScopes = append(gwScopes, "generic-worker:os-group:"+taskQueueID+"/docker")
	for _, s := range expandedScopes {
		switch true {
		case s == "docker-worker:capability:device:kvm":
			gwScopes = append(
				gwScopes,
				"generic-worker:os-group:"+taskQueueID+"/kvm",
				"generic-worker:os-group:"+taskQueueID+"/libvirt",
			)
		case strings.HasPrefix(s, "docker-worker:capability:device:kvm:"):
			gwScopes = append(
				gwScopes,
				"generic-worker:os-group:"+s[len("docker-worker:capability:device:kvm:"):]+"/kvm",
				"generic-worker:os-group:"+s[len("docker-worker:capability:device:kvm:"):]+"/libvirt",
			)
		case s == "docker-worker:capability:device:loopbackVideo":
			gwScopes = append(gwScopes, "generic-worker:loopback-video:*")
		case strings.HasPrefix(s, "docker-worker:capability:device:loopbackVideo:"):
			gwScopes = append(gwScopes, "generic-worker:loopback-video:"+s[len("docker-worker:capability:device:loopbackVideo:"):])
		case s == "docker-worker:capability:device:loopbackAudio":
			gwScopes = append(gwScopes, "generic-worker:loopback-audio:*")
		case strings.HasPrefix(s, "docker-worker:capability:device:loopbackAudio:"):
			gwScopes = append(gwScopes, "generic-worker:loopback-audio:"+s[len("docker-worker:capability:device:loopbackAudio:"):])
		case strings.HasPrefix(s, "docker-worker:"):
			gwScopes = append(gwScopes, "generic-worker:"+s[len("docker-worker:"):])
		}
	}

	sort.Strings(gwScopes)

	return
}

// Dev notes: https://docs.google.com/document/d/1QNfHVpxtzXAlLWqZNz3b5mvbQWOrtsWpvadJHiMNbRc/edit#heading=h.uib8l9zhaz1n

// ConvertPayload transforms a Docker Worker task payload into an equivalent Generic
// Worker Multiuser POSIX task payload. The resulting Generic Worker payload is
// a BASH script which uses Docker (by default) to contain the Docker Worker payload. Since
// scopes fall outside of the payload in a task definition, scopes need to be
// converted separately (see d2g.ConvertScopes function).
func ConvertPayload(dwPayload *dockerworker.DockerWorkerPayload, config map[string]any) (gwPayload *genericworker.GenericWorkerPayload, conversionInfo ConversionInfo, err error) {
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
	containerName, err := setCommand(dwPayload, gwPayload, dwImage, gwWritableDirectoryCaches, config)
	if err != nil {
		return
	}
	conversionInfo.ContainerName = containerName

	gwFileMounts, err := dwImage.FileMounts()
	if err != nil {
		return
	}
	err = setMounts(gwPayload, gwWritableDirectoryCaches, gwFileMounts)
	if err != nil {
		return
	}

	setEnv(dwPayload, gwPayload)
	setFeatures(dwPayload, gwPayload, config)
	setLogs(dwPayload, gwPayload)
	setMaxRunTime(dwPayload, gwPayload)
	setOnExitStatus(dwPayload, gwPayload)
	setSupersederURL(dwPayload, gwPayload)
	setOSGroups(dwPayload, gwPayload, config)

	return
}

func validateDockerWorkerScopes(dwPayload *dockerworker.DockerWorkerPayload, dwScopes []string, taskQueueID string, scopeExpander scopes.ScopeExpander) (scopes.Given, error) {
	expandedScopes, err := scopes.Given(dwScopes).Expand(scopeExpander)
	if err != nil {
		return nil, fmt.Errorf("error expanding scopes: %v", err)
	}

	dummyExpander := scopes.DummyExpander()
	var requiredScopes scopes.Required

	if dwPayload.Capabilities.Privileged {
		requiredScopes = append(requiredScopes,
			[]string{"docker-worker:capability:privileged"},
			[]string{fmt.Sprintf("docker-worker:capability:privileged:%s", taskQueueID)},
		)
	}

	if dwPayload.Capabilities.Devices.HostSharedMemory {
		requiredScopes = append(requiredScopes,
			[]string{"docker-worker:capability:device:hostSharedMemory"},
			[]string{fmt.Sprintf("docker-worker:capability:device:hostSharedMemory:%s", taskQueueID)},
		)
	}

	if dwPayload.Capabilities.Devices.KVM {
		requiredScopes = append(requiredScopes,
			[]string{"docker-worker:capability:device:kvm"},
			[]string{fmt.Sprintf("docker-worker:capability:device:kvm:%s", taskQueueID)},
		)
	}

	if dwPayload.Capabilities.Devices.LoopbackAudio {
		requiredScopes = append(requiredScopes,
			[]string{"docker-worker:capability:device:loopbackAudio"},
			[]string{fmt.Sprintf("docker-worker:capability:device:loopbackAudio:%s", taskQueueID)},
		)
	}

	if dwPayload.Capabilities.Devices.LoopbackVideo {
		requiredScopes = append(requiredScopes,
			[]string{"docker-worker:capability:device:loopbackVideo"},
			[]string{fmt.Sprintf("docker-worker:capability:device:loopbackVideo:%s", taskQueueID)},
		)
	}

	if dwPayload.Features.AllowPtrace {
		requiredScopes = append(requiredScopes,
			[]string{"docker-worker:feature:allowPtrace"},
		)
	}

	scopesSatisfied, err := expandedScopes.Satisfies(requiredScopes, dummyExpander)
	if err != nil {
		return nil, fmt.Errorf("error expanding scopes: %v", err)
	}
	if !scopesSatisfied {
		return nil, fmt.Errorf("d2g task requires scopes:\n\n%v\n\nbut task only has scopes:\n\n%v\n\nYou probably should add some scopes to your task definition", requiredScopes, expandedScopes)
	}

	return expandedScopes, nil
}

func mounts(gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, gwFileMounts []genericworker.FileMount) (result []json.RawMessage, err error) {
	result = make([]json.RawMessage, 0, len(gwWritableDirectoryCaches)+len(gwFileMounts))
	marshalAndAddToSlice := func(i any) {
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
		gwArt.Optional = true

		gwArtifacts[i] = *gwArt
	}

	if dwPayload.Features.DockerSave {
		gwArt := new(genericworker.Artifact)
		defaults.SetDefaults(gwArt)

		gwArt.Name = "public/dockerImage.tar.gz"
		gwArt.Path = "image.tar.gz"
		gwArt.Type = "file"
		gwArt.Optional = true

		gwArtifacts = append(gwArtifacts, *gwArt)
	}

	return gwArtifacts
}

func command(dwPayload *dockerworker.DockerWorkerPayload, dwImage Image, gwArtifacts []genericworker.Artifact, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, config map[string]any) ([][]string, string, error) {
	containerName := ""
	if testing.Testing() {
		containerName = "taskcontainer"
	} else {
		containerName = "taskcontainer_" + slugid.Nice()
	}

	commands := []string{}

	imageLoader := dwImage.ImageLoader()

	commands = append(
		commands,
		imageLoader.LoadCommands()...,
	)

	if dwPayload.Features.ChainOfTrust {
		commands = append(
			commands,
			imageLoader.ChainOfTrustCommands()...,
		)
	}

	runString, err := runCommand(containerName, dwPayload, dwImage, gwWritableDirectoryCaches, config)
	if err != nil {
		return nil, containerName, fmt.Errorf("could not form docker run command: %w", err)
	}

	commands = append(
		commands,
		runString,
		"exit_code=$?",
	)

	commands = append(
		commands,
		copyArtifacts(containerName, dwPayload, gwArtifacts)...,
	)
	if dwPayload.Features.DockerSave {
		commands = append(
			commands,
			"docker commit "+containerName+" "+containerName,
			"docker save "+containerName+" | gzip > image.tar.gz",
		)
	}

	commands = append(
		commands,
		"docker rm -v "+containerName,
		`exit "${exit_code}"`,
	)

	return [][]string{
		{
			"bash",
			"-cx",
			strings.Join(commands, "\n"),
		},
	}, containerName, nil
}

func runCommand(containerName string, dwPayload *dockerworker.DockerWorkerPayload, dwImage Image, wdcs []genericworker.WritableDirectoryCache, config map[string]any) (string, error) {
	command := strings.Builder{}
	// Docker Worker used to attach a pseudo tty, see:
	// https://github.com/taskcluster/taskcluster/blob/6b99f0ef71d9d8628c50adc17424167647a1c533/workers/docker-worker/src/task.js#L384
	command.WriteString(fmt.Sprintf("timeout -s KILL %v docker run -t --name %v", dwPayload.MaxRunTime, containerName))

	// Do not limit resource usage by the containerName. See
	// https://docs.docker.com/reference/cli/docker/container/run/
	command.WriteString(" --memory-swap -1 --pids-limit -1")
	if dwPayload.Capabilities.Privileged && config["allowPrivileged"].(bool) {
		command.WriteString(" --privileged")
	} else if dwPayload.Features.AllowPtrace && config["allowPtrace"].(bool) {
		command.WriteString(" --cap-add=SYS_PTRACE")
	}
	if dwPayload.Capabilities.DisableSeccomp && config["allowDisableSeccomp"].(bool) {
		command.WriteString(" --security-opt=seccomp=unconfined")
	}
	command.WriteString(createVolumeMountsString(dwPayload, wdcs, config))
	if dwPayload.Features.TaskclusterProxy && config["allowTaskclusterProxy"].(bool) {
		command.WriteString(" --add-host=taskcluster:127.0.0.1 --net=host")
	}
	if config["allowGPUs"].(bool) {
		command.WriteString(" --gpus " + config["gpus"].(string))
	}
	command.WriteString(envMappings(dwPayload, config))
	// note, dwImage.String() is already shell escaped
	command.WriteString(" " + dwImage.String())
	command.WriteString(" " + shell.Escape(dwPayload.Command...))
	return command.String(), nil
}

func copyArtifacts(containerName string, dwPayload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact) []string {
	commands := []string{}
	for i := range gwArtifacts {
		// An image artifact will be in the generic worker payload when
		// dockerSave is enabled. That artifact will not be found in either the
		// docker worker payload or the container after the run command is
		// complete, so no cp command is needed for it. The image artifact is
		// created after the run command is complete.
		if _, ok := dwPayload.Artifacts[gwArtifacts[i].Name]; !ok {
			continue
		}
		commands = append(commands, fmt.Sprintf("docker cp %s:%s %s", containerName, shell.Escape(dwPayload.Artifacts[gwArtifacts[i].Name].Path), shell.Escape(gwArtifacts[i].Path)))
	}
	return commands
}

func setEnv(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.Env = dwPayload.Env
}

func setFeatures(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, config map[string]any) {
	if config["allowChainOfTrust"].(bool) {
		gwPayload.Features.ChainOfTrust = dwPayload.Features.ChainOfTrust
	}
	if config["allowTaskclusterProxy"].(bool) {
		// need to keep TaskclusterProxy to true if it's already been enabled for IndexedDockerImages
		gwPayload.Features.TaskclusterProxy = gwPayload.Features.TaskclusterProxy || dwPayload.Features.TaskclusterProxy
	}
	if config["allowInteractive"].(bool) {
		gwPayload.Features.Interactive = dwPayload.Features.Interactive
	}
	if config["allowLoopbackAudio"].(bool) {
		gwPayload.Features.LoopbackAudio = dwPayload.Capabilities.Devices.LoopbackAudio
	}
	if config["allowLoopbackVideo"].(bool) {
		gwPayload.Features.LoopbackVideo = dwPayload.Capabilities.Devices.LoopbackVideo
	}

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

func setCommand(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, dwImage Image, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, config map[string]any) (containerName string, err error) {
	gwPayload.Command, containerName, err = command(dwPayload, dwImage, gwPayload.Artifacts, gwWritableDirectoryCaches, config)
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
		gwPayload.MaxRunTime += MaxArtifactCopyDuration
	}
}

func setOnExitStatus(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.OnExitStatus.Retry = dwPayload.OnExitStatus.Retry
	gwPayload.OnExitStatus.PurgeCaches = dwPayload.OnExitStatus.PurgeCaches

	appendIfNotPresent := func(exitCode int64) {
		if slices.Contains(gwPayload.OnExitStatus.Retry, exitCode) {
			return
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

func setOSGroups(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, config map[string]any) {
	if dwPayload.Capabilities.Devices.KVM && config["allowKVM"].(bool) {
		// task user needs to be in kvm and libvirt groups for KVM to work:
		// https://help.ubuntu.com/community/KVM/Installation
		gwPayload.OSGroups = append(gwPayload.OSGroups, "kvm", "libvirt")
	}
	gwPayload.OSGroups = append(gwPayload.OSGroups, "docker")
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

func createVolumeMountsString(dwPayload *dockerworker.DockerWorkerPayload, wdcs []genericworker.WritableDirectoryCache, config map[string]any) string {
	volumeMounts := strings.Builder{}
	for _, wdc := range wdcs {
		volumeMounts.WriteString(` -v "$(pwd)/` + wdc.Directory + ":" + dwPayload.Cache[wdc.CacheName] + `"`)
	}
	if dwPayload.Capabilities.Devices.KVM && config["allowKVM"].(bool) {
		volumeMounts.WriteString(" --device=/dev/kvm")
	}
	if dwPayload.Capabilities.Devices.HostSharedMemory && config["allowHostSharedMemory"].(bool) {
		// need to use volume mount here otherwise we get
		// docker: Error response from daemon: error
		// gathering device information while adding
		// custom device "/dev/shm": not a device node
		volumeMounts.WriteString(" -v /dev/shm:/dev/shm")
	}
	if dwPayload.Capabilities.Devices.LoopbackVideo && config["allowLoopbackVideo"].(bool) {
		volumeMounts.WriteString(` --device="${TASKCLUSTER_VIDEO_DEVICE}"`)
	}
	if dwPayload.Capabilities.Devices.LoopbackAudio && config["allowLoopbackAudio"].(bool) {
		volumeMounts.WriteString(" --device=/dev/snd")
	}
	return volumeMounts.String()
}

func envSetting(envVarName string) string {
	return fmt.Sprintf(" -e %s", shell.Escape(envVarName))
}

func imageObject(payloadImage *json.RawMessage) (Image, error) {
	var parsed any
	err := json.Unmarshal(*payloadImage, &parsed)
	if err != nil {
		return nil, fmt.Errorf("cannot parse docker image: %w", err)
	}
	switch val := parsed.(type) {
	case string:
		din := DockerImageName(val)
		return &din, nil
	case map[string]any: // NamedDockerImage|IndexedDockerImage|DockerImageArtifact
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

func envMappings(dwPayload *dockerworker.DockerWorkerPayload, config map[string]any) string {
	envStrBuilder := strings.Builder{}

	additionalEnvVars := []string{
		"RUN_ID",
		"TASKCLUSTER_INSTANCE_TYPE",
		"TASKCLUSTER_ROOT_URL",
		"TASKCLUSTER_WORKER_LOCATION",
		"TASK_GROUP_ID", // note, docker-worker didn't set this, but decision tasks may in future choose to use it if it is set
		"TASK_ID",
	}

	if dwPayload.Features.TaskclusterProxy && config["allowTaskclusterProxy"].(bool) {
		additionalEnvVars = append(additionalEnvVars, "TASKCLUSTER_PROXY_URL")
	}

	if dwPayload.Capabilities.Devices.LoopbackVideo && config["allowLoopbackVideo"].(bool) {
		additionalEnvVars = append(additionalEnvVars, "TASKCLUSTER_VIDEO_DEVICE")
	}

	envVarNames := []string{}
	for envVarName := range dwPayload.Env {
		envVarNames = append(envVarNames, envVarName)
	}
	envVarNames = append(envVarNames, additionalEnvVars...)
	sort.Strings(envVarNames)
	for _, envVarName := range envVarNames {
		envStrBuilder.WriteString(envSetting(envVarName))
	}
	return envStrBuilder.String()
}

func (fil *FileImageLoader) LoadCommands() []string {
	return []string{
		`IMAGE_ID=$(docker load --input dockerimage | sed -n '0,/^Loaded image: /s/^Loaded image: //p')`,
	}
}

func (fil *FileImageLoader) ChainOfTrustCommands() []string {
	return []string{
		`echo '{"environment":{"imageHash":"'"$(docker inspect --format='{{index .Id}}' ` + fil.Image.String() + `)"'","imageArtifactHash":"sha256:'"$(sha256sum dockerimage | sed 's/ .*//')"'"}}' > chain-of-trust-additional-data.json`,
	}
}

func (ril *RegistryImageLoader) LoadCommands() []string {
	return []string{
		"docker pull " + ril.Image.String(),
	}
}

func (ril *RegistryImageLoader) ChainOfTrustCommands() []string {
	return []string{
		`echo '{"environment":{"imageHash":"'"$(docker inspect --format='{{index .Id}}' ` + ril.Image.String() + `)"'"}}' > chain-of-trust-additional-data.json`,
	}
}
