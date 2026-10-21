// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;


import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";


contract RewardToken is ERC20, AccessControl {


    bytes32 public constant MINTER_ROLE =
        keccak256("MINTER_ROLE");



    constructor()
        ERC20("ICTU Reward Token", "ICTU")
    {

        _grantRole(
            DEFAULT_ADMIN_ROLE,
            msg.sender
        );

    }



    function mint(
        address student,
        uint256 amount
    )
    public onlyRole(MINTER_ROLE)
    {

        _mint(
            student,
            amount
        );

    }

}