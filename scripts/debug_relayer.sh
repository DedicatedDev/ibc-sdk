#!/bin/sh

set -e

polymer_port=$(docker ps --format json|grep polymerdao/polymer|jq .Ports|tr " " "\n"|grep 26657|cut -d ':' -f 2|cut -d '-' -f 1)
wasm_port=$(docker ps --format json|grep polymerdao/wasm|jq .Ports|tr " " "\n"|grep 26657|cut -d ':' -f 2|cut -d '-' -f 1)
relayer_id=$(docker ps --format json|grep relayer-ibcx|jq -r .ID)

docker cp $relayer_id:/home/relayer/.relayer ~

config_file=~/.relayer/config/config.yaml
polymer_addr=$(grep 'rpc-addr: tcp://172.' $config_file | head -n 1 | cut -d '/' -f 3)
sed -ie "s/            rpc-addr: tcp:\/\/${polymer_addr}/            rpc-addr: tcp:\/\/localhost:${polymer_port}/" $config_file
wasm_addr=$(grep 'rpc-addr: tcp://172.' $config_file | head -n 1 | cut -d '/' -f 3)
sed -ie "s/            rpc-addr: tcp:\/\/${wasm_addr}/            rpc-addr: tcp:\/\/localhost:${wasm_port}/" $config_file
cd ../relayer && dlv debug ./main.go -- start -d -b 1000000000
