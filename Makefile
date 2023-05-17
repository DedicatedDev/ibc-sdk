build:
	npm install
	npx tsc -p tsconfig.json
	npm --prefix . run build-binary

test-e2e: build
	npx ava src/tests/devnet/cli-e2e.test.ts

test-cli: build
	npx ava src/tests/devnet/cli.test.ts

test-vibc-relayer-config: build
	npx ava src/tests/devnet/polyrelayer-config.test.ts

start: build
	./bin/ibctl init
	./bin/ibctl start

stop:
	./bin/ibctl stop

clean: stop
	rm -rf bin dist node_modules ~/.ibc-sdk
