
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

POLYMER_CHAIN_DIR = ../polymerase/chain
PROTO_FILES = $(shell find $(POLYMER_CHAIN_DIR)/proto/ -name '*.proto')

proto-gen:
	@test -d $(POLYMER_CHAIN_DIR) || { echo "$(POLYMER_CHAIN_DIR) does not exist" ; exit 1; }
	protoc \
		--plugin=./node_modules/.bin/protoc-gen-ts_proto \
		--ts_proto_opt="esModuleInterop=true,forceLong=string,useOptionals=messages" \
		--proto_path="$(POLYMER_CHAIN_DIR)/proto" \
		--proto_path="$(POLYMER_CHAIN_DIR)/third_party/proto/cosmos-sdk@v0.47" \
		--proto_path="$(POLYMER_CHAIN_DIR)/third_party/proto/third_party" \
		--proto_path="$(POLYMER_CHAIN_DIR)/third_party/proto/ibc-go@v7" \
		--proto_path="$(POLYMER_CHAIN_DIR)/third_party/proto/ibc-go@v7_dep" \
		--ts_proto_out=./src/lib/cosmos/client/_generated $(PROTO_FILES)

test-vibc-core-contracts:
	cd tests/xdapp && npx hardhat test

test-all: build-ibctl test-vibc-core-contracts
	npx ava

clean-docker:
	docker ps -a --format json | grep 'org.polymerlabs.runner=ibc-sdk' | jq .ID | xargs docker rm -f || true

.PHONY: test test-e2e test-cli test-vibc-relayer-config test-evm-deploy
.PHONY: clean package-contracts
