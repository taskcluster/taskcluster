package cfg

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	yaml "gopkg.in/yaml.v3"
)

func TestNoWorkerImplementation(t *testing.T) {
	var pc WorkerImplementationConfig

	err := yaml.Unmarshal([]byte(`{}`), &pc)
	if err == nil {
		t.Fatalf("did not fail")
	}

	assert.Equal(t, fmt.Errorf("worker implementation config must have an `implementation` property"), err, "should have errored")
}

func TestNonStringWorkerImplementation(t *testing.T) {
	var pc WorkerImplementationConfig

	err := yaml.Unmarshal([]byte(`{"implementation": false}`), &pc)
	if err == nil {
		t.Fatalf("did not fail")
	}

	assert.Equal(t, fmt.Errorf("worker implementation config's `implementation` property must be a string"), err, "should have errored")
}

func TestWorkerImplOK(t *testing.T) {
	var pc WorkerImplementationConfig
	err := yaml.Unmarshal([]byte(`{"implementation": "something", "value": "sure"}`), &pc)
	if err != nil {
		t.Fatalf("failed to unmarshal: %s", err)
	}

	assert.Equal(t, map[string]interface{}{"value": "sure"}, pc.Data, "did not get expected config")
}

func TestWorkerImplUnpack(t *testing.T) {
	type mypc struct {
		Value   int
		Another string `workerimpl:"anotherValue"`
	}

	var pc WorkerImplementationConfig
	err := yaml.Unmarshal([]byte(`{"implementation": "x", "value": 10, "anotherValue": "hi"}`), &pc)
	assert.NoError(t, err, "should fail")

	var c mypc
	err = pc.Unpack(&c)
	if err != nil {
		t.Fatalf("failed to unmarshal: %s", err)
	}
	assert.Equal(t, mypc{10, "hi"}, c, "unpacked values correctly")
}

func TestWorkerImplUnpackMissing(t *testing.T) {
	type mypc struct {
		Value int
	}

	var pc WorkerImplementationConfig
	err := yaml.Unmarshal([]byte(`{"implementation": "x"}`), &pc)
	assert.NoError(t, err, "should fail")

	var c mypc
	err = pc.Unpack(&c)
	if err == nil {
		t.Fatalf("failed to fail")
	}
}

func TestWorkerImplUnpackOptional(t *testing.T) {
	type mypc struct {
		Value   int    `workerimpl:",optional"`
		Another string `workerimpl:"anotherValue,optional"`
	}

	var pc WorkerImplementationConfig
	err := yaml.Unmarshal([]byte(`{"implementation": "x", "anotherValue": "hi"}`), &pc)
	require.NoError(t, err, "should fail")

	var c mypc
	err = pc.Unpack(&c)
	if err != nil {
		t.Fatalf("failed to unmarshal: %s", err)
	}
	assert.Equal(t, mypc{0, "hi"}, c, "unpacked values correctly")
}

func TestWorkerImplUnpackWrongType(t *testing.T) {
	type mypc struct {
		Value int
	}

	var pc WorkerImplementationConfig
	err := yaml.Unmarshal([]byte(`{"implementation": "x", "value": "yo"}`), &pc)
	assert.NoError(t, err, "should fail")

	var c mypc
	err = pc.Unpack(&c)
	if err == nil {
		t.Fatalf("failed to fail")
	}
}
