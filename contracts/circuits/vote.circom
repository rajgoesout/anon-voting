/*
 * AnonymousVote Circuit
 * =====================
 * Circom 2.0 — requires circomlib
 *
 * BUILD STEPS (run from contracts/ directory):
 * ─────────────────────────────────────────────
 * 1. Install tools:
 *      pnpm add -g circom snarkjs
 *    or
 *      npm install -g circom snarkjs
 *
 * 2. Compile the circuit:
 *      mkdir -p circuits/build
 *      circom circuits/vote.circom --r1cs --wasm --sym -o circuits/build/
 *
 * 3. Powers of Tau (phase 1 — chain-specific, reusable):
 *      snarkjs powersoftau new bn128 20 circuits/build/pot20_0000.ptau -v
 *      snarkjs powersoftau contribute circuits/build/pot20_0000.ptau \
 *              circuits/build/pot20_0001.ptau --name="First contribution" -v
 *      snarkjs powersoftau prepare phase2 circuits/build/pot20_0001.ptau \
 *              circuits/build/pot20_final.ptau -v
 *
 * 4. Groth16 setup (phase 2 — circuit-specific):
 *      snarkjs groth16 setup circuits/build/vote.r1cs \
 *              circuits/build/pot20_final.ptau circuits/build/vote_0000.zkey
 *      snarkjs zkey contribute circuits/build/vote_0000.zkey \
 *              circuits/build/vote_final.zkey --name="First phase2 contribution" -v
 *
 * 5. Export verification key and Solidity verifier:
 *      snarkjs zkey export verificationkey circuits/build/vote_final.zkey \
 *              circuits/build/verification_key.json
 *      snarkjs zkey export solidityverifier circuits/build/vote_final.zkey \
 *              src/Verifier.sol
 *
 * 6. Copy circuit artifacts to frontend:
 *      cp circuits/build/vote_js/vote.wasm ../../frontend/public/circuits/vote.wasm
 *      cp circuits/build/vote_final.zkey   ../../frontend/public/circuits/vote_final.zkey
 *
 * PUBLIC SIGNALS (order matters — must match AnonymousVoting.sol):
 *   index 0: isWhale (OUTPUT — snarkjs emits outputs first)
 *   index 1: merkleRoot
 *   index 2: nullifierHash
 *   index 3: proposalId
 *   index 4: voteValue
 *   index 5: whaleThresholdBps
 *   index 6: totalSupply
 */

pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// ─── Merkle Inclusion Proof ───────────────────────────────────────────────────

template MerkleInclusionProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal currentHash[levels + 1];
    signal left[levels];
    signal right[levels];
    // Intermediate signals: one multiplication per constraint (R1CS requirement)
    signal idxTimesCurrent[levels];   // pathIndices[i] * currentHash[i]
    signal idxTimesPath[levels];      // pathIndices[i] * pathElements[i]
    currentHash[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // Enforce pathIndices[i] is binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Each <== may only contain one product (quadratic constraint)
        idxTimesCurrent[i] <== pathIndices[i] * currentHash[i];
        idxTimesPath[i]    <== pathIndices[i] * pathElements[i];

        // left  = (1-idx)*current + idx*sibling = current - idx*current + idx*sibling
        // right = (1-idx)*sibling + idx*current = sibling - idx*sibling + idx*current
        left[i]  <== currentHash[i]   - idxTimesCurrent[i] + idxTimesPath[i];
        right[i] <== pathElements[i]  - idxTimesPath[i]    + idxTimesCurrent[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];

        currentHash[i + 1] <== hashers[i].out;
    }

    root <== currentHash[levels];
}

// ─── Main Circuit ─────────────────────────────────────────────────────────────

template AnonymousVote(levels, balanceBits) {
    // ── Private inputs ────────────────────────────────────────────────────────
    signal input secret;
    signal input voterAddress;
    signal input balance;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // ── Public inputs ─────────────────────────────────────────────────────────
    signal input merkleRoot;
    signal input nullifierHash;
    signal input proposalId;
    signal input voteValue;
    signal input whaleThresholdBps;
    signal input totalSupply;

    // ── Output ────────────────────────────────────────────────────────────────
    signal output isWhale;

    // 1. Nullifier integrity: nullifierHash === Poseidon(secret, voterAddress, proposalId)
    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== voterAddress;
    nullifierHasher.inputs[2] <== proposalId;
    nullifierHash === nullifierHasher.out;

    // 2. Merkle leaf: leaf = Poseidon(voterAddress, balance)
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== voterAddress;
    leafHasher.inputs[1] <== balance;

    // 3. Merkle inclusion proof
    component merkle = MerkleInclusionProof(levels);
    merkle.leaf <== leafHasher.out;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i]  <== pathIndices[i];
    }
    merkleRoot === merkle.root;

    // 4. Vote is binary: voteValue * (1 - voteValue) === 0
    voteValue * (1 - voteValue) === 0;

    // 5. Balance range constraint (also proves balance is non-negative)
    component balanceBits_ = Num2Bits(balanceBits);
    balanceBits_.in <== balance;

    // 6. Balance > 0
    component balanceGtZero = GreaterThan(balanceBits);
    balanceGtZero.in[0] <== balance;
    balanceGtZero.in[1] <== 0;
    balanceGtZero.out === 1;

    // 7. Whale check: balance * 10000 >= whaleThresholdBps * totalSupply
    //    Use 120-bit comparator to safely handle large products
    component whaleCheck = GreaterEqThan(120);
    whaleCheck.in[0] <== balance * 10000;
    whaleCheck.in[1] <== whaleThresholdBps * totalSupply;
    isWhale <== whaleCheck.out;
}

component main {public [merkleRoot, nullifierHash, proposalId, voteValue, whaleThresholdBps, totalSupply]} = AnonymousVote(20, 96);
