
npm-install:
	npm install

build: npm-install
	npx tsc -p tsconfig.json

build-ibctl: build
	npx esbuild src/cli/main.ts --bundle --platform=node --outfile=bin/ibctl

test-e2e: build-ibctl
	npx ava src/tests/devnet/cli_e2e.spec.ts

test-cli: build-ibctl
	npx ava src/tests/devnet/cli.spec.ts

test-evm-deploy: build
	npx ava src/tests/devnet/evm_deploy.spec.ts

start: build-ibctl
	./bin/ibctl init -l verbose
	./bin/ibctl start -l verbose

stop: build-ibctl
	./bin/ibctl stop -l verbose

clean:
	rm -rf bin dist node_modules

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

test-all: build-ibctl
	npx ava

clean-docker:
	docker ps -a --format json | grep 'org.polymerlabs.runner=ibc-sdk' | jq .ID | xargs docker rm -f || true
	rm -rf ~/.ibc-sdk

.PHONY: test test-e2e test-cli test-evm-deploy
.PHONY: clean build-ibctl

.DEFAULT_GOAL := build-ibctl
