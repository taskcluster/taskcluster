package win32_test

import (
	"fmt"

	"github.com/taskcluster/taskcluster/v30/workers/generic-worker/win32"
)

func ExampleMergeEnvLists() {
	lists := []*[]string{
		{
			"a=dog",
			"Pete=man",
			"x=ray",
		}, {
			"food=good",
			"PETE=person",
		},
	}
	res, err := win32.MergeEnvLists(lists...)
	if err != nil {
		fmt.Printf("Hit error: %v\n", err)
	}
	fmt.Println(*res)
	// Output:
	// [a=dog food=good Pete=person x=ray]
}
