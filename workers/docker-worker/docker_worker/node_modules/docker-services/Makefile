.PHONY: test
test: associate
	make -C associate test
	make -C examples/node_cmd
	make -C examples/node_server
	make -C examples/docker_in_docker
	./node_modules/.bin/mocha $(wildcard *_test.js) $(wildcard test/*_test.js)

.PHONY: associate
associate:
	make -C associate

.PHONY: publish
publish: associate
	docker push lightsofapollo/docker-service-associate
	npm publish
