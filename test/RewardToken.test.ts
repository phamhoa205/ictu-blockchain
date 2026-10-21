import { expect } from "chai";
import { network } from "hardhat";
import { ethers } from "ethers";

describe("RewardToken", function () {

  it("Should deploy token correctly", async function () {

    const { ethers } = await network.connect();

    const RewardToken =
      await ethers.getContractFactory("RewardToken");


    const token =
      await RewardToken.deploy();


    await token.waitForDeployment();


    expect(
      await token.name()
    ).to.equal(
      "ICTU Reward Token"
    );


    expect(
      await token.symbol()
    ).to.equal(
      "ICTU"
    );

  });



  it("Minter can mint token", async function () {

    const { ethers } =
        await network.connect();


    const [admin, student] =
        await ethers.getSigners();



    const RewardToken =
        await ethers.getContractFactory(
            "RewardToken"
        );


    const token =
        await RewardToken.deploy();


    await token.waitForDeployment();



    const MINTER_ROLE =
        await token.MINTER_ROLE();



    await token.grantRole(
        MINTER_ROLE,
        admin.address
    );



    await token
        .connect(admin)
        .mint(
            student.address,
            100
        );



    expect(
        await token.balanceOf(
            student.address
        )
    )
    .to.equal(100);

});



  it("Non owner cannot mint token", async function () {


    const { ethers } =
      await network.connect();


    const [owner, student] =
      await ethers.getSigners();


    const RewardToken =
      await ethers.getContractFactory("RewardToken");


    const token =
      await RewardToken.deploy();


    await token.waitForDeployment();


    await expect(
      token.connect(student)
      .mint(student.address,100)
    )
    .to.be.revert(ethers);


  });


});