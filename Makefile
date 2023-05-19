
build:
	npm install
	npx tsc -p tsconfig.json

build-ibctl: build
	npm --prefix . run build-binary

test-e2e: build-ibctl
	npx ava src/tests/devnet/cli-e2e.test.ts

test-cli: build-ibctl
	npx ava src/tests/devnet/cli.test.ts

test-vibc-relayer-config: build
	npx ava src/tests/devnet/vibc_relayer-config.test.ts

test-evm-deploy: build
	npx ava src/tests/devnet/evm-deploy.test.ts

start: build-ibctl
	./bin/ibctl init
	./bin/ibctl start

stop: build-ibctl
	./bin/ibctl stop

clean: stop
	rm -rf bin dist node_modules ~/.ibc-sdk

package-contracts:
	tar -c -z --strip-components 4 -f - tests/xdapp/artifacts/contracts | \
		base64 | \
		awk 'BEGIN {print "export const contractsTemplate = `"} {print} END {print "`"}' > \
		src/cli/contracts.template.ts

test:
	npx ava

.PHONY: test test-e2e test-cli test-vibc-relayer-config test-evm-deploy
.PHONY: clean package-contracts
