package workerproto

import (
	"encoding/json"
	"fmt"
	"maps"
)

type Message struct {
	Type       string
	Properties map[string]any
}

func (msg *Message) UnmarshalJSON(b []byte) error {
	err := json.Unmarshal(b, &msg.Properties)
	if err != nil {
		return err
	}

	typ, ok := msg.Properties["type"]
	if !ok {
		return fmt.Errorf("Message has no 'type' property")
	}

	msg.Type, ok = typ.(string)
	if !ok {
		return fmt.Errorf("Message 'type' property is not a string")
	}

	delete(msg.Properties, "type")
	return nil
}

func (msg *Message) MarshalJSON() ([]byte, error) {
	obj := make(map[string]any)
	maps.Copy(obj, msg.Properties)
	obj["type"] = msg.Type
	return json.Marshal(obj)
}
