const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Vesting", function () {
  let bit;
  let vesting;

  let owner;
  let addr1;
  let addr2;
  let addr3;
  let addrs;  

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    // Deployment of ERC20 Token
    let Bit = await ethers.getContractFactory("Token");
    bit = await Bit.deploy("Bits Token", "BITS");

    // Deployment of share contract
    let Vesting = await ethers.getContractFactory("Vesting");
    vesting = await Vesting.deploy(bit.address);

    await bit.mint(owner.address, 1000000);
    await bit.approve(vesting.address, 1000000);
  });

  it("Should create vesting pool", async function() {
    await vesting.createVestingPool(
        0, // TGE percentage
        Math.round(Date.now() / 1000), // time for TGE
        100, // cliff duration
        100, // vesting duration
        10, // vesting interval
        1000 // vested amount
    );
  });

  it("Should create vesting pools", async function() {
    await vesting.createVestingPools(
        [0], // TGE percentage
        [Math.round(Date.now() / 1000)], // time for TGE
        [100], // cliff duration
        [100], // vesting duration
        [10], // vesting interval
        [1000] // vested amount
    );      
  });

  it("Should create user vesting", async function() {
    const ts = await time.latest();

    const tx = await vesting.createVestingPool(
        0, // TGE percentage
        ts - 150, // time for TGE
        100, // cliff duration
        100, // vesting duration
        10, // vesting interval
        1000 // vested amount
    );

    const rc = await tx.wait();
    const event = rc.events.find(event => event.event === 'VestingPoolCreated');
    const [vestingPoolId] = event.args;    

    {
      const [tgep, tge, cliff, vestingDuration, vestingInterval, vestedAmount] = 
        await vesting.getVestingPool(vestingPoolId);

      expect(tgep).to.equal(0),
      expect(tge).to.equal(ts - 150);
      expect(cliff).to.equal(100);
      expect(vestingDuration).to.equal(100);
      expect(vestingInterval).to.equal(10);
      expect(vestedAmount).to.equal(1000);
    }

    {
      const [tgep, tge, cliff, vestingDuration, vestingInterval] = 
        await vesting.getVestingParams(vestingPoolId);

      expect(tgep).to.equal(0),
      expect(tge).to.equal(ts - 150);
      expect(cliff).to.equal(100);
      expect(vestingDuration).to.equal(100);
      expect(vestingInterval).to.equal(10);  
    }

    await vesting.createUserVestings(
        [addr1.address, addr1.address],
        [500, 500],
        [vestingPoolId, vestingPoolId],
        [false, false]
    );
    const userVestingLength = await vesting.userVestingsLength(addr1.address);
    expect(userVestingLength).to.equal(2);

    const [userVestingId] = await vesting.userVestingsIds(addr1.address);

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("1000"));
    expect(withdrawn).to.equal(BigNumber.from("0"));
    expect(available).to.equal(BigNumber.from("500"));

    expect(await bit.balanceOf(addr1.address)).to.equal(0);
    await vesting.connect(addr1).withdraw(userVestingId);
    await vesting.connect(addr1).withdrawAll();
    expect(await bit.balanceOf(addr1.address)).to.equal(500);

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("1000"));
    expect(withdrawn).to.equal(BigNumber.from("500"));
    expect(available).to.equal(BigNumber.from("0"));

    await vesting.cancelUserVesting(vestingPoolId, userVestingId);

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("500"));
    expect(withdrawn).to.equal(BigNumber.from("250"));
    expect(available).to.equal(BigNumber.from("0"));    

    const poolData = await vesting.getVestingPool(vestingPoolId);
    expect(poolData.totalAmount.toNumber()).equal(1000);
    expect(poolData.allocatedAmount.toNumber()).equal(750);

    // We must check that no double spent is possible
    await expect(
      vesting.createUserVesting(
        addr1.address,
        500,
        vestingPoolId,
        false
      )
    ).to.be.revertedWith("too much allocated");  

    // We can allocate missing part
    await vesting.createUserVesting(addr1.address, 250, vestingPoolId, false);
    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("750"));
    expect(withdrawn).to.equal(BigNumber.from("250"));
    expect(available).to.equal(BigNumber.from("125"));    
  });

  it("Should properly west on two people", async function() {
    const ts = await time.latest();

    const tx = await vesting.createVestingPool(
        0, // TGE percentage
        ts - 150, // time for TGE
        100, // cliff duration
        100, // vesting duration
        10, // vesting interval
        1000 // vested amount
    );

    const rc = await tx.wait();
    const event = rc.events.find(event => event.event === 'VestingPoolCreated');
    const [vestingPoolId] = event.args;    

    {
      const [tgep, tge, cliff, vestingDuration, vestingInterval, vestedAmount] = 
        await vesting.getVestingPool(vestingPoolId);

      expect(tgep).to.equal(0),
      expect(tge).to.equal(ts - 150);
      expect(cliff).to.equal(100);
      expect(vestingDuration).to.equal(100);
      expect(vestingInterval).to.equal(10);
      expect(vestedAmount).to.equal(1000);
    }

    {
      const [tgep, tge, cliff, vestingDuration, vestingInterval] = 
        await vesting.getVestingParams(vestingPoolId);

      expect(tgep).to.equal(0),
      expect(tge).to.equal(ts - 150);
      expect(cliff).to.equal(100);
      expect(vestingDuration).to.equal(100);
      expect(vestingInterval).to.equal(10);  
    }

    await vesting.createUserVestings(
        [addr1.address, addr2.address],
        [500, 500],
        [vestingPoolId, vestingPoolId],
        [false, false]
    );

    {
      const userVestingLength = await vesting.userVestingsLength(addr1.address);
      expect(userVestingLength).to.equal(1);
    }

    {
      const userVestingLength = await vesting.userVestingsLength(addr2.address);
      expect(userVestingLength).to.equal(1);
    }    


    const [userVestingId] = await vesting.userVestingsIds(addr1.address);

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("500"));
    expect(withdrawn).to.equal(BigNumber.from("0"));
    expect(available).to.equal(BigNumber.from("250"));

    expect(await bit.balanceOf(addr1.address)).to.equal(0);
    await vesting.connect(addr1).withdraw(userVestingId);
    await vesting.connect(addr1).withdrawAll();
    expect(await bit.balanceOf(addr1.address)).to.equal(250);

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("500"));
    expect(withdrawn).to.equal(BigNumber.from("250"));
    expect(available).to.equal(BigNumber.from("0"));

    await vesting.cancelUserVesting(vestingPoolId, userVestingId);

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("0"));
    expect(withdrawn).to.equal(BigNumber.from("0"));
    expect(available).to.equal(BigNumber.from("0"));    

    const poolData = await vesting.getVestingPool(vestingPoolId);
    expect(poolData.totalAmount.toNumber()).equal(1000);
    expect(poolData.allocatedAmount.toNumber()).equal(750);

    // We must check that no double spent is possible
    await expect(
      vesting.createUserVesting(
        addr3.address,
        500,
        vestingPoolId,
        false
      )
    ).to.be.revertedWith("too much allocated");  

    // We can allocate missing part
    await vesting.createUserVesting(addr3.address, 250, vestingPoolId, false);
    var [total, withdrawn, available] = await vesting.getWalletInfo(addr3.address);
    expect(total).to.equal(BigNumber.from("250"));
    expect(withdrawn).to.equal(BigNumber.from("0"));
    expect(available).to.equal(BigNumber.from("125"));   
  });

  it("Should show empty vesting allowance", async function() {
    const ts = await time.latest();

    const tx = await vesting.createVestingPool(
      100, // TGE percentage
      ts + 100, // time for TGE
      100, // cliff duration
      100, // vesting duration
      10, // vesting interval
      1000 // vested amount
    );    

    const rc = await tx.wait();
    const event = rc.events.find(event => event.event === 'VestingPoolCreated');
    const [vestingPoolId] = event.args;        

    await vesting.createUserVesting(
      addr1.address,
      500,
      vestingPoolId,
      false
    );    

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("500"));
    expect(withdrawn).to.equal(BigNumber.from("0"));
    expect(available).to.equal(BigNumber.from("0"));        
  });

  it("Should show empty vesting allowance after tge", async function() {
    const ts = await time.latest();

    const tx = await vesting.createVestingPool(
      0, // TGE percentage
      ts, // time for TGE
      100, // cliff duration
      100, // vesting duration
      10, // vesting interval
      1000 // vested amount
    );    

    const rc = await tx.wait();
    const event = rc.events.find(event => event.event === 'VestingPoolCreated');
    const [vestingPoolId] = event.args;        

    await vesting.createUserVesting(
      addr1.address,
      500,
      vestingPoolId,
      false
    );    

    var [total, withdrawn, available] = await vesting.getWalletInfo(addr1.address);
    expect(total).to.equal(BigNumber.from("500"));
    expect(withdrawn).to.equal(BigNumber.from("0"));
    expect(available).to.equal(BigNumber.from("0"));        
  });  

});