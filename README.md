# Polymer DevKit

A NodeJS package that facilitates cross-chain Dapp development (aka. xDapp dev).

## What does this package do?

It launches multiple chains from a simple config, funds dev accounts for testing, starts off-chain relayer processes, connects IBC clients/channels, and provides queries of xDapp port/message status

### Who use this package?

xDapp developers who use it to test their xDapps before release them on public testnets or mainnets.

And Polymer devs to ensure Polymer Core Protocol works to the specs.

## What pain points do it solve?

A xDapp requires deploying Smart Contracts (SCs, or similar constructs) on multiple blockchains. Polymer Core Protocol enables cross-chain messages in a permissinoless and trustless way.

### Get everything ready for testing xDapps

As a xDapp developer, here are the prerequites to xDapp testing:

    - launch all supported rollup chains, eg. ETH, BSC, Polygon, Avalanche
    - launch Polymerase (the Polymer chain)
    - fund dev accounts on all chains
    - deploy xDapp specific SCs on all chains
    - deploy Polymer specific SCs on all chains, eg. Dispatcher
    - configure and launch and off-chain (rollup) IBC relayers
    - ensure relayers are monitoring the correct set of SCs on all chains
    - ensure relayers create IBC clients/channels when needed

This preparation step is cubersome and error-prone due to nuances of various chains. DevKit does this in one API call.

### Trace status changes of IBC ports, channels, and xDapp SCs

This entail quries of multiple processes including chains and relayers. DevKit provides a single query entry that pulls status from all sources.

### What about production mode?

xDapps devs can use the same DevKit query API for their SCs and IBC package status query.

Polymer devs can gather high-level data from DevKit query API for all traffic invovling Polymer Core Protocol. Aggregated data can be visualized in a (fancy) dashboard.

## How workflows differ between dev and prod?

See this [Miro board](https://miro.com/app/board/uXjVOkhY0DE=/) (Polymer login required for access).
