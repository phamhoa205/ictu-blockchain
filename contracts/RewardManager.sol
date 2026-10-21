// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;


import "@openzeppelin/contracts/access/Ownable.sol";
import "./RewardToken.sol";


contract RewardManager is Ownable {


    RewardToken public rewardToken;


    event RewardIssued(
        address indexed student,
        uint256 amount,
        string reason
    );


    constructor(
        address tokenAddress
    )
        Ownable(msg.sender)
    {

        rewardToken = RewardToken(tokenAddress);

    }

        

    function issueReward(
        address student,
        uint256 amount,
        string memory reason
    )
    public onlyOwner
    {

        rewardToken.mint(
            student,
            amount
        );


        emit RewardIssued(
            student,
            amount,
            reason
        );

    }

}