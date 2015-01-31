package model

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
	"reflect"
	"sort"
)

type Items []JsonSubSchema

func (items Items) String() string {
	result := ""
	for i, j := range items {
		result += "  Item '" + string(i) + "' =\n" + utils.Indent(j.String(), "    ")
	}
	return result
}

func (items Items) postPopulate() {
	for i := range items {
		items[i].postPopulate()
	}
}

type Enum []interface{}
type Required []string
type Properties struct {
	Properties          map[string]*JsonSubSchema
	SortedPropertyNames []string
}

func (p Properties) postPopulate() {
	// now all data should be loaded, let's sort the p.Properties
	p.SortedPropertyNames = make([]string, 0, len(p.Properties))
	for propertyName := range p.Properties {
		p.SortedPropertyNames = append(p.SortedPropertyNames, propertyName)
	}
	sort.Strings(p.SortedPropertyNames)
	fmt.Printf("Sorted Property Names: %v\n", p.SortedPropertyNames)
}

type JsonSubSchema struct {
	AdditionalItems      *bool          `json:"additionalItems"`
	AdditionalProperties *bool          `json:"additionalProperties"`
	AllOf                Items          `json:"allOf"`
	AnyOf                Items          `json:"anyOf"`
	Description          *string        `json:"description"`
	Enum                 Enum           `json:"enum"` // may be a string or int or bool etc
	Format               *string        `json:"format"`
	ID                   *string        `json:"id"`
	Items                *JsonSubSchema `json:"items"`
	Maximum              *int           `json:"maximum"`
	MaxLength            *int           `json:"maxLength"`
	Minimum              *int           `json:"minimum"`
	MinLength            *int           `json:"minLength"`
	OneOf                Items          `json:"oneOf"`
	Pattern              *string        `json:"pattern"`
	Properties           *Properties    `json:"properties"`
	Ref                  *string        `json:"$ref"`
	Required             Required       `json:"required"`
	Schema               *string        `json:"$schema"`
	Title                *string        `json:"title"`
	Type                 *string        `json:"type"`

	// non-json fields used for sorting/tracking
	StructName string
}

func describe(name string, value interface{}) string {
	if reflect.ValueOf(value).IsValid() {
		if !reflect.ValueOf(value).IsNil() {
			return fmt.Sprintf("%-22fv = '%v'\n", name, value)
		}
	}
	return ""
}

func describePtr(name string, value interface{}) string {
	if reflect.ValueOf(value).IsValid() {
		if !reflect.ValueOf(value).IsNil() {
			return fmt.Sprintf("%-22v = '%v'\n", name, reflect.Indirect(reflect.ValueOf(value)).Interface())
		}
	}
	return ""
}

func (subSchema *JsonSubSchema) String() string {
	result := ""
	result += describePtr("Additional Properties", subSchema.AdditionalProperties)
	result += describe("All Of", subSchema.AllOf)
	result += describe("Any Of", subSchema.AnyOf)
	result += describePtr("Description", subSchema.Description)
	result += describe("Enum", subSchema.Enum)
	result += describePtr("Format", subSchema.Format)
	result += describePtr("ID", subSchema.ID)
	result += describePtr("Items", subSchema.Items)
	result += describePtr("Maximum", subSchema.Maximum)
	result += describePtr("MaxLength", subSchema.MaxLength)
	result += describePtr("Minimum", subSchema.Minimum)
	result += describePtr("MinLength", subSchema.MinLength)
	result += describe("OneOf", subSchema.OneOf)
	result += describePtr("Pattern", subSchema.Pattern)
	result += describePtr("Properties", subSchema.Properties)
	result += describePtr("Ref", subSchema.Ref)
	result += describe("Required", subSchema.Required)
	result += describePtr("Schema", subSchema.Schema)
	result += describePtr("Title", subSchema.Title)
	result += describePtr("Type", subSchema.Type)
	return result
}

type CanPopulate interface {
	postPopulate()
}

func postPopulateIfNotNil(canPopulate CanPopulate) {
	if reflect.ValueOf(canPopulate).IsValid() {
		if !reflect.ValueOf(canPopulate).IsNil() {
			fmt.Println("Populating...")
			canPopulate.postPopulate()
		}
	}
}

func (subSchema *JsonSubSchema) postPopulate() {
	postPopulateIfNotNil(subSchema.AllOf)
	postPopulateIfNotNil(subSchema.AnyOf)
	postPopulateIfNotNil(subSchema.OneOf)
	postPopulateIfNotNil(subSchema.Items)
	postPopulateIfNotNil(subSchema.Properties)
	cacheJsonSchema(subSchema.Ref)
}
