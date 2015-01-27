package model

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
)

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

func (top JsonSchemaTopLevel) String() string {
	result := fmt.Sprintf("ID                    = '%v'\n", top.ID)
	result += fmt.Sprintf("Schema                = '%v'\n", top.Schema)
	result += fmt.Sprintf("Title                 = '%v'\n", top.Title)
	result += fmt.Sprintf("Description           = '%v'\n", top.Description)
	result += fmt.Sprintf("Type                  = '%v'\n", top.Type)
	result += fmt.Sprintf("Items                 =\n")
	result += utils.Indent(top.Items.String(), "  ")
	result += fmt.Sprintf("OneOf                 =\n")
	for i, j := range top.OneOf {
		result += fmt.Sprintf("  Option %v:\n", i)
		result += utils.Indent(j.String(), "    ")
	}
	result += fmt.Sprintf("Properties            =\n")
	for i, j := range top.Properties {
		result += "  '" + i + "' =\n" + utils.Indent(j.String(), "    ")
	}
	result += fmt.Sprintf("AdditionalProperties  = '%v'\n", top.AdditionalProperties)
	result += fmt.Sprintf("Required              = '%v'\n", top.Required)
	return result
}

func (top JsonSchemaTopLevel) postPopulate() {
	for propertyName := range top.Properties {
		top.Properties[propertyName].postPopulate()
	}
	top.Items.postPopulate()
	for itemsName := range top.OneOf {
		top.OneOf[itemsName].postPopulate()
	}
}

type Items struct {
	Title                string              `json:"title"`
	Description          string              `json:"description"`
	Type                 string              `json:"type"`
	Properties           map[string]Property `json:"properties"`
	AdditionalProperties bool                `json:"additionalProperties"`
	Required             []string            `json:"required"`
}

func (items Items) String() string {
	result := fmt.Sprintf("Title                 = '%v'\n", items.Title)
	result += fmt.Sprintf("Description           = '%v'\n", items.Description)
	result += fmt.Sprintf("Type                  = '%v'\n", items.Type)
	result += fmt.Sprintf("Properties            =\n")
	for i, j := range items.Properties {
		result += "  '" + i + "' =\n" + utils.Indent(j.String(), "    ")
	}
	result += fmt.Sprintf("AdditionalProperties  = '%v'\n", items.AdditionalProperties)
	result += fmt.Sprintf("Required              = '%v'\n", items.Required)
	return result
}

func (items Items) postPopulate() {
	for propertyName := range items.Properties {
		items.Properties[propertyName].postPopulate()
	}
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
	result += utils.Indent(property.Items.String(), "  ")
	return result
}

func (property Property) postPopulate() {
	cacheJsonSchema(property.Ref)
}
