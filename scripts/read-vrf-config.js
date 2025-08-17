const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const addr = process.env.CLAIMS_PROCESSOR_ADDRESS;
  if (!addr) throw new Error("CLAIMS_PROCESSOR_ADDRESS missing in env");
  const [admin] = await hre.ethers.getSigners();
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const c = ClaimsProcessor.attach(addr).connect(admin);

  const coord = await c.vrfCoordinator();
  const subId = await c.vrfSubscriptionId();
  const keyhash = await c.vrfKeyHash();
  const gasLimit = await c.vrfCallbackGasLimit();
  const confs = await c.vrfRequestConfirmations();

  console.log("ClaimsProcessor:", addr);
  console.log("vrfCoordinator:", coord);
  console.log("vrfSubscriptionId:", subId.toString());
  console.log("vrfKeyHash:", keyhash);
  console.log("vrfCallbackGasLimit:", Number(gasLimit));
  console.log("vrfRequestConfirmations:", Number(confs));
}

main().catch((e)=>{ console.error(e); process.exit(1); });
