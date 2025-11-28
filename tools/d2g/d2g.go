//go:generate go run ../../workers/generic-worker/gw-codegen file://../../workers/docker-worker/schemas/v1/payload.yml dockerworker/generated_types.go
//go:generate go run ../../workers/generic-worker/gw-codegen file://../../workers/generic-worker/schemas/multiuser_posix.yml genericworker/generated_types.go

package d2g

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster/v94/internal/scopes"
	"github.com/taskcluster/taskcluster/v94/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v94/tools/d2g/genericworker"

	"slices"

	"github.com/mcuadros/go-defaults"
)

type (
	DockerImageName     string
	IndexedDockerImage  dockerworker.IndexedDockerImage
	NamedDockerImage    dockerworker.NamedDockerImage
	DockerImageArtifact dockerworker.DockerImageArtifact
	Image               interface {
		FileMounts() ([]genericworker.FileMount, error)
		String() string
	}
	ConversionInfo struct {
		ContainerName string
		CopyArtifacts []CopyArtifact
		EnvVars       string
		Image         Image
	}
	CopyArtifact struct {
		Name     string
		SrcPath  string
		DestPath string
	}
	FileImageLoader struct {
		Image Image
	}
	RegistryImageLoader struct {
		Image Image
	}
	Config struct {
		EnableD2G             bool   `json:"enableD2G"`
		AllowChainOfTrust     bool   `json:"allowChainOfTrust"`
		AllowDisableSeccomp   bool   `json:"allowDisableSeccomp"`
		AllowGPUs             bool   `json:"allowGPUs"`
		AllowHostSharedMemory bool   `json:"allowHostSharedMemory"`
		AllowInteractive      bool   `json:"allowInteractive"`
		AllowKVM              bool   `json:"allowKVM"`
		AllowLoopbackAudio    bool   `json:"allowLoopbackAudio"`
		AllowLoopbackVideo    bool   `json:"allowLoopbackVideo"`
		AllowPrivileged       bool   `json:"allowPrivileged"`
		AllowPtrace           bool   `json:"allowPtrace"`
		AllowTaskclusterProxy bool   `json:"allowTaskclusterProxy"`
		GPUs                  string `json:"gpus"`
		LogTranslation        bool   `json:"logTranslation"`
	}
)

func ConvertTaskDefinition(
	dwTaskDef json.RawMessage,
	config Config,
	scopeExpander scopes.ScopeExpander,
	directoryReader func(string) ([]os.DirEntry, error),
) (json.RawMessage, error) {
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

	gwPayload, _, err := ConvertPayload(dwPayload, config, directoryReader)
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
func ConvertScopes(
	dwScopes []string,
	dwPayload *dockerworker.DockerWorkerPayload,
	taskQueueID string,
	scopeExpander scopes.ScopeExpander,
) (gwScopes []string, err error) {
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
		case s == "docker-worker:capability:device:kvm":
			gwScopes = AppendQueueScopes(gwScopes, taskQueueID, "kvm")
			gwScopes = AppendQueueScopes(gwScopes, taskQueueID, "libvirt")
		}
	}

	slices.Sort(gwScopes)

	return
}

// Dev notes: https://docs.google.com/document/d/1QNfHVpxtzXAlLWqZNz3b5mvbQWOrtsWpvadJHiMNbRc/edit#heading=h.uib8l9zhaz1n

// ConvertPayload transforms a Docker Worker task payload into an equivalent Generic
// Worker Multiuser POSIX task payload. The resulting Generic Worker payload is
// a BASH script which uses Docker (by default) to contain the Docker Worker payload. Since
// scopes fall outside of the payload in a task definition, scopes need to be
// converted separately (see d2g.ConvertScopes function).
func ConvertPayload(
	dwPayload *dockerworker.DockerWorkerPayload,
	config Config,
	directoryReader func(string) ([]os.DirEntry, error),
) (gwPayload *genericworker.GenericWorkerPayload, conversionInfo ConversionInfo, err error) {
	gwPayload = new(genericworker.GenericWorkerPayload)
	defaults.SetDefaults(gwPayload)

	setArtifacts(dwPayload, gwPayload)

	var nonEnvListArgs []string
	conversionInfo.EnvVars, nonEnvListArgs = envMappings(dwPayload, config)

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
	containerName, err := setCommand(dwPayload, gwPayload, dwImage, gwWritableDirectoryCaches, nonEnvListArgs, config, directoryReader)
	if err != nil {
		return
	}
	conversionInfo.ContainerName = containerName
	conversionInfo.CopyArtifacts = copyArtifacts(dwPayload, gwPayload.Artifacts)
	conversionInfo.Image = dwImage

	gwFileMounts, err := dwImage.FileMounts()
	if err != nil {
		return
	}
	err = setMounts(gwPayload, gwWritableDirectoryCaches, gwFileMounts)
	if err != nil {
		return
	}

	setFeatures(dwPayload, gwPayload, config)
	setLogs(dwPayload, gwPayload)
	setMaxRunTime(dwPayload, gwPayload)
	setOnExitStatus(dwPayload, gwPayload)
	setSupersederURL(dwPayload, gwPayload)
	setOSGroups(gwPayload)
	gwPayload.TaskclusterProxyInterface = "docker-bridge"

	return
}

func validateDockerWorkerScopes(
	dwPayload *dockerworker.DockerWorkerPayload,
	dwScopes []string,
	taskQueueID string,
	scopeExpander scopes.ScopeExpander,
) (scopes.Given, error) {
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

func mounts(
	gwWritableDirectoryCaches []genericworker.WritableDirectoryCache,
	gwFileMounts []genericworker.FileMount,
) (result []json.RawMessage, err error) {
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
	slices.Sort(names)
	for i, name := range names {
		gwArt := new(genericworker.Artifact)
		defaults.SetDefaults(gwArt)

		gwArt.Expires = dwPayload.Artifacts[name].Expires
		gwArt.Name = name
		ext := filepath.Ext(dwPayload.Artifacts[name].Path)
		if dwPayload.Artifacts[name].Type == "volume" {
			gwArt.Path = "volume" + strconv.Itoa(i) + ext
			// Generic Worker treats Docker Worker
			// volume artifacts as a directory artifact
			gwArt.Type = "directory"
		} else {
			gwArt.Path = "artifact" + strconv.Itoa(i) + ext
			gwArt.Type = dwPayload.Artifacts[name].Type
		}
		gwArt.Optional = true

		gwArtifacts[i] = *gwArt
	}

	return gwArtifacts
}

func runCommand(
	dwPayload *dockerworker.DockerWorkerPayload,
	dwImage Image,
	gwArtifacts []genericworker.Artifact,
	wdcs []genericworker.WritableDirectoryCache,
	nonEnvListArgs []string,
	config Config,
	directoryReader func(string) ([]os.DirEntry, error),
) ([][]string, string, error) {
	containerName := "taskcontainer"
	if !testing.Testing() {
		containerName = fmt.Sprintf("%s_%s", containerName, slugid.Nice())
	}

	// Docker Worker used to attach a pseudo tty, see:
	// https://github.com/taskcluster/taskcluster/blob/6b99f0ef71d9d8628c50adc17424167647a1c533/workers/docker-worker/src/task.js#L384
	args := []string{"docker", "run", "-t", "--name", containerName}

	// Do not limit resource usage by the containerName. See
	// https://docs.docker.com/reference/cli/docker/container/run/
	args = append(args, "--memory-swap", "-1", "--pids-limit", "-1")

	if dwPayload.Capabilities.Privileged && config.AllowPrivileged {
		args = append(args, "--privileged")
	} else if dwPayload.Features.AllowPtrace && config.AllowPtrace {
		args = append(args, "--cap-add=SYS_PTRACE")
	}

	if dwPayload.Capabilities.DisableSeccomp && config.AllowDisableSeccomp {
		args = append(args, "--security-opt=seccomp=unconfined")
	}

	args = append(args, "--add-host=localhost.localdomain:127.0.0.1") // bug 1559766
	args = append(args, createVolumeMountArgs(dwPayload, wdcs, gwArtifacts, config)...)

	if dwPayload.Features.TaskclusterProxy && config.AllowTaskclusterProxy {
		args = append(args, "--add-host=taskcluster:host-gateway")
	}

	if config.AllowGPUs {
		args = append(args, "--gpus", config.GPUs)
		entries, err := directoryReader("/dev")
		if err != nil {
			return nil, "", fmt.Errorf("cannot read /dev to find nvidia devices")
		}
		for _, e := range entries {
			deviceName := e.Name()
			if strings.HasPrefix(deviceName, "nvidia") {
				args = append(args, "--device=/dev/"+deviceName)
			}
		}
	}

	args = append(args, nonEnvListArgs...)
	// Use env file that's created by D2G task feature
	args = append(args, "--env-file", "env.list")
	args = append(args, dwImage.String())
	args = append(args, dwPayload.Command...)

	return [][]string{args}, containerName, nil
}

func copyArtifacts(dwPayload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact) []CopyArtifact {
	artifacts := []CopyArtifact{}
	for i := range gwArtifacts {
		// Volume artifact mounts do not need to be copied
		if dwPayload.Artifacts[gwArtifacts[i].Name].Type == "volume" {
			continue
		}
		artifacts = append(artifacts,
			CopyArtifact{
				Name:     gwArtifacts[i].Name,
				SrcPath:  dwPayload.Artifacts[gwArtifacts[i].Name].Path,
				DestPath: gwArtifacts[i].Path,
			},
		)
	}
	return artifacts
}

func setFeatures(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, config Config) {
	if config.AllowChainOfTrust {
		gwPayload.Features.ChainOfTrust = dwPayload.Features.ChainOfTrust
	}
	if config.AllowTaskclusterProxy {
		// need to keep TaskclusterProxy to true if it's already been enabled for IndexedDockerImages
		gwPayload.Features.TaskclusterProxy = gwPayload.Features.TaskclusterProxy || dwPayload.Features.TaskclusterProxy
	}
	if config.AllowInteractive {
		gwPayload.Features.Interactive = dwPayload.Features.Interactive
	}
	if config.AllowLoopbackAudio {
		gwPayload.Features.LoopbackAudio = dwPayload.Capabilities.Devices.LoopbackAudio
	}
	if config.AllowLoopbackVideo {
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

func setCommand(
	dwPayload *dockerworker.DockerWorkerPayload,
	gwPayload *genericworker.GenericWorkerPayload,
	dwImage Image,
	gwWritableDirectoryCaches []genericworker.WritableDirectoryCache,
	nonEnvListArgs []string,
	config Config,
	directoryReader func(string) ([]os.DirEntry, error),
) (containerName string, err error) {
	gwPayload.Command, containerName, err = runCommand(dwPayload, dwImage, gwPayload.Artifacts, gwWritableDirectoryCaches, nonEnvListArgs, config, directoryReader)
	if err != nil {
		return "", fmt.Errorf("cannot create run command: %v", err)
	}
	return
}

func setMounts(
	gwPayload *genericworker.GenericWorkerPayload,
	gwWritableDirectoryCaches []genericworker.WritableDirectoryCache,
	gwFileMounts []genericworker.FileMount,
) (err error) {
	gwPayload.Mounts, err = mounts(gwWritableDirectoryCaches, gwFileMounts)
	return
}

func setMaxRunTime(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.MaxRunTime = dwPayload.MaxRunTime
}

func setOnExitStatus(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.OnExitStatus.Retry = dwPayload.OnExitStatus.Retry
	gwPayload.OnExitStatus.PurgeCaches = dwPayload.OnExitStatus.PurgeCaches
}

func setSupersederURL(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.SupersederURL = dwPayload.SupersederURL
}

func setOSGroups(gwPayload *genericworker.GenericWorkerPayload) {
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

func createVolumeMountArgs(
	dwPayload *dockerworker.DockerWorkerPayload,
	wdcs []genericworker.WritableDirectoryCache,
	gwArtifacts []genericworker.Artifact,
	config Config,
) []string {
	var args []string
	for _, wdc := range wdcs {
		args = append(args, "-v", fmt.Sprintf("__TASK_DIR__/%s:%s", wdc.Directory, dwPayload.Cache[wdc.CacheName]))
	}
	for _, gwArtifact := range gwArtifacts {
		if strings.HasPrefix(gwArtifact.Path, "volume") {
			args = append(args, "-v", fmt.Sprintf("__TASK_DIR__/%s:%s", gwArtifact.Path, dwPayload.Artifacts[gwArtifact.Name].Path))
		}
	}
	if dwPayload.Capabilities.Devices.KVM && config.AllowKVM {
		args = append(args, "--device=/dev/kvm")
	}
	if dwPayload.Capabilities.Devices.HostSharedMemory && config.AllowHostSharedMemory {
		// need to use volume mount here otherwise we get
		// docker: Error response from daemon: error
		// gathering device information while adding
		// custom device "/dev/shm": not a device node
		args = append(args, "-v", "/dev/shm:/dev/shm")
	}
	if dwPayload.Capabilities.Devices.LoopbackVideo && config.AllowLoopbackVideo {
		args = append(args, "--device=__TASKCLUSTER_VIDEO_DEVICE__")
	}
	if dwPayload.Capabilities.Devices.LoopbackAudio && config.AllowLoopbackAudio {
		args = append(args, "--device=/dev/snd")
	}
	return args
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

func envMappings(dwPayload *dockerworker.DockerWorkerPayload, config Config) (string, []string) {
	envListStrBuilder := strings.Builder{}
	nonEnvListArgs := []string{}

	additionalEnvVars := []string{
		"RUN_ID",
		"TASKCLUSTER_INSTANCE_TYPE",
		"TASKCLUSTER_ROOT_URL",
		"TASKCLUSTER_WORKER_LOCATION",
		"TASK_GROUP_ID", // note, docker-worker didn't set this, but decision tasks may in future choose to use it if it is set
		"TASK_ID",
	}

	if dwPayload.Features.TaskclusterProxy && config.AllowTaskclusterProxy {
		additionalEnvVars = append(additionalEnvVars, "TASKCLUSTER_PROXY_URL")
	}

	if dwPayload.Capabilities.Devices.LoopbackVideo && config.AllowLoopbackVideo {
		additionalEnvVars = append(additionalEnvVars, "TASKCLUSTER_VIDEO_DEVICE")
	}

	envVars := []string{}
	nonEnvListVars := []string{}
	for envVarName, value := range dwPayload.Env {
		keyValue := fmt.Sprintf("%s=%s", envVarName, value)
		// Env vars with newlines cannot be passed via --env-file
		// as they would be interpreted as multiple env vars.
		// Also, long env vars (over 64KiB) cannot be used in
		// --env-file as docker fails with: bufio.Scanner: token too long
		// see https://github.com/taskcluster/taskcluster/issues/7974
		if strings.Contains(value, "\n") || len(keyValue) > 65536 {
			nonEnvListVars = append(
				nonEnvListVars,
				envVarName,
			)
			continue
		}
		envVars = append(envVars, keyValue)
	}
	slices.Sort(nonEnvListVars)
	for _, envVarName := range nonEnvListVars {
		nonEnvListArgs = append(
			nonEnvListArgs,
			"-e",
			fmt.Sprintf("%s=%s", envVarName, dwPayload.Env[envVarName]),
		)
	}
	envVars = append(envVars, additionalEnvVars...)
	slices.Sort(envVars)
	for _, envVar := range envVars {
		envListStrBuilder.WriteString(envVar + "\n")
	}
	return envListStrBuilder.String(), nonEnvListArgs
}

func AppendQueueScopes(gwScopes []string, taskQueueID, capability string) []string {
	return append(gwScopes,
		fmt.Sprintf("generic-worker:os-group:%s/%s", taskQueueID, capability),
	)
}
