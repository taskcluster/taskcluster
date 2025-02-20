package cfg

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"maps"

	yaml "gopkg.in/yaml.v3"
)

// The configuration that will be passed directly to the worker.  At
// the top level, this is a JSON object, but it can contain arbitrary
// other JSON types within it.
//
// Treat this as a read-only data structure, replacing it as necessary
// using the methods provided below.
type WorkerConfig struct {
	data map[string]any
}

// Normalize a JSON value, using the same types regardless of source
//
// Specifically, maps should be map[string]value, and numbers should
// be float64s
func normalize(value any) any {
	strmap, ok := value.(map[string]any)
	if ok {
		res := make(map[string]any)
		for key, value := range strmap {
			res[key] = normalize(value)
		}
		return res
	}

	ifmap, ok := value.(map[any]any)
	if ok {
		res := make(map[string]any)
		for key, value := range ifmap {
			res[key.(string)] = normalize(value)
		}
		return res
	}

	num, ok := value.(int)
	if ok {
		return float64(num)
	}

	return value
}

func (wc *WorkerConfig) UnmarshalYAML(node *yaml.Node) error {
	var res map[string]any
	err := node.Decode(&res)
	if err != nil {
		return err
	}
	wc.data = normalize(res).(map[string]any)
	return nil
}

func (wc *WorkerConfig) UnmarshalJSON(b []byte) error {
	var res map[string]any
	err := json.Unmarshal(b, &res)
	if err != nil {
		return err
	}
	wc.data = normalize(res).(map[string]any)
	return nil
}

func (wc *WorkerConfig) MarshalYAML() ([]byte, error) {
	return yaml.Marshal(wc.data)
}

func (wc *WorkerConfig) MarshalJSON() ([]byte, error) {
	return json.Marshal(wc.data)
}

func merge(v1, v2 any) any {
	// if both are maps, merge them
	map1, map1ok := v1.(map[string]any)
	map2, map2ok := v2.(map[string]any)
	if map1ok && map2ok {
		res := make(map[string]any)
		maps.Copy(res, map1)
		for key, value := range map2 {
			existing, ok := res[key]
			if ok {
				res[key] = merge(existing, value)
			} else {
				res[key] = value
			}
		}

		return res
	}

	// if both are arrays, concatenate them
	arr1, arr1ok := v1.([]any)
	arr2, arr2ok := v2.([]any)
	if arr1ok && arr2ok {
		if len(arr1) > math.MaxInt-len(arr2) {
			panic(fmt.Sprintf("Arrays too large to merge: sizes are %v and %v", len(arr1), len(arr2)))
		}
		res := make([]any, 0, len(arr1)+len(arr2))
		res = append(res, arr1...)
		res = append(res, arr2...)

		return res
	}

	// otherwise, just use the second value, overriding the first
	return v2
}

// Merge two WorkerConfig objects, preferring values from the second
// object where both are provided.  Where both objects have an object
// as a value, those objects are merged recursively.  Where both objects
// have an array as a value, those arrays are concatenated.
//
// This returns a new WorkerConfig without modifying either input.
func (wc *WorkerConfig) Merge(other *WorkerConfig) *WorkerConfig {
	if wc == nil {
		if other == nil {
			return NewWorkerConfig()
		}
		return other
	}
	if other == nil {
		return wc
	}

	return &WorkerConfig{
		data: merge(wc.data, other.data).(map[string]any),
	}
}

func set(key []string, i int, config any, value any) (any, error) {
	if i == len(key) {
		return value, nil
	}

	configmap, ok := config.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s is not an object in existing config", strings.Join(key[:i], "."))
	}

	clone := make(map[string]any)
	maps.Copy(clone, configmap)

	k := key[i]
	v, ok := clone[k]
	if !ok {
		v = make(map[string]any)
		clone[k] = v
	}

	var err error
	clone[k], err = set(key, i+1, v, value)
	if err != nil {
		return nil, err
	}

	return clone, nil
}

// Set a value at the given dotted path.
//
// This returns a new WorkerConfig containing the updated value.
func (wc *WorkerConfig) Set(key string, value any) (*WorkerConfig, error) {
	if key == "" {
		return nil, fmt.Errorf("must specify a nonempty key")
	}

	if wc == nil {
		wc = NewWorkerConfig()
	}

	splitkey := strings.Split(key, ".")
	data, err := set(splitkey, 0, wc.data, value)
	if err != nil {
		return nil, err
	}
	return &WorkerConfig{
		data: data.(map[string]any),
	}, nil
}

// Get a value at the given dotted path
func (wc *WorkerConfig) Get(key string) (any, error) {
	if key == "" {
		return nil, fmt.Errorf("must specify a nonempty key")
	}

	splitkey := strings.Split(key, ".")
	val := any(wc.data)
	for _, k := range splitkey {
		valmap, ok := val.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("key %s not found", key)
		}
		val, ok = valmap[k]
		if !ok {
			return nil, fmt.Errorf("key %s not found", key)
		}
	}
	return val, nil
}

// Like Get, but panic on error (for tests)
func (wc *WorkerConfig) MustGet(key string) any {
	val, err := wc.Get(key)
	if err != nil {
		panic(err)
	}
	return val
}

// Return true if the property is present
func (wc *WorkerConfig) Has(key string) bool {
	_, err := wc.Get(key)
	return err == nil
}

func NewWorkerConfig() *WorkerConfig {
	return &WorkerConfig{
		data: make(map[string]any),
	}
}
