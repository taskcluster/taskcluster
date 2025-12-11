package win32_test

import (
	"testing"

	"github.com/taskcluster/taskcluster/v95/workers/generic-worker/win32"
)

func TestMergeNilListsFirstNil(t *testing.T) {
	res, err := win32.MergeEnvLists(nil, &[]string{"FOO=bar"})
	if err != nil {
		t.Fatalf("Hit error: %v", err)
	}
	if res == nil || len(*res) != 1 || (*res)[0] != "FOO=bar" {
		t.Fatalf("Did not merge correctly; got %#v", res)
	}
}

func TestMergeNilListsSecondNil(t *testing.T) {
	res, err := win32.MergeEnvLists(&[]string{"FOO=bar"}, nil)
	if err != nil {
		t.Fatalf("Hit error: %v", err)
	}
	if res == nil || len(*res) != 1 || (*res)[0] != "FOO=bar" {
		t.Fatalf("Did not merge correctly; got %#v", res)
	}
}
