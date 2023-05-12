# IBC SDK

A NodeJS package that facilitates cross-chain dapp (xdapp) development using IBC.

## What does this package do?

It launches multiple chains from a simple config, funds dev accounts for testing, starts off-chain relayer processes, connects IBC clients/channels, and provides queries of xDapp port/message status

### Who use this package?

xDapp developers who use it to test their xDapps before release them on public testnets or mainnets.

And Polymer devs to ensure Polymer Core Protocol works to the specs.

## What pain points do it solve?

A xDapp requires deploying Smart Contracts (SCs, or similar constructs) on multiple blockchains. Polymer Core Protocol enables cross-chain messages in a permissinoless and trustless way.

### Get everything ready for testing xDapps

As a xdapp developer, here are the prerequites to xdapp testing:

    - launch all supported chains, eg. Ethereum and Wasmd
    - launch the hub (the Polymer chain)
    - fund dev accounts on all chains
    - deploy xdapp specific smart contracts on all chains
    - deploy vIBC specific smart contracts on all chains
    - configure and launch off-chain vIBC and IBC relayers
    - ensure relayers are monitoring the correct set of smart contracts on all chains
    - ensure relayers create IBC clients/connections/channels when needed

This preparation step is cubersome and error-prone due to nuances of various chains. IBC SDK does this in one API call.

### Trace status changes of IBC ports, channels, and xdapp smart contracts

This entails queries to multiple processes including chains and relayers. IBC SDK provides a single query entry that pulls status from all sources.

### What about production mode?

Xdapp developers can use the same IBC SDK query API for their smart contracts and IBC package status query.

IBC developers can gather high-level data from the IBC SDK query API for all traffic involving Polymer Core Protocol, IBC and vIBC. Aggregated data can be visualized in a dashboard.
