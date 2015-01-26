package model

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
)

type JsonSchemaTopLevel struct {
	ID          string `json:"id"`
	Schema      string `json:"$schema"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Type        string `json:"type"`
	Items       []Item `json:"items"`
}

func (top JsonSchemaTopLevel) String() string {
	var result string = ""
	result += fmt.Sprintf("ID           = '%v'\n", top.ID)
	result += fmt.Sprintf("Schema       = '%v'\n", top.Schema)
	result += fmt.Sprintf("Title        = '%v'\n", top.Title)
	result += fmt.Sprintf("Description  = '%v'\n", top.Description)
	result += fmt.Sprintf("Type         = '%v'\n", top.Type)
	for i, item := range top.Items {
		result += fmt.Sprintf("Item %-6v= \n%v", i, item)
	}
	return result
}

type Item struct {
	Description          string              `json:"description"`
	Type                 string              `json:"description"`
	Properties           map[string]Property `json:"description"`
	AdditionalProperties string              `json:"description"`
	Required             string              `json:"description"`
}

type Property struct {
	Description string `json:"description"`
	Type        string `json:"description"`
	Pattern     string `json:"pattern"`
	MaxLength   string `json:"maxLength"`
	Format      string `json:"format"`
	Items       []Item `json:"items"`
}

func LoadJsonSchema(url string) {
	fmt.Printf("Loading json schema from: %v\n", url)
	var resp *http.Response
	resp, _ = http.Get(url)
	defer resp.Body.Close()
	var bytes []byte
	bytes, _ = ioutil.ReadAll(resp.Body)
	m := new(JsonSchemaTopLevel)
	json.Unmarshal(bytes, m)
	fmt.Println(m.String())
}
