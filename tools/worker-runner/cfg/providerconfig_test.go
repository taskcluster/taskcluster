package cfg

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	yaml "gopkg.in/yaml.v3"
)

func TestNoProviderType(t *testing.T) {
	var pc ProviderConfig

	err := yaml.Unmarshal([]byte(`{}`), &pc)
	if err == nil {
		t.Fatalf("did not fail")
	}

	assert.Equal(t, fmt.Errorf("provider config must have a `providerType` property"), err, "should have errored")
}

func TestNonStringProviderType(t *testing.T) {
	var pc ProviderConfig

	err := yaml.Unmarshal([]byte(`{"providerType": false}`), &pc)
	if err == nil {
		t.Fatalf("did not fail")
	}

	assert.Equal(t, fmt.Errorf("provider config's `providerType` property must be a string"), err, "should have errored")
}

func TestProviderOK(t *testing.T) {
	var pc ProviderConfig
	err := yaml.Unmarshal([]byte(`{"providerType": "something", "value": "sure"}`), &pc)
	if err != nil {
		t.Fatalf("failed to unmarshal: %s", err)
	}

	assert.Equal(t, map[string]interface{}{"value": "sure"}, pc.Data, "did not get expected config")
}

func TestProviderUnpack(t *testing.T) {
	type mypc struct {
		Value   int
		Another string `provider:"anotherValue"`
	}

	var pc ProviderConfig
	err := yaml.Unmarshal([]byte(`{"providerType": "x", "value": 10, "anotherValue": "hi"}`), &pc)
	assert.NoError(t, err, "should not fail")

	var c mypc
	err = pc.Unpack(&c)
	if err != nil {
		t.Fatalf("failed to unmarshal: %s", err)
	}
	assert.Equal(t, mypc{10, "hi"}, c, "unpacked values correctly")
}

func TestProviderUnpackMissing(t *testing.T) {
	type mypc struct {
		Value int
	}

	var pc ProviderConfig
	err := yaml.Unmarshal([]byte(`{"providerType": "x"}`), &pc)
	assert.NoError(t, err, "should not fail")

	var c mypc
	err = pc.Unpack(&c)
	if err == nil {
		t.Fatalf("failed to fail")
	}
}

func TestProviderUnpackWrongType(t *testing.T) {
	type mypc struct {
		Value int
	}

	var pc ProviderConfig
	err := yaml.Unmarshal([]byte(`{"providerType": "x", "value": "yo"}`), &pc)
	assert.NoError(t, err, "should not fail")

	var c mypc
	err = pc.Unpack(&c)
	if err == nil {
		t.Fatalf("failed to fail")
	}
}
