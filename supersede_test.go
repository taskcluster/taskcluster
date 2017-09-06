package main

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"testing"
)

func TestSupersede(t *testing.T) {
	setup(t, "TestSupersede")
	defer teardown(t)

	command := helloGoodbye()

	taskIDs := make([]string, 3)
	for i := 0; i < len(taskIDs); i++ {
		payload := GenericWorkerPayload{
			Command:       command,
			MaxRunTime:    30,
			SupersederURL: "http://localhost:52856/TestSupersede",
		}
		td := testTask(t)

		taskIDs[i] = scheduleTask(t, td, payload)
	}
	serviceResponse := SupersedesServiceResponse{
		TaskIDs: taskIDs,
	}

	s := http.Server{
		Addr: ":52856",
	}

	serviceResponseBody, err := json.Marshal(serviceResponse)
	if err != nil {
		t.Fatalf("Could not marshal service response body into json: %v", err)
	}

	http.HandleFunc("/TestSupersede", func(res http.ResponseWriter, req *http.Request) {
		_, err := res.Write(serviceResponseBody)
		if err != nil {
			t.Fatalf("Mock supersede service could not write http response: %v", err)
		}
	})

	go s.ListenAndServe()
	defer s.Shutdown(context.Background())

	for i, taskID := range taskIDs {
		t.Logf("Executing task %v", taskID)
		execute(t)
		if i == 0 {
			ensureResolution(t, taskID, "completed", "completed")
		} else {
			ensureResolution(t, taskID, "exception", "superseded")
			x, _, _, _ := getArtifactContent(t, taskID, "public/superseded-by.json")
			var actualData interface{}
			err = json.Unmarshal(x, &actualData)
			if err != nil {
				t.Fatalf("Error unmarshaling public/superseded-by.json into json: %v", err)
			}
			expectedData := map[string]interface{}{
				"taskId": taskIDs[0],
			}
			if !reflect.DeepEqual(actualData, expectedData) {
				t.Fatalf("public/superseded-by.json has unexpected content in task %v.\nActual: %#v\nExpected: %#v", taskID, actualData, expectedData)
			}
		}
	}
}

func TestEmptySupersedeList(t *testing.T) {
	setup(t, "TestSupersede")
	defer teardown(t)

	payload := GenericWorkerPayload{
		Command:       helloGoodbye(),
		MaxRunTime:    30,
		SupersederURL: "http://localhost:52856/TestEmptySupersedeList",
	}
	td := testTask(t)

	taskID := scheduleTask(t, td, payload)

	s := http.Server{
		Addr: ":52856",
	}

	serviceResponseBody, err := json.Marshal(SupersedesServiceResponse{})
	if err != nil {
		t.Fatalf("Could not marshal service response body into json: %v", err)
	}

	http.HandleFunc("/TestEmptySupersedeList", func(res http.ResponseWriter, req *http.Request) {
		_, err := res.Write(serviceResponseBody)
		if err != nil {
			t.Fatalf("Mock supersede service could not write http response: %v", err)
		}
	})

	go s.ListenAndServe()
	defer s.Shutdown(context.Background())

	t.Logf("Executing task %v", taskID)
	execute(t)
	ensureResolution(t, taskID, "completed", "completed")
}
