TARGET?=taskcluster/docker-worker

.PHONY: docker_worker
docker_worker:
	docker build -t $(TARGET) docker_worker

.PHONY: taskenv_fail
taskenv_fail:
	docker build -t lightsofapollo/test-taskenv:fail taskenv_fail

.PHONY: taskenv_pass
taskenv_pass:
	docker build -t lightsofapollo/test-taskenv:pass taskenv_pass

.PHONY: test
test: taskenv_fail taskenv_pass
	cd docker_worker && make test
