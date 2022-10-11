package codegen

import (
	"encoding/json"
	"fmt"
	"os"
)

// References represents `generated/references.json`
type References struct {
	data []Reference
}

// An element in `generated/references.json`
type Reference struct {
	Content  json.RawMessage `json:"content"`
	Filename string          `json:"filename"`
}

func LoadReferences() (*References, error) {
	file, err := os.ReadFile("../../../generated/references.json")
	if err != nil {
		return nil, err
	}

	r := &References{}
	err = json.Unmarshal([]byte(file), &r.data)
	if err != nil {
		return nil, err
	}

	return r, nil
}

func (r *References) get(filename string, v interface{}) error {
	if filename[0] == '/' {
		filename = filename[1:]
	}
	for _, ref := range r.data {
		if ref.Filename == filename {
			return json.Unmarshal(ref.Content, v)
		}
	}

	return fmt.Errorf("%s is not defined in references.json", filename)
}
