import { expect } from "chai";
import { network } from "hardhat";



describe("RewardManager", function () {


    async function deploySystem() {

        const { ethers } =
            await network.connect();


        const [admin, student] =
            await ethers.getSigners();



        // Deploy RewardToken

        const RewardToken =
            await ethers.getContractFactory(
                "RewardToken"
            );


        const token =
            await RewardToken.deploy();


        await token.waitForDeployment();



        // Deploy RewardManager

        const RewardManager =
            await ethers.getContractFactory(
                "RewardManager"
            );


        const manager =
            await RewardManager.deploy(
                await token.getAddress()
            );


        await manager.waitForDeployment();



        // Grant MINTER_ROLE

        const MINTER_ROLE =
            await token.MINTER_ROLE();



        await token.grantRole(
            MINTER_ROLE,
            await manager.getAddress()
        );



        return {
            token,
            manager,
            admin,
            student
        };

    }



    it("Admin can issue reward", async function () {


        const {
            token,
            manager,
            student
        } = await deploySystem();



        await manager.issueReward(
            student.address,
            100,
            "Research Award"
        );



        expect(
            await token.balanceOf(
                student.address
            )
        )
        .to.equal(100);

    });



    it("Should emit RewardIssued event", async function () {


        const {
            manager,
            student
        } = await deploySystem();



        await expect(

            manager.issueReward(
                student.address,
                100,
                "Research Award"
            )

        )
        .to.emit(
            manager,
            "RewardIssued"
        );

    });



    it("Non owner cannot issue reward", async function () {


    const {
        manager,
        student
    } = await deploySystem();


    const { ethers } =
        await network.connect();


    await expect(

        manager
        .connect(student)
        .issueReward(
            student.address,
            100,
            "Hack"
        )

    )
    .to.be.revert(ethers);

});


});