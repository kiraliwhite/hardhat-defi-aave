const { getNamedAccounts, ethers } = require("hardhat");

const AMOUNT = ethers.utils.parseEther("0.02");

async function getWeth() {
  const { deployer } = await getNamedAccounts();
  // goerli WETH  0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6
  // mainnet WETH  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  //使用 contractAt 將合約地址 ABI 與帳戶關聯
  const iWeth = await ethers.getContractAt("IWeth", "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", deployer);
  //呼叫合約 入金0.02 ETH 換成WETH
  const tx = await iWeth.deposit({ value: AMOUNT });
  await tx.wait(1);
  //呼叫WETH合約的balanceOf function 列出deployer帳戶所持有的WETH
  const wethBalance = await iWeth.balanceOf(deployer);
  console.log(`Got ${wethBalance.toString()} WETH`);
}

module.exports = { getWeth, AMOUNT };
