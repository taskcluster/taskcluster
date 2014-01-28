TARGET?=taskcluster/docker-worker

.PHONY: docker_worker
docker_worker:
	docker build -t $(TARGET) docker_worker

.PHONY: taskenv_fail
taskenv_fail:
	docker build -t taskcluster/test-taskenv:fail taskenv_fail

.PHONY: taskenv_pass
taskenv_pass:
	docker build -t taskcluster/test-taskenv:pass taskenv_pass

.PHONY: test
test: taskenv_fail taskenv_pass docker_worker
	./docker_worker/node_modules/.bin/docker-services exec \
		-v=/var/run/docker.sock:/docker.sock \
		-e=DOCKER_PORT=/docker.sock \
		app npm test
