build:
	npm install
	npx tsc -p tsconfig.json
	npm --prefix . run build-binary

test: build
	npx ava src/tests/devnet/cli-e2e.test.ts

start: build
	./bin/ibctl init
	./bin/ibctl start

stop:
	./bin/ibctl stop

clean: stop
	docker ps -a --format json | grep "org.polymerlabs.runner=ibc-sdk" | jq .ID | xargs docker rm -f
	rm -rf bin dist node_modules .ibc-sdk