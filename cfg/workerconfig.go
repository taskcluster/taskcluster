package cfg

import (
	"encoding/json"

	yaml "gopkg.in/yaml.v3"
)

// The configuration that will be passed directly to the worker.
//
// Treat this as a read-only data structure, replacing it as necessary.
type WorkerConfig struct {
	Data map[string]interface{}
}

// Normalize a JSON value, using the same types regardless of source
//
// Specifically, maps should be map[string]value, and numbers should
// be float64s
func normalize(value interface{}) interface{} {
	strmap, ok := value.(map[string]interface{})
	if ok {
		res := make(map[string]interface{})
		for key, value := range strmap {
			res[key] = normalize(value)
		}
		return res
	}

	ifmap, ok := value.(map[interface{}]interface{})
	if ok {
		res := make(map[string]interface{})
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
	var res map[string]interface{}
	err := node.Decode(&res)
	if err != nil {
		return err
	}
	wc.Data = normalize(res).(map[string]interface{})
	return nil
}

func (wc *WorkerConfig) UnmarshalJSON(b []byte) error {
	var res map[string]interface{}
	err := json.Unmarshal(b, &res)
	if err != nil {
		return err
	}
	wc.Data = normalize(res).(map[string]interface{})
	return nil
}

func merge(v1, v2 interface{}) interface{} {
	// if both are maps, merge them
	map1, map1ok := v1.(map[string]interface{})
	map2, map2ok := v2.(map[string]interface{})
	if map1ok && map2ok {
		res := make(map[string]interface{})
		for key, value := range map1 {
			res[key] = value
		}
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
	arr1, arr1ok := v1.([]interface{})
	arr2, arr2ok := v2.([]interface{})
	if arr1ok && arr2ok {
		res := make([]interface{}, 0, len(arr1)+len(arr2))
		for _, value := range arr1 {
			res = append(res, value)
		}
		for _, value := range arr2 {
			res = append(res, value)
		}

		return res
	}

	// otherwise, just use the second value, overriding the first
	return v2
}

func (wc *WorkerConfig) Merge(other *WorkerConfig) *WorkerConfig {
	return &WorkerConfig{
		Data: merge(wc.Data, other.Data).(map[string]interface{}),
	}
}
