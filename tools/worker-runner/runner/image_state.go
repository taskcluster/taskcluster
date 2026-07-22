package runner

import "log"

const imageStateComplete = "IMAGE_STATE_COMPLETE"

func waitForImageStateComplete(readImageState func() (string, error), wait func()) {
	for {
		imageState, err := readImageState()
		if err != nil {
			log.Printf("Could not read Windows image state: %v; retrying", err)
		} else if imageState == imageStateComplete {
			log.Printf("Windows image state is %s", imageStateComplete)
			return
		} else {
			log.Printf("Windows image state is %q; waiting for %s", imageState, imageStateComplete)
		}

		wait()
	}
}
