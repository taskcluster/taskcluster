package workerproto

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestEmptyCapabilities(t *testing.T) {
	assert.Equal(t, EmptyCapabilities().List(), []string{})
}

func TestFromCapabilitiesList(t *testing.T) {
	caps := []string{"abc", "def"}
	assert.Equal(t, FromCapabilitiesList(caps).List(), caps)
}

func TestAdd(t *testing.T) {
	caps := EmptyCapabilities()
	caps.Add("abc")
	assert.Equal(t, caps.List(), []string{"abc"})
}

func TestRemove(t *testing.T) {
	caps := EmptyCapabilities()
	caps.Add("graceful-termination")
	assert.True(t, caps.Has("graceful-termination"))
	caps.Remove("graceful-termination")
	assert.False(t, caps.Has("graceful-termination"))
	caps.Remove("graceful-termination")
	assert.False(t, caps.Has("graceful-termination"))
}

func TestLimitTo(t *testing.T) {
	caps1 := FromCapabilitiesList([]string{"abc", "def"})
	caps2 := FromCapabilitiesList([]string{"def", "ghi"})
	caps1.LimitTo(caps2)
	assert.False(t, caps1.Has("abc"))
	assert.True(t, caps1.Has("def"))
	assert.False(t, caps1.Has("ghi"))
}
