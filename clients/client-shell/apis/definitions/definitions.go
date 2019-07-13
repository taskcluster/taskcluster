// Package definitions implements the definition of the Service and Entry structs.

package definitions

// Service definition.
type Service struct {
	BaseURL     string  `json:"baseUrl"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Entries     []Entry `json:"entries"`
}

// Entry definition for services.
type Entry struct {
	Type        string     `json:"type"`
	Name        string     `json:"name"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Scopes      [][]string `json:"scopes"`
	Stability   string     `json:"stability"`
	Method      string     `json:"method"`
	Route       string     `json:"route"`
	Args        []string   `json:"args"`
	Query       []string   `json:"query"`
	Input       string     `json:"input"`
	Output      string     `json:"output"`
}
