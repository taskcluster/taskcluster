package d2g

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/taskcluster/d2g/dockerworker"
	"github.com/taskcluster/d2g/genericworker"
	"github.com/taskcluster/shell"
)

var dwManagedEnvVars = []string{
	"RUN_ID",
	"TASKCLUSTER_PROXY_URL",
	"TASKCLUSTER_ROOT_URL",
	"TASK_ID",
	"TASKCLUSTER_WORKER_LOCATION",
}

type (
	DockerImageName     string
	IndexedDockerImage  dockerworker.IndexedDockerImage
	NamedDockerImage    dockerworker.NamedDockerImage
	DockerImageArtifact dockerworker.DockerImageArtifact
	Image               interface {
		PrepareCommands() []string
		FileMounts() ([]genericworker.FileMount, error)
		String() (string, error)
	}
)

// Dev notes: https://docs.google.com/document/d/1QNfHVpxtzXAlLWqZNz3b5mvbQWOrtsWpvadJHiMNbRc/edit#heading=h.uib8l9zhaz1n

func Convert(dwPayload *dockerworker.DockerWorkerPayload) (gwPayload *genericworker.GenericWorkerPayload, err error) {
	gwArtifacts := artifacts(dwPayload.Artifacts)
	gwWritableDirectoryCaches := writableDirectoryCaches(dwPayload.Cache)
	dwImage, err := imageObject(&dwPayload.Image)
	if err != nil {
		return
	}
	gwFileMounts, err := dwImage.FileMounts()
	if err != nil {
		return
	}
	var gwCommand [][]string
	gwCommand, err = command(dwPayload, dwImage, gwArtifacts, gwWritableDirectoryCaches)
	if err != nil {
		return
	}
	var gwMounts []json.RawMessage
	gwMounts, err = mounts(gwWritableDirectoryCaches, gwFileMounts)
	if err != nil {
		return
	}

	gwPayload = &genericworker.GenericWorkerPayload{
		Artifacts:     gwArtifacts,
		Command:       gwCommand,
		Env:           env(dwPayload.Env),
		Features:      features(&dwPayload.Features),
		MaxRunTime:    maxRunTime(dwPayload.MaxRunTime),
		Mounts:        gwMounts,
		OnExitStatus:  onExitStatus(&dwPayload.OnExitStatus),
		OSGroups:      osGroups(),
		SupersederURL: supersederURL(dwPayload.SupersederURL),
	}

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

func artifacts(artifacts map[string]dockerworker.Artifact) []genericworker.Artifact {
	gwArtifacts := make([]genericworker.Artifact, len(artifacts))
	names := make([]string, len(artifacts))
	i := 0
	for name := range artifacts {
		names[i] = name
		i++
	}
	sort.Strings(names)
	for i, name := range names {
		gwArtifacts[i] = genericworker.Artifact{
			Expires: artifacts[name].Expires,
			Name:    name,
			Path:    "artifact" + strconv.Itoa(i),
			Type:    artifacts[name].Type,
		}
	}
	return gwArtifacts
}

func command(payload *dockerworker.DockerWorkerPayload, dwImage Image, gwArtifacts []genericworker.Artifact, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache) ([][]string, error) {
	containerName := "taskcontainer"

	podmanPrepareCommands := dwImage.PrepareCommands()

	podmanRunString, err := podmanRunCommand(containerName, payload, dwImage, gwWritableDirectoryCaches)
	if err != nil {
		return nil, fmt.Errorf("could not form podman run command: %w", err)
	}

	commands := append(
		podmanPrepareCommands,
		podmanRunString,
		"exit_code=$?",
	)
	commands = append(
		commands,
		podmanCopyArtifacts(containerName, payload, gwArtifacts)...,
	)
	commands = append(
		commands,
		"podman rm "+containerName,
		`exit "${exit_code}"`,
	)

	return [][]string{
		{
			"bash",
			"-cx",
			strings.Join(commands, "\n"),
		},
	}, nil
}

func podmanRunCommand(containerName string, payload *dockerworker.DockerWorkerPayload, dwImage Image, wdcs []genericworker.WritableDirectoryCache) (string, error) {
	command := strings.Builder{}
	command.WriteString("podman run --name " + containerName)
	if payload.Capabilities.Privileged {
		command.WriteString(" --privileged")
	}
	command.WriteString(createVolumeMountsString(payload.Cache, wdcs))
	command.WriteString(" --add-host=taskcluster:127.0.0.1 --net=host")
	command.WriteString(podmanEnvMappings(payload.Env))
	dockerImageString, err := dwImage.String()
	if err != nil {
		return "", fmt.Errorf("could not form docker image string: %w", err)
	}
	command.WriteString(" " + dockerImageString)
	command.WriteString(" " + shell.Escape(payload.Command...))
	return command.String(), nil
}

func podmanCopyArtifacts(containerName string, payload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact) []string {
	commands := make([]string, len(gwArtifacts))
	for i := range gwArtifacts {
		commands[i] = "podman cp '" + containerName + ":" + payload.Artifacts[gwArtifacts[i].Name].Path + "' " + gwArtifacts[i].Path
	}
	return commands
}

func env(env map[string]string) map[string]string {
	return map[string]string{}
}

func features(features *dockerworker.FeatureFlags) genericworker.FeatureFlags {
	return genericworker.FeatureFlags{
		ChainOfTrust:     features.ChainOfTrust,
		TaskclusterProxy: features.TaskclusterProxy,
	}
}

func maxRunTime(maxRunTime int64) int64 {
	return maxRunTime
}

func writableDirectoryCaches(caches map[string]string) []genericworker.WritableDirectoryCache {
	wdcs := make([]genericworker.WritableDirectoryCache, len(caches))
	i := 0
	for cacheName := range caches {
		wdcs[i] = genericworker.WritableDirectoryCache{
			CacheName: cacheName,
			Directory: "cache" + strconv.Itoa(i),
		}
		i++
	}
	return wdcs
}

func onExitStatus(onExitStatus *dockerworker.ExitStatusHandling) genericworker.ExitCodeHandling {
	return genericworker.ExitCodeHandling{
		Retry: onExitStatus.Retry,
	}
}

func osGroups() []string {
	return nil
}

func supersederURL(supersederURL string) string {
	return supersederURL
}

func createVolumeMountsString(payloadCache map[string]string, wdcs []genericworker.WritableDirectoryCache) string {
	volumeMounts := strings.Builder{}
	for _, wdc := range wdcs {
		volumeMounts.WriteString(` -v "$(pwd)/` + wdc.Directory + ":" + payloadCache[wdc.CacheName] + `"`)
	}
	return volumeMounts.String()
}

func podmanEnvSetting(envVarName, envVarValue string) string {
	return ` -e "` + envVarName + "=" + envVarValue + `"`
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

func podmanEnvMappings(payloadEnv map[string]string) string {
	envStrBuilder := strings.Builder{}
	envVarNames := make([]string, len(payloadEnv)+len(dwManagedEnvVars))
	env := make(map[string]string, len(envVarNames))
	i := 0
	for envVarName, envVarValue := range payloadEnv {
		envVarNames[i] = envVarName
		env[envVarName] = envVarValue
		i++
	}
	for j, envVarName := range dwManagedEnvVars {
		envVarNames[i+j] = envVarName
		env[envVarName] = "${" + envVarName + "}"
	}
	sort.Strings(envVarNames)
	for _, envVarName := range envVarNames {
		envStrBuilder.WriteString(podmanEnvSetting(envVarName, env[envVarName]))
	}
	return envStrBuilder.String()
}
