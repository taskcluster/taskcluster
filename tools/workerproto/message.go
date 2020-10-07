package workerproto

import (
	"encoding/json"
	"fmt"
)

type Message struct {
	Type       string
	Properties map[string]interface{}
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
	obj := make(map[string]interface{})
	for k, v := range msg.Properties {
		obj[k] = v
	}
	obj["type"] = msg.Type
	return json.Marshal(obj)
}
