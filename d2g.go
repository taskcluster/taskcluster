package d2g

import (
	"encoding/json"
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

// Dev notes: https://docs.google.com/document/d/1QNfHVpxtzXAlLWqZNz3b5mvbQWOrtsWpvadJHiMNbRc/edit#heading=h.uib8l9zhaz1n

func Convert(payload *dockerworker.DockerWorkerPayload) *genericworker.GenericWorkerPayload {
	gwArtifacts := artifacts(payload.Artifacts)
	gwWritableDirectoryCaches := writableDirectoryCaches(payload.Cache)
	return &genericworker.GenericWorkerPayload{
		Artifacts:     gwArtifacts,
		Command:       command(payload, gwArtifacts, gwWritableDirectoryCaches),
		Env:           env(payload.Env),
		Features:      features(&payload.Features),
		MaxRunTime:    maxRunTime(payload.MaxRunTime),
		Mounts:        mounts(gwWritableDirectoryCaches),
		OnExitStatus:  onExitStatus(&payload.OnExitStatus),
		OSGroups:      osGroups(),
		SupersederURL: supersederURL(payload.SupersederURL),
	}
}

func mounts(gwWritableDirectoryCaches []genericworker.WritableDirectoryCache) []json.RawMessage {
	result := make([]json.RawMessage, len(gwWritableDirectoryCaches))
	for i, wdc := range gwWritableDirectoryCaches {
		bytes, err := json.Marshal(wdc)
		if err != nil {
			panic("Bug - cannot convert a genericworker.WritableDirectoryCache to json: " + err.Error())
		}
		result[i] = json.RawMessage(bytes)
	}
	return result
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

func command(payload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact, gwWritableDirectoryCaches []genericworker.WritableDirectoryCache) [][]string {
	containerName := "taskcontainer"
	commands := []string{
		podmanRunCommand(containerName, payload, gwWritableDirectoryCaches),
		"exit_code=$?",
	}
	commands = append(commands, podmanCopyArtifacts(containerName, payload, gwArtifacts)...)
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
	}
}

func podmanRunCommand(containerName string, payload *dockerworker.DockerWorkerPayload, wdcs []genericworker.WritableDirectoryCache) string {
	command := strings.Builder{}
	command.WriteString("podman run --name " + containerName)
	if payload.Capabilities.Privileged {
		command.WriteString(" --privileged")
	}
	command.WriteString(createVolumeMountsString(payload.Cache, wdcs))
	command.WriteString(" --add-host=taskcluster:127.0.0.1 --net=host")
	command.WriteString(podmanEnvMappings(payload.Env))
	command.WriteString(" " + string(payload.Image))
	command.WriteString(" " + shell.Escape(payload.Command...))
	return command.String()
}

func podmanCopyArtifacts(containerName string, payload *dockerworker.DockerWorkerPayload, gwArtifacts []genericworker.Artifact) []string {
	commands := make([]string, len(gwArtifacts))
	for i := range gwArtifacts {
		commands[i] = "podman cp '" + containerName + ":" + payload.Artifacts[gwArtifacts[i].Name].Path + "' " + gwArtifacts[i].Path
	}
	return commands
}

func env(env map[string]string) map[string]string {
	return env
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

func podmanEnvMapping(envVar string) string {
	return ` -e "` + envVar + "=${" + envVar + `}"`
}

func podmanEnvMappings(payloadEnv map[string]string) string {
	env := strings.Builder{}
	envVars := make([]string, len(payloadEnv)+len(dwManagedEnvVars))
	i := 0
	for envVar := range payloadEnv {
		envVars[i] = envVar
		i++
	}
	for j, envVar := range dwManagedEnvVars {
		envVars[i+j] = envVar
	}
	sort.Strings(envVars)
	for _, envVar := range envVars {
		env.WriteString(podmanEnvMapping(envVar))
	}
	return env.String()
}
