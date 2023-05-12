import { ethers } from 'hardhat'

// deploy polymer-related contracts
async function deployPolymer() {
  const contracts: {[key: string]: string} = {};

  for (const contractName of ['Verifier', 'Earth', 'Mars']) {
    const factory = await ethers.getContractFactory(contractName)
    let contract = await factory.deploy()
    contract = await contract.deployed()
    contracts[contractName] = contract.address;
    console.log(`deploy ${contractName} at ${contract.address}`)
  }

  const Dispatcher = await ethers.getContractFactory('Dispatcher')
  const dispatcher = await Dispatcher.deploy(contracts.Verifier);
  await dispatcher.deployed();

  console.log(`deploy Dispatcher at ${dispatcher.address}`)
}

// test contract from Hardhat
async function deployLock() {
  const currentTimestampInSeconds = Math.round(Date.now() / 1000)
  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60
  const unlockTime = currentTimestampInSeconds + ONE_YEAR_IN_SECS

  const lockedAmount = ethers.utils.parseEther('1')

  const Lock = await ethers.getContractFactory('Lock')
  const lock = await Lock.deploy(unlockTime, { value: lockedAmount })

  await lock.deployed()

  console.log('Lock with 1 ETH deployed to:', lock.address)
}

async function main() {
  await deployLock()
  await deployPolymer()
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
