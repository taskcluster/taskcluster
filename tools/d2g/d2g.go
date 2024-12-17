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
	"github.com/taskcluster/taskcluster/v77/internal/scopes"
	"github.com/taskcluster/taskcluster/v77/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v77/tools/d2g/genericworker"

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
		FileMounts(tool string) ([]genericworker.FileMount, error)
		String(tool string) (string, error)
		LoadCommands(tool string) []string
	}
)

func ConvertTaskDefinition(dwTaskDef json.RawMessage, config map[string]interface{}, scopeExpander scopes.ScopeExpander) (json.RawMessage, error) {
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

	gwPayload, err := ConvertPayload(dwPayload, config)
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
		parsedTaskDef["scopes"], err = ConvertScopes(dwScopes, dwPayload, taskQueueID, config["containerEngine"].(string), scopeExpander)
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
func ConvertScopes(dwScopes []string, dwPayload *dockerworker.DockerWorkerPayload, taskQueueID, containerEngine string, scopeExpander scopes.ScopeExpander) (gwScopes []string, err error) {
	var expandedScopes scopes.Given
	expandedScopes, err = validateDockerWorkerScopes(dwPayload, dwScopes, taskQueueID, scopeExpander)
	if err != nil {
		return
	}
	tool := getContainerEngine(dwPayload, containerEngine)
	gwScopes = make([]string, len(dwScopes))
	copy(gwScopes, dwScopes)
	if tool == "docker" {
		// scopes to use docker, by default, should just come "for free"
		gwScopes = append(gwScopes, "generic-worker:os-group:"+taskQueueID+"/docker")
	}
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
func ConvertPayload(dwPayload *dockerworker.DockerWorkerPayload, config map[string]interface{}) (gwPayload *genericworker.GenericWorkerPayload, err error) {
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
	tool := getContainerEngine(dwPayload, config["containerEngine"].(string))
	err = setCommand(dwPayload, gwPayload, dwImage, tool, gwWritableDirectoryCaches, config)
	if err != nil {
		return
	}
	gwFileMounts, err := dwImage.FileMounts(tool)
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
	setOSGroups(dwPayload, gwPayload, tool, config)

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

func command(dwPayload *dockerworker.DockerWorkerPayload, dwImage Image, tool string, gwArtifacts []genericworker.Artifact, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, config map[string]interface{}) ([][]string, error) {
	containerName := ""
	if len(gwArtifacts) > 0 {
		if testing.Testing() {
			containerName = "taskcontainer"
		} else {
			containerName = "taskcontainer_" + slugid.Nice()
		}
	}

	commands := []string{}
	commands = append(commands, dwImage.LoadCommands(tool)...)
	runString, err := runCommand(containerName, dwPayload, dwImage, gwWritableDirectoryCaches, tool, config)
	if err != nil {
		return nil, fmt.Errorf("could not form %v run command: %w", tool, err)
	}

	commands = append(
		commands,
		runString,
	)

	if containerName != "" {
		commands = append(
			commands,
			"exit_code=$?",
		)
	}

	commands = append(
		commands,
		copyArtifacts(containerName, dwPayload, gwArtifacts, tool)...,
	)
	if dwPayload.Features.DockerSave {
		commands = append(
			commands,
			tool+" commit "+containerName+" "+containerName,
			tool+" save "+containerName+" | gzip > image.tar.gz",
		)
	}

	if containerName != "" {
		commands = append(
			commands,
			tool+" rm "+containerName,
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

func runCommand(containerName string, dwPayload *dockerworker.DockerWorkerPayload, dwImage Image, wdcs []genericworker.WritableDirectoryCache, tool string, config map[string]interface{}) (string, error) {
	command := strings.Builder{}
	// Docker Worker used to attach a pseudo tty, see:
	// https://github.com/taskcluster/taskcluster/blob/6b99f0ef71d9d8628c50adc17424167647a1c533/workers/docker-worker/src/task.js#L384
	switch containerName {
	case "":
		command.WriteString(tool + " run -t --rm")
	default:
		command.WriteString(fmt.Sprintf("timeout -s KILL %v %v run -t --name %v", dwPayload.MaxRunTime, tool, containerName))
	}
	// Do not limit resource usage by the containerName. See
	// https://docs.podman.io/en/latest/markdown/podman-run.1.html
	// and https://docs.docker.com/reference/cli/docker/container/run/
	command.WriteString(" --memory-swap -1 --pids-limit -1")
	// Only podman supports inheriting host ulimits. `docker` uses docker
	// daemon settings by default.
	// Also, only podman supports mapping uids
	if tool == "podman" {
		command.WriteString(" --ulimit host")

		if len(dwPayload.Cache) > 0 {
			// We map uids and gids to help avoid issues with permissions within the container
			// on mounted volumes.
			// Cribbed from https://stackoverflow.com/questions/70770437/mapping-of-user-ids
			// and https://github.com/containers/podman/blob/main/troubleshooting.md#solution-36
			// This _should_ be able to be simplified to `--userns=keep-id:uid=1000,gid=1000`
			// when we can assume podman 4.3.0 or above. See:
			// https://docs.podman.io/en/v4.4/markdown/options/userns.container.html

			// We start mapping at the non-reserved UIDs and GIDs
			uidStart := 1000
			gidStart := 1000
			// The number of UIDs and GIDs we map. Ideally this would come from running
			// `podman info` (see details in the above links), but this only works when
			// running as a non-root user, which is not possible here. This value was
			// found experimentally on an Ubuntu 22.04 worker and may not work
			// universally.
			mappingRange := 64536
			// Map `uidStart` in the container to your normal UID on the host.
			command.WriteString(fmt.Sprintf(" --uidmap %v:0:1", uidStart))
			// Map the UIDs between 0 and `uidStart` - 1 in the container to the
			// lower part of the subuids.
			command.WriteString(fmt.Sprintf(" --uidmap 0:1:%v", uidStart))
			// Map the UIDs between $uid+1 and 64536 in the container to the remaining subuids.
			// Ideally 64536 would be pulled from `podman info` running as a task user,
			// but we're running as root here, so we can't do that.
			command.WriteString(fmt.Sprintf(" --uidmap %v:%v:%v", uidStart+1, uidStart+1, mappingRange))
			// Same thing for GIDs
			command.WriteString(fmt.Sprintf(" --gidmap %v:0:1", gidStart))
			command.WriteString(fmt.Sprintf(" --gidmap 0:1:%v", gidStart))
			command.WriteString(fmt.Sprintf(" --gidmap %v:%v:%v", gidStart+1, gidStart+1, mappingRange))
		}
	}
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
	dockerImageString, err := dwImage.String(tool)
	if err != nil {
		return "", fmt.Errorf("could not form docker image string: %w", err)
	}
	// note, dockerImageString is already shell escaped
	command.WriteString(" " + dockerImageString)
	command.WriteString(" " + shell.Escape(dwPayload.Command...))
	return command.String(), nil
}

func copyArtifacts(containerName string, dwPayload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact, tool string) []string {
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
		commands = append(commands, fmt.Sprintf("%v cp %s:%s %s", tool, containerName, shell.Escape(dwPayload.Artifacts[gwArtifacts[i].Name].Path), shell.Escape(gwArtifacts[i].Path)))
	}
	return commands
}

func setEnv(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload) {
	gwPayload.Env = dwPayload.Env
}

func setFeatures(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, config map[string]interface{}) {
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

func setCommand(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, dwImage Image, tool string, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache, config map[string]interface{}) (err error) {
	gwPayload.Command, err = command(dwPayload, dwImage, tool, gwPayload.Artifacts, gwWritableDirectoryCaches, config)
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

func setOSGroups(dwPayload *dockerworker.DockerWorkerPayload, gwPayload *genericworker.GenericWorkerPayload, tool string, config map[string]interface{}) {
	if dwPayload.Capabilities.Devices.KVM && config["allowKVM"].(bool) {
		// task user needs to be in kvm and libvirt groups for KVM to work:
		// https://help.ubuntu.com/community/KVM/Installation
		gwPayload.OSGroups = append(gwPayload.OSGroups, "kvm", "libvirt")
	}
	if tool == "docker" {
		gwPayload.OSGroups = append(gwPayload.OSGroups, "docker")
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

func createVolumeMountsString(dwPayload *dockerworker.DockerWorkerPayload, wdcs []genericworker.WritableDirectoryCache, config map[string]interface{}) string {
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

func envMappings(dwPayload *dockerworker.DockerWorkerPayload, config map[string]interface{}) string {
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

func getContainerEngine(dwPayload *dockerworker.DockerWorkerPayload, containerEngine string) string {
	tool := containerEngine
	if dwPayload.Capabilities.ContainerEngine != "" {
		tool = dwPayload.Capabilities.ContainerEngine
	}
	return tool
}
