const { getNamedAccounts, ethers } = require("hardhat");
const { getWeth, AMOUNT } = require("../scripts/getWeth");

async function main() {
  await getWeth();
  const { deployer } = await getNamedAccounts();
  //傳入account deployer,抓取lendingPool合約
  const lendingPool = await getLendingPool(deployer);
  console.log(`LendingPool address ${lendingPool.address}`);

  // 入金
  const wethTokenAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  // approve
  // (變數1)要approve的token是WETH,所以傳入weth的地址,(變數2)呼叫的帳號是deployer
  // (變數3)要花費WETH的地址,是lending pool地址,因為要授權給aave的借貸池,能夠動用我們的資金
  // (變數4)要允許花費WETH的數量
  await approveErc20(wethTokenAddress, deployer, lendingPool.address, AMOUNT);
  console.log("Depositing...");
  //入金到lendingPool 中,存入的是WETH,數量,入金的帳號是deployer,他將收到aToken
  // referralCode 輸入0,因為這個參數已棄用
  await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0);
  console.log("Deposited!");
  // 抓取當前user現已借出的金額,入金的抵押品價值,最大可借金額
  let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer);

  const daiPrice = await getDaiPrice();
  //將可以借出的金額,透過匯率轉為DAI, 使用1/ daiPrice, 是因為這是DAI to ETH的匯率,要反過來,才是ETH to DAI的匯率
  // 2022/12/30, 1 DAI = 0.0008423 ETH, 反過來 1 ETH = 1187.22545 DAI
  //在 javascript中toString一樣可以做數學運算,會使用toString是因為兩者相乘超過了javascript所容量的大小,屬於bigNumber
  // 因此才使用toString,否則會出現overflow, 乘以0.95 是為了不要直接借出最大值
  //                                單位是wei,                         (1 /  單位是wei)  兩者相乘得到eth 兩者的wei抵銷
  const amountDaiToBorrow = (await availableBorrowsETH.toString()) * (1 / daiPrice.toNumber()) * 0.95;
  console.log(`You can borrow ${amountDaiToBorrow} DAI`);
  // 為了轉回wei,因此需要用ethers轉換單位
  const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString());

  // 借出DAI
  const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer);
  // 借出之後 在呼叫一次getBorrowUserData,顯示帳戶現在的借出多少錢,抵押品,和最大可借金額
  await getBorrowUserData(lendingPool, deployer);
  // 償還貸款, 呼叫repay function
  // 歸還借出來的Dai代幣 dai地址   歸還借出的Dai           lendingPool合約  要償還貸款的帳戶
  // 償還貸款後,呼叫 檢查帳戶現在的狀態,是否已還清
  await getBorrowUserData(lendingPool, deployer);
}

async function repay(daiAddress, amount, lendingPool, account) {
  //要repay 償還貸款之前,要先approve,允許aave動用用戶錢包
  await approveErc20(daiAddress, account, lendingPool.address, amount);
  //呼叫lendingPool償還貸款的function,      償還的token 數量  利息計算   償還貸款的用戶
  const repayTx = await lendingPool.repay(daiAddress, amount, 1, account);
  await repayTx.wait(1);
  console.log("Repaid!");
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
  //呼叫lendPool合約的borrow function,     借出DAI token,  借出數量,      計算利息的方式, 0(已棄用) , 承擔債務的帳號
  const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account);
  await borrowTx.wait(1);
  console.log("You have borrowed!");
}

async function getDaiPrice() {
  //因為只需要讀取幣價,而不是發送交易,所以不需要account(signer)
  const daiEthPriceFeed = await ethers.getContractAt("AggregatorV3Interface", "0x773616E4d11A78F511299002da57A0a94577F1f4");
  // const { answer } = await daiEthPriceFeed.latestRoundData();
  // 這行的意思是 呼叫daiEthPriceFeed合約的latestRoundData function,取得第[1]個回傳變數,回傳變數是從0,1,2開始算
  // 所以實際上是第二個回傳變數,這行與上面那行相同
  const answer = (await daiEthPriceFeed.latestRoundData())[1];
  console.log(`The DAI/ETH price is ${answer.toString()}`);
  return answer;
}

//                       合約本身被當作變數傳遞進來
async function getBorrowUserData(lendingPool, account) {
  //從lendPool 合約中 呼叫function 取得特定用戶的資訊
  const { totalCollateralETH, totalDebtETH, availableBorrowsETH } = await lendingPool.getUserAccountData(account);
  //您的抵押品值多少錢
  console.log(`You have ${totalCollateralETH} worth of ETH deposited`);
  //您現在借出多少錢
  console.log(`You have ${totalDebtETH} worth of ETH borrowed`);
  //您可借出的金額
  console.log(`You can borrow ${availableBorrowsETH} worth of ETH`);
  return { availableBorrowsETH, totalDebtETH };
}

async function getLendingPool(account) {
  //使用abi,address,account連上合約,
  const LendingPoolAddressesProvider = await ethers.getContractAt(
    "ILendingPoolAddressesProvider",
    "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
    account
  );
  //呼叫provider合約,取得lending Pool地址
  const lendingPoolAddress = await LendingPoolAddressesProvider.getLendingPool();
  //使用abi(ILendingPool), address, account 抓到lendingPool合約
  const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account);
  //將合約回傳,就可以在上層使用
  return lendingPool;
}

async function approveErc20(erc20Address, account, spenderAddress, amountToSpend) {
  //要使用ERC20的approve,也一樣需要abi,address,account
  //也可以直接使用IWeth的approve function 這是選擇性的
  const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account);
  //呼叫ERC20合約的approve function,傳入變數
  const tx = await erc20Token.approve(spenderAddress, amountToSpend);
  await tx.wait(1);
  console.log("Approved!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
