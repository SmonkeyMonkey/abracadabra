import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Bento transfer", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");
    const bentobox_idl = require("../../../target/idl/bentobox.json");

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const cauldronOwner = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();
    const Alice = Keypair.generate();

    let BobTokenAccount: PublicKey = null;
    let AliceTokenAccount: PublicKey = null;

    let cauldron = new Cauldron();
    let cauldron_v2 = new Cauldron();
    let bentobox = new Bentobox();

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, cauldronOwner, Bob, Alice]);

        mimMint = await common.createMintAccount(
            connection,
            cauldronOwner,
            cauldronOwner.publicKey,
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
        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Bob on cauldron
        await cauldron.createUserBalance(Bob.publicKey, Bob)

        // initialize cauldron_v2 account
        await cauldron_v2.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // add cauldron_v2 to whitelisted 
        await bentobox.createMasterContractWhitelist(cauldron_v2.getCauldronAccount(), cauldron_v2.getCauldronProgram())
    });

    it("Bento transfer", async () => {
        // deposited to bentobox from Bob
        await bentobox.deposit(collateralMint.publicKey, BobTokenAccount, Bob.publicKey, new BN(2000), new BN(0), Bob)

        let bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "2000");

        let alice_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey));
        assert.ok(alice_balance_on_bentobox.amount.toString() == "0"); // from previous test

        // not allowed, invalid cauldron account
        try {
            await cauldronProgram.methods.bentoTransfer(Bob.publicKey, Alice.publicKey, new BN(500))
                .accounts({
                    fromBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    authority: Bob.publicKey,
                    bentoboxProgram: bentoboxProgram.programId,
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron_v2.getCauldronAccount()),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount())
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidCauldronAccount");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // not allowed cause Alice want to transfer funds from Bob, remaining accounts is correct, just prohibited behavior
        try {
            await cauldronProgram.methods.bentoTransfer(Bob.publicKey, Alice.publicKey, new BN(500))
                .accounts({
                    fromBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    authority: Alice.publicKey,
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount())
                })
                .signers([Alice])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidParameterFrom");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // use invalid fromBentoboxBalance account
        try {
            await cauldronProgram.methods.bentoTransfer(Bob.publicKey, Alice.publicKey, new BN(500))
                .accounts({
                    fromBentoboxBalance: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    authority: Bob.publicKey,
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount())
                })
                .signers([Bob])
                .rpc();
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        await cauldronProgram.methods.bentoTransfer(Bob.publicKey, Alice.publicKey, new BN(500))
            .accounts({
                fromBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                toBentoboxBalance: bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                mint: collateralMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                cauldronAccount: cauldron.getCauldronAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                authority: Bob.publicKey,
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount())
            })
            .signers([Bob])
            .rpc();

        bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "1500"); // 2000 - 500
        alice_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Alice.publicKey, collateralMint.publicKey));
        assert.ok(alice_balance_on_bentobox.amount.toString() == "500"); // 500
    });
});