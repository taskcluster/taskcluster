package win32

import (
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

type envSetting struct {
	name  string
	value string
}

func MergeEnvLists(envLists ...*[]string) (*[]string, error) {
	mergedEnvMap := map[string]envSetting{}
	for _, envList := range envLists {
		if envList == nil {
			continue
		}
		for _, env := range *envList {
			if utf8.RuneCountInString(env) > 32767 {
				return nil, fmt.Errorf("Env setting is more than 32767 runes: %v", env)
			}
			spl := strings.SplitN(env, "=", 2)
			if len(spl) != 2 {
				return nil, fmt.Errorf("Could not interpret string %q as `key=value`", env)
			}
			newVarName := spl[0]
			newVarValue := spl[1]
			// if env var already exists, use case of existing name, to simulate behaviour of
			// setting an existing env var with a different case
			// e.g.
			//  set aVar=3
			//  set AVAR=4
			// results in
			//  aVar=4
			canonicalVarName := strings.ToLower(newVarName)
			if existingVarName := mergedEnvMap[canonicalVarName].name; existingVarName != "" {
				newVarName = existingVarName
			}
			mergedEnvMap[canonicalVarName] = envSetting{
				name:  newVarName,
				value: newVarValue,
			}
		}
	}
	canonicalVarNames := make([]string, len(mergedEnvMap))
	i := 0
	for k := range mergedEnvMap {
		canonicalVarNames[i] = k
		i++
	}
	// All strings in the environment block must be sorted alphabetically by
	// name. The sort is case-insensitive, Unicode order, without regard to
	// locale.
	//
	// See https://msdn.microsoft.com/en-us/library/windows/desktop/ms682009(v=vs.85).aspx
	sort.Strings(canonicalVarNames)
	// Finally piece back together into an environment block
	mergedEnv := make([]string, len(mergedEnvMap))
	i = 0
	for _, canonicalVarName := range canonicalVarNames {
		mergedEnv[i] = mergedEnvMap[canonicalVarName].name + "=" + mergedEnvMap[canonicalVarName].value
		i++
	}
	return &mergedEnv, nil
}
