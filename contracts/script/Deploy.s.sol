// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Verifier.sol";
import "../src/GovernanceToken.sol";
import "../src/AnonymousVoting.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Groth16Verifier deployed at:", address(verifier));

        GovernanceToken token = new GovernanceToken(deployer);
        console.log("GovernanceToken deployed at:", address(token));

        AnonymousVoting voting = new AnonymousVoting(address(verifier));
        console.log("AnonymousVoting deployed at:", address(voting));

        vm.stopBroadcast();
    }
}
