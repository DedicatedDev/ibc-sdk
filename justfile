

local_repos := './repos'
push_images := env_var_or_default('push_images', '')

_clone repo_url branch:
  #!/usr/bin/env bash
  set -euxo pipefail

  repo_dir={{ local_repos / file_name(repo_url) }}
  if ! test -d "$repo_dir"; then \
    git clone --depth=1 --branch={{branch}} {{repo_url}} "$repo_dir"; \
  fi

_build repo_url branch: (_clone repo_url branch)
  #!/usr/bin/env bash
  set -euxo pipefail

  name={{ file_name(repo_url) }}
  docker build -t "${name}-build" {{ local_repos / "$name" }}
  cd docker && docker build -t "ghcr.io/polymerdao/$name" -f "${name}.Dockerfile" .
  if test -n "{{push_images}}"; then \
    docker push "ghcr.io/polymerdao/$name"; \
  fi

build-gaia: (_build 'https://github.com/cosmos/gaia' 'v8.0.0')
build-juno: (_build 'https://github.com/CosmosContracts/juno' 'v12')

build-all: build-juno build-gaia

clean:
  rm -rf {{local_repos}}/*
