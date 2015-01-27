package model

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
)

var err error

// indents a block of text with an indent string
func indent(text, indent string) string {
	result := ""
	for _, j := range strings.Split(text, "\n") {
		result += indent + j + "\n"
	}
	return result
}

type JsonSchemaTopLevel struct {
	ID                   string              `json:"id"`
	Schema               string              `json:"$schema"`
	Title                string              `json:"title"`
	Description          string              `json:"description"`
	Type                 string              `json:"type"`
	Items                Items               `json:"items"`
	OneOf                []Items             `json:"oneOf"`
	Properties           map[string]Property `json:"properties"`
	AdditionalProperties bool                `json:"additionalProperties"`
	Required             []string            `json:"required"`
}

type Items struct {
	Title                string              `json:"title"`
	Description          string              `json:"description"`
	Type                 string              `json:"type"`
	Properties           map[string]Property `json:"properties"`
	AdditionalProperties bool                `json:"additionalProperties"`
	Required             []string            `json:"required"`
}

type Property struct {
	Ref         string        `json:"$ref"`
	Title       string        `json:"title"`
	Description string        `json:"description"`
	Type        string        `json:"type"`
	Pattern     string        `json:"pattern"`
	MinLength   int           `json:"minLength"`
	MaxLength   int           `json:"maxLength"`
	Minimum     int           `json:"minimum"`
	Maximum     int           `json:"maximum"`
	Format      string        `json:"format"`
	Enum        []interface{} `json:"enum"` // may be a string or int or bool etc
	Items       Items         `json:"items"`
}

func (top JsonSchemaTopLevel) String() string {
	result := fmt.Sprintf("ID                    = '%v'\n", top.ID)
	result += fmt.Sprintf("Schema                = '%v'\n", top.Schema)
	result += fmt.Sprintf("Title                 = '%v'\n", top.Title)
	result += fmt.Sprintf("Description           = '%v'\n", top.Description)
	result += fmt.Sprintf("Type                  = '%v'\n", top.Type)
	result += fmt.Sprintf("Items                 =\n")
	result += indent(top.Items.String(), "  ")
	result += fmt.Sprintf("OneOf                 =\n")
	for i, j := range top.OneOf {
		result += fmt.Sprintf("  Option %v:\n", i)
		result += indent(j.String(), "    ")
	}
	result += fmt.Sprintf("Properties            =\n")
	for i, j := range top.Properties {
		result += "  '" + i + "' =\n" + indent(j.String(), "    ")
	}
	result += fmt.Sprintf("AdditionalProperties  = '%v'\n", top.AdditionalProperties)
	result += fmt.Sprintf("Required              = '%v'\n", top.Required)
	return result
}

func (items Items) String() string {
	result := fmt.Sprintf("Title                 = '%v'\n", items.Title)
	result += fmt.Sprintf("Description           = '%v'\n", items.Description)
	result += fmt.Sprintf("Type                  = '%v'\n", items.Type)
	result += fmt.Sprintf("Properties            =\n")
	for i, j := range items.Properties {
		result += "  '" + i + "' =\n" + indent(j.String(), "    ")
	}
	result += fmt.Sprintf("AdditionalProperties  = '%v'\n", items.AdditionalProperties)
	result += fmt.Sprintf("Required              = '%v'\n", items.Required)
	return result
}

func (property Property) String() string {
	result := fmt.Sprintf("$Ref         = '%v'\n", property.Ref)
	result += fmt.Sprintf("Title        = '%v'\n", property.Title)
	result += fmt.Sprintf("Description  = '%v'\n", property.Description)
	result += fmt.Sprintf("Type         = '%v'\n", property.Type)
	result += fmt.Sprintf("Pattern      = '%v'\n", property.Pattern)
	result += fmt.Sprintf("MinLength    = '%v'\n", property.MinLength)
	result += fmt.Sprintf("MaxLength    = '%v'\n", property.MaxLength)
	result += fmt.Sprintf("Minimum      = '%v'\n", property.Minimum)
	result += fmt.Sprintf("Maximum      = '%v'\n", property.Maximum)
	result += fmt.Sprintf("Format       = '%v'\n", property.Format)
	result += fmt.Sprintf("Enum         = '%v'\n", property.Enum)
	result += fmt.Sprintf("Items        =\n")
	result += indent(property.Items.String(), "  ")
	return result
}

func LoadJsonSchema(url string) *JsonSchemaTopLevel {
	var resp *http.Response
	resp, err = http.Get(url)
	exitOnFail()
	defer resp.Body.Close()
	var bytes []byte
	bytes, err = ioutil.ReadAll(resp.Body)
	exitOnFail()
	m := new(JsonSchemaTopLevel)
	err = json.Unmarshal(bytes, m)
	exitOnFail()
	return m
}

func exitOnFail() {
	if err != nil {
		panic(err)
	}
}
