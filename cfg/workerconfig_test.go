package cfg_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/taskcluster/taskcluster-worker-runner/cfg"
	yaml "gopkg.in/yaml.v3"
)

func TestUnmarshalYAML(t *testing.T) {
	var wc cfg.WorkerConfig

	err := yaml.Unmarshal([]byte(`x: 10`), &wc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": 10.0}, wc.Data, "should read yaml correctly")
}

func TestUnmarshalJSON(t *testing.T) {
	var wc cfg.WorkerConfig

	err := json.Unmarshal([]byte(`{"x": "y"}`), &wc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": "y"}, wc.Data, "should read json correctly")
}

func TestMergeDistinctProperties(t *testing.T) {
	var wc1, wc2 cfg.WorkerConfig

	yaml.Unmarshal([]byte(`x: 10`), &wc1)
	yaml.Unmarshal([]byte(`y: 20`), &wc2)

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 10.0, "y": 20.0}, merged.Data, "should merge configs")
}

func TestMergeOverwriteProperty(t *testing.T) {
	var wc1, wc2 cfg.WorkerConfig

	yaml.Unmarshal([]byte(`x: 10`), &wc1)
	yaml.Unmarshal([]byte(`x: 20`), &wc2)

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 20.0}, merged.Data, "should merge configs")
}

func TestMergeOverwritePropertyDifferentTypes(t *testing.T) {
	var wc1, wc2 cfg.WorkerConfig

	yaml.Unmarshal([]byte(`x: {}`), &wc1)
	yaml.Unmarshal([]byte(`x: 13`), &wc2)

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 13.0}, merged.Data, "should merge configs")
}

func TestMergeAppendArray(t *testing.T) {
	var wc1, wc2 cfg.WorkerConfig

	yaml.Unmarshal([]byte(`x: [a]`), &wc1)
	yaml.Unmarshal([]byte(`x: [b]`), &wc2)

	merged := wc1.Merge(&wc2)

	assert.Equal(t,
		map[string]interface{}{"x": []interface{}{
			interface{}("a"),
			interface{}("b"),
		}},
		merged.Data,
		"should append arrays")
}

func TestMergeRecurseObjects(t *testing.T) {
	var wc1, wc2 cfg.WorkerConfig

	yaml.Unmarshal([]byte(`x: {a: 10}`), &wc1)
	yaml.Unmarshal([]byte(`x: {b: 10}`), &wc2)

	merged := wc1.Merge(&wc2)

	assert.Equal(t,
		map[string]interface{}{
			"x": map[string]interface{}{
				"a": 10.0,
				"b": 10.0,
			},
		},
		merged.Data,
		"should merge objects recursively")
}
