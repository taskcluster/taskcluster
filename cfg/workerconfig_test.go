package cfg

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	yaml "gopkg.in/yaml.v3"
)

func TestUnmarshalYAML(t *testing.T) {
	var wc WorkerConfig

	err := yaml.Unmarshal([]byte(`x: 10`), &wc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": 10.0}, wc.data, "should read yaml correctly")
}

func TestUnmarshalJSON(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{"x": "y"}`), &wc)
	if err != nil {
		t.Fatalf("failed to load: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": "y"}, wc.data, "should read json correctly")
}

func TestMergeDistinctProperties(t *testing.T) {
	var wc1, wc2 WorkerConfig

	err := yaml.Unmarshal([]byte(`x: 10`), &wc1)
	assert.NoError(t, err, "should not fail")
	err = yaml.Unmarshal([]byte(`y: 20`), &wc2)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 10.0, "y": 20.0}, merged.data, "should merge configs")
}

func TestMergeOverwriteProperty(t *testing.T) {
	var wc1, wc2 WorkerConfig

	err := yaml.Unmarshal([]byte(`x: 10`), &wc1)
	assert.NoError(t, err, "should not fail")
	err = yaml.Unmarshal([]byte(`x: 20`), &wc2)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 20.0}, merged.data, "should merge configs")
}

func TestMergeOverwritePropertyDifferentTypes(t *testing.T) {
	var wc1, wc2 WorkerConfig

	err := yaml.Unmarshal([]byte(`x: {}`), &wc1)
	assert.NoError(t, err, "should not fail")
	err = yaml.Unmarshal([]byte(`x: 13`), &wc2)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 13.0}, merged.data, "should merge configs")
}

func TestMergeAppendArray(t *testing.T) {
	var wc1, wc2 WorkerConfig

	err := yaml.Unmarshal([]byte(`x: [a]`), &wc1)
	assert.NoError(t, err, "should not fail")
	err = yaml.Unmarshal([]byte(`x: [b]`), &wc2)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(&wc2)

	assert.Equal(t,
		map[string]interface{}{"x": []interface{}{
			interface{}("a"),
			interface{}("b"),
		}},
		merged.data,
		"should append arrays")
}

func TestMergeRecurseObjects(t *testing.T) {
	var wc1, wc2 WorkerConfig

	err := yaml.Unmarshal([]byte(`x: {a: 10}`), &wc1)
	assert.NoError(t, err, "should not fail")
	err = yaml.Unmarshal([]byte(`x: {b: 10}`), &wc2)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(&wc2)

	assert.Equal(t,
		map[string]interface{}{
			"x": map[string]interface{}{
				"a": 10.0,
				"b": 10.0,
			},
		},
		merged.data,
		"should merge objects recursively")
}

func TestMergeFirstNil(t *testing.T) {
	var wc1 *WorkerConfig
	var wc2 WorkerConfig

	err := yaml.Unmarshal([]byte(`x: 10`), &wc2)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(&wc2)

	assert.Equal(t, map[string]interface{}{"x": 10.0}, merged.data, "should return existing config")
}

func TestMergeSecondNil(t *testing.T) {
	var wc1 WorkerConfig
	var wc2 *WorkerConfig

	err := yaml.Unmarshal([]byte(`x: 10`), &wc1)
	assert.NoError(t, err, "should not fail")

	merged := wc1.Merge(wc2)

	assert.Equal(t, map[string]interface{}{"x": 10.0}, merged.data, "should return existing config")
}

func TestMergeBothNil(t *testing.T) {
	var wc1 *WorkerConfig
	var wc2 *WorkerConfig

	merged := wc1.Merge(wc2)

	assert.Equal(t, map[string]interface{}{}, merged.data, "should return empty config")
}

func TestSetNilNoDot(t *testing.T) {
	var wc *WorkerConfig
	wc2, err := wc.Set("x", "a")
	if err != nil {
		t.Fatalf("failed to set: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": "a"}, wc2.data, "should set x")
}

func TestSetEmptyNoDot(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{}`), &wc)
	assert.NoError(t, err, "should not fail")
	wc2, err := wc.Set("x", "a")
	if err != nil {
		t.Fatalf("failed to set: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": "a"}, wc2.data, "should set x")
}

func TestSetEmptyWithDot(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{}`), &wc)
	assert.NoError(t, err, "should not fail")
	wc2, err := wc.Set("x.y", "a")
	if err != nil {
		t.Fatalf("failed to set: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": map[string]interface{}{"y": "a"}}, wc2.data, "should set x.y")
}

func TestSetExistingData(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{"x": {"y": "xxx"}}`), &wc)
	assert.NoError(t, err, "should not fail")
	wc2, err := wc.Set("x.y", "a")
	if err != nil {
		t.Fatalf("failed to set: %s", err)
	}
	assert.Equal(t, map[string]interface{}{"x": map[string]interface{}{"y": "a"}}, wc2.data, "should set x.y")
}

func TestSetExistingDataSiblings(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{"p": true, "x": {"q": true, "y": "xxx"}}`), &wc)
	assert.NoError(t, err, "should not fail")
	wc2, err := wc.Set("x.y", "a")
	if err != nil {
		t.Fatalf("failed to set: %s", err)
	}
	assert.Equal(t,
		map[string]interface{}{
			"p": true,
			"x": map[string]interface{}{
				"q": true,
				"y": "a",
			},
		}, wc2.data, "should set x.y")

	// and just check wc wasn't modified
	assert.Equal(t,
		map[string]interface{}{
			"p": true,
			"x": map[string]interface{}{
				"q": true,
				"y": "xxx",
			},
		}, wc.data, "should not change original")
}

func TestSetNotObject(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{"x": "xxx"}`), &wc)
	assert.NoError(t, err, "should not fail")
	_, err = wc.Set("x.y", "a")
	if err == nil {
		t.Fatalf("did not fail")
	}
	assert.Equal(t, fmt.Errorf("x is not an object in existing config"), err, "should have errored")
}

func TestGet(t *testing.T) {
	var wc WorkerConfig

	err := json.Unmarshal([]byte(`{"x": {"y": "z"}}`), &wc)
	assert.NoError(t, err, "shouldn't fail")
	res, err := wc.Get("x.y")
	assert.NoError(t, err, "shouldn't fail")
	assert.Equal(t, "z", res, "got correct value")
}
