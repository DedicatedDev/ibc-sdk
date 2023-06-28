npm-install:
	npm install

build: npm-install
	npx hardhat compile --force

test: npm-install
	npx hardhat test

.DEFAULT_GOAL := build

.PHONY: test
