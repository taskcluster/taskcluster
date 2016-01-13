package text

import "fmt"

func ExampleIndent_basic() {
	fmt.Println("1.")
	fmt.Println(Indent("", "...."))
	fmt.Println("2.")
	fmt.Println(Indent("\n", "...."))
	fmt.Println("3.")
	fmt.Println(Indent("line one\nline two", "...."))
	fmt.Println("4.")
	fmt.Println(Indent("line one\nline two\n", "...."))
	fmt.Println("5.")
	fmt.Println(Indent("line one\nline two\n\n", "...."))
	fmt.Println("Done")

	// Output:
	// 1.
	//
	// 2.
	// ....
	//
	// 3.
	// ....line one
	// ....line two
	// 4.
	// ....line one
	// ....line two
	//
	// 5.
	// ....line one
	// ....line two
	// ....
	//
	// Done
}

func ExampleIndent_nested() {
	fmt.Println(Indent("func A(foo string) {\n"+Indent("a := []string{\n"+Indent("\"x\",\n\"y\",\n\"z\",\n", "\t")+"}\n", "\t")+"}\n", "=> "))
	fmt.Println("Done")

	// Output:
	// => func A(foo string) {
	// => 	a := []string{
	// => 		"x",
	// => 		"y",
	// => 		"z",
	// => 	}
	// => }
	//
	// Done
}

func ExampleUnderline_basic() {
	fmt.Println(Underline("TaskCluster Client") + "Please see http://docs.taskcluster.net/tools/clients")

	// Output:
	// TaskCluster Client
	// ==================
	// Please see http://docs.taskcluster.net/tools/clients
}

func ExampleUnderline_multiline() {
	fmt.Println(Underline("TaskCluster Client\nGo (golang) Implementation\n13 Jan 2016") + "Please see http://taskcluster.github.io/taskcluster-client-go")

	// Output:
	// TaskCluster Client
	// Go (golang) Implementation
	// 13 Jan 2016
	// ==========================
	// Please see http://taskcluster.github.io/taskcluster-client-go
}

func ExampleIndefiniteArticle() {
	for _, noun := range []string{
		"ant",
		"dog",
		"emu",
		"fish",
		"gopher",
		"hippopotamus",
		"owl",
	} {
		fmt.Println(IndefiniteArticle(noun), noun)
	}

	// Output:
	// an ant
	// a dog
	// an emu
	// a fish
	// a gopher
	// a hippopotamus
	// an owl
}

func ExampleGoTypeNameFrom() {
	blacklist := make(map[string]bool)
	fmt.Println(GoTypeNameFrom("Azure Artifact Request", blacklist))
	fmt.Println(GoTypeNameFrom("AzureArtifactRequest", blacklist))
	fmt.Println(GoTypeNameFrom("Azure artifact request", blacklist))
	fmt.Println(GoTypeNameFrom("azure-artifact request", blacklist))
	fmt.Println(GoTypeNameFrom("List Artifacts Response", blacklist))

	// Output:
	// AzureArtifactRequest
	// AzureArtifactRequest1
	// AzureArtifactRequest2
	// AzureArtifactRequest3
	// ListArtifactsResponse
}
