package model

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
	"sort"
)

type Items []JsonSubSchema

func (items *Items) String() string {
	for i, j := range *items {
		result += "  '" + i + "' =\n" + utils.Indent(j.String(), "    ")
	}
	return ""
}

func (i *Items) postPopulate() {
	// now all data should be loaded, let's sort the subSchema.Properties
	subSchema.SortedPropertyNames = make([]string, 0, len(subSchema.Properties))
	for propertyName := range subSchema.Properties {
		subSchema.SortedPropertyNames = append(subSchema.SortedPropertyNames, propertyName)
	}
	sort.Strings(subSchema.SortedPropertyNames)
	fmt.Printf("Sorted Property Names: %v\n", subSchema.SortedPropertyNames)
}

type Enum []interface{}
type Required []string
type Properties struct {
	Properties          map[string]*JsonSubSchema
	SortedPropertyNames []string
}

type JsonSubSchema struct {
	AdditionalItems      *bool          `json:"additionalItems"`
	AdditionalProperties *bool          `json:"additionalProperties"`
	AllOf                *Items         `json:"allOf"`
	AnyOf                *Items         `json:"anyOf"`
	Description          *string        `json:"description"`
	Enum                 *Enum          `json:"enum"` // may be a string or int or bool etc
	Format               *string        `json:"format"`
	ID                   *string        `json:"id"`
	Items                *JsonSubSchema `json:"items"`
	Maximum              *int           `json:"maximum"`
	MaxLength            *int           `json:"maxLength"`
	Minimum              *int           `json:"minimum"`
	MinLength            *int           `json:"minLength"`
	OneOf                *Items         `json:"oneOf"`
	Pattern              *string        `json:"pattern"`
	Properties           *Properties    `json:"properties"`
	Ref                  *string        `json:"$ref"`
	Required             *Required      `json:"required"`
	Schema               *string        `json:"$schema"`
	Title                *string        `json:"title"`
	Type                 *string        `json:"type"`

	// non-json fields used for sorting/tracking
	StructName string
}

func describe(name string, value *interface{}) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%-22f = '%v'\n", *value)
}

func (subSchema JsonSubSchema) String() string {
	result += describe("Additional Properties", *subschema.AdditionalProperties)
	result += describe("All Of", *subschema.AllOf)
	result += describe("Any Of", *subschema.AnyOf)
	result += describe("Description", *subschema.Description)
	result += describe("Enum", *subschema.Enum)
	result += describe("Format", *subschema.Format)
	result += describe("ID", *subschema.ID)
	result += describe("Items", *subschema.Items, "    ")
	result += describe("Maximum", *subschema.Maximum)
	result += describe("MaxLength", *subschema.MaxLength)
	result += describe("Minimum", *subschema.Minimum)
	result += describe("MinLength", *subschema.MinLength)
	result += describe("OneOf", *subschema.OneOf)
	result += describe("Pattern", *subschema.Pattern)
	result += describe("Properties", *subschema.Properties)
	result += describe("Ref", *subschema.Ref)
	result += describe("Required", *subschema.Required)
	result += describe("Schema", *subschema.Schema)
	result += describe("Title", *subschema.Title)
	result += describe("Type", *subschema.Type)
	return result
}

func (subSchema *JsonSubSchema) postPopulate() {
	subSchema.AllOf.postPopulate()
	subSchema.AnyOf.postPopulate()
	subSchema.OneOf.postPopulate()
	subSchema.Items.postPopulate()
	subSchema.Properties.postPopulate()
	cacheJsonSchema(subSchema.Ref)
}
