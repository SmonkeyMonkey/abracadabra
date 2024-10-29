import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Transfer with approve and whitelist", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    const bentobox_idl = require("../../../target/idl/bentobox.json");

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();
    let cauldron_v2 = new Cauldron();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const cauldronOwner = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();
    const Alice = Keypair.generate();

    let BobTokenAccount: PublicKey = null;
    let AliceTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob, Alice, cauldronOwner]);

        mimMint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        collateralMint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        // create token account for Bob on collateral token
        BobTokenAccount = await common.createAndFundUserAccount(
            Bob.publicKey,
            bentoboxOwner,
            collateralMint,
            2000
        );


        // create token account for Alice on collateral token
        AliceTokenAccount = await common.createAndFundUserAccount(
            Alice.publicKey,
            bentoboxOwner,
            collateralMint,
            2000
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for collateral
        await bentobox.createVault(collateralMint.publicKey, cauldronOwner);
        // create collateral Balance account for Bob on Bentobox
        await bentobox.createBalance(Bob.publicKey, collateralMint.publicKey, Bob)
        // create collateral Balance account for Alice on Bentobox
        await bentobox.createBalance(Alice.publicKey, collateralMint.publicKey, Alice)
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint.publicKey)

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // initialize cauldron_v2 account        
        await cauldron_v2.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Bob on cauldron
        await cauldron.createUserBalance(Bob.publicKey, Bob)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // add cauldron_v2 to whitelisted 
        await bentobox.createMasterContractWhitelist(cauldron_v2.getCauldronAccount(), cauldron.getCauldronProgram())
    });

    it("transfer", async () => {
        // deposited to bentobox from Bob
        await bentobox.deposit(collateralMint.publicKey, BobTokenAccount, Bob.publicKey, new BN(2000), new BN(0), Bob)

        let bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "2000");

        let alice_bentobox_balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey));
        assert.ok(alice_bentobox_balance.amount.toString() == "0"); // from previous test

        //it is allowed cause Bob transfer to Alice and Bob sign transaction 
        await bentoboxProgram.methods.transfer(Bob.publicKey, Alice.publicKey, new BN(200))
            .accounts({
                balanceFrom: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                balanceTo: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                mint: collateralMint.publicKey,
                authority: Bob.publicKey
            })
            .signers([Bob])
            .rpc();

        // it is allowed cause Bob transfer to Alice and Bob sign transaction  (use remaining accounts which actually not needed, just you can)  
        await bentoboxProgram.methods.transfer(Bob.publicKey, Alice.publicKey, new BN(200))
            .accounts({
                balanceFrom: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                balanceTo: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                mint: collateralMint.publicKey,
                authority: Bob.publicKey
            }).remainingAccounts([
                { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: cauldron.getCauldronAccount(), isWritable: false, isSigner: false },
            ])
            .signers([Bob])
            .rpc();

        // not allowed cause Alice want to transfer funds from Bob, remaining accounts is correct, just prohibited behavior
        try {
            await bentoboxProgram.methods.transfer(Bob.publicKey, Alice.publicKey, new BN(500))
                .accounts({
                    balanceFrom: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    balanceTo: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: collateralMint.publicKey,
                    authority: Alice.publicKey
                }).remainingAccounts([
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: cauldron.getCauldronAccount(), isWritable: false, isSigner: false },
                ])
                .signers([Alice])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "CauldronSignMismatch");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // not allowed, expected cauldron_v2 can sign
        try {
            await bentoboxProgram.methods.transfer(Bob.publicKey, Alice.publicKey, new BN(500))
                .accounts({
                    balanceFrom: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    balanceTo: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: collateralMint.publicKey,
                    authority: Alice.publicKey
                }).remainingAccounts([
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron_v2.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: cauldron_v2.getCauldronAccount(), isWritable: false, isSigner: false },
                ])
                .signers([Alice])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "CauldronSignMismatch");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        //not allowed, invalid cauldron account
        try {
            await bentoboxProgram.methods.transfer(Bob.publicKey, Alice.publicKey, new BN(500))
                .accounts({
                    balanceFrom: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    balanceTo: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: collateralMint.publicKey,
                    authority: Alice.publicKey
                }).remainingAccounts([
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: cauldron_v2.getCauldronAccount(), isWritable: false, isSigner: false },
                ])
                .signers([Alice])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidCauldronAccount");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "1600"); // 2000 - 200 - 200 
        alice_bentobox_balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey));
        assert.ok(alice_bentobox_balance.amount.toString() == "400"); // 200 + 200
    });
});