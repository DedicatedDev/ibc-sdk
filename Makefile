
build:
	test -d node_modules || npm install
	npx tsc -p tsconfig.json

build-ibctl: build
	npm --prefix . run build-binary

test-e2e: build-ibctl
	npx ava src/tests/devnet/cli_e2e.spec.ts

test-cli: build-ibctl
	npx ava src/tests/devnet/cli.spec.ts

test-vibc-relayer-config: build
	npx ava src/tests/devnet/vibc_relayer_config.spec.ts

test-evm-deploy: build
	npx ava src/tests/devnet/evm_deploy.spec.ts

start: build-ibctl
	./bin/ibctl init -l verbose
	./bin/ibctl start -l verbose

stop: build-ibctl
	./bin/ibctl stop -l verbose

clean: clean-docker
	rm -rf bin dist node_modules ~/.ibc-sdk

build-vibc-core-contracts:
	npx hardhat compile --config ./tests/xdapp/hardhat.config.ts --force
	tar -c -z --strip-components 4 -f - tests/xdapp/artifacts/contracts | \
		base64 | \
		awk 'BEGIN {print "export const contractsTemplate = `"} {print} END {print "`"}' > \
		src/cli/contracts.template.ts

test-all: build-ibctl
	npx ava

clean-docker:
	docker ps -a --format json | grep 'org.polymerlabs.runner=ibc-sdk' | jq .ID | xargs docker rm -f

.PHONY: test test-e2e test-cli test-vibc-relayer-config test-evm-deploy
.PHONY: clean package-contracts
