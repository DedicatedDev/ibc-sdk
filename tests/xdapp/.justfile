# list all cmds
_default:
  @echo This script is for internal testing only. 
  @echo Do not publish: '{{justfile()}}'
  @echo =======================================
  @just --list -f {{justfile()}}

# start chainsets with devkit
test-launch-chainsets:
  npx hardhat test --no-compile integration_tests/start_chainsets.ts

# launch devkit chains; then deploy contracts
test-launch-deploy: test-launch-chainsets deploy

# run deploy script on devkit generated hardhat config
deploy:
  npx hardhat run --config integration_test.config.ts --network eth scripts/deploy.ts
  npx hardhat run --config integration_test.config.ts --network bsc scripts/deploy.ts
  npx hardhat run --config integration_test.config.ts --network fantom scripts/deploy.ts
  npx hardhat run --config integration_test.config.ts --network avalanche scripts/deploy.ts
  # npx hardhat run --config integration_test.config.ts --network polygon scripts/deploy.ts

# Caution: stop all docker containers and delete chainset run folders
reset:
  docker container stop `docker container ps -q` || true
  rm -r /tmp/test-chainsets/* || true