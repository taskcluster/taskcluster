package workerproto

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMessageMarshal(t *testing.T) {
	msg := Message{
		Type: "hey-you",
		Properties: map[string]interface{}{
			"x": true,
			"y": "twenty",
		},
	}
	bytes, err := json.Marshal(&msg)
	assert.NoError(t, err, "should not fail")

	var obj map[string]interface{}
	err = json.Unmarshal(bytes, &obj)
	assert.NoError(t, err, "should not fail")

	assert.Equal(t, "hey-you", obj["type"], "did not get expected type property")
	assert.Equal(t, true, obj["x"], "did not get expected x property")
	assert.Equal(t, "twenty", obj["y"], "did not get expected y property")
}

func TestMessageUnmarshal(t *testing.T) {
	var msg Message
	err := json.Unmarshal([]byte(`{"type": "hey-you", "value": "sure"}`), &msg)
	assert.NoError(t, err, "should not fail")

	assert.Equal(t, "hey-you", msg.Type, "did not get expected properties")
	assert.Equal(t, map[string]interface{}{"value": "sure"}, msg.Properties, "did not get expected properties")
}

func TestMessageUnmarshalNoType(t *testing.T) {
	var msg Message
	err := json.Unmarshal([]byte(`{"value": "sure"}`), &msg)
	assert.Error(t, err, "should fail")
}

func TestMessageUnmarshalBadType(t *testing.T) {
	var msg Message
	err := json.Unmarshal([]byte(`{"type": true, "value": "sure"}`), &msg)
	assert.Error(t, err, "should fail")
}
