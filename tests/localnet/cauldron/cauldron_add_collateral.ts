import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";

describe("Add collateral", () => {
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

    let BobTokenAccount: PublicKey = null;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    let cauldronAuthority: PublicKey = null;
    let cauldronBentoboxBalance: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob, cauldronOwner]);

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

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for MIM
        await bentobox.createVault(collateralMint.publicKey, cauldronOwner);
        // create MIM Balance account for Stan on Bentobox
        await bentobox.createBalance(Bob.publicKey, collateralMint.publicKey, Bob)
        // create strategy data account for MIM token
        await bentobox.createStrategyData(collateralMint.publicKey)

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Stan on cauldron
        await cauldron.createUserBalance(Bob.publicKey, Bob)

        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)
        cauldronAuthority = cauldron.getCauldronAuthority()
        cauldronBentoboxBalance = bentobox.getBalancePda(cauldronAuthority, collateralMint.publicKey)
    });

    it("Add collateral, skim = true", async () => {
        // try add collateral and skim when cauldron balance = 0
        try {
            await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), true)
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    cauldronBentoboxBalance,
                    authority: Bob.publicKey,
                    cauldronAuthority
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "SkimTooMuch");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(collateralMint.publicKey, BobTokenAccount, cauldronAuthority, new BN(1000), new BN(0), Bob)

        // add 500 collateral    
        await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), true)
            .accounts({
                userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                cauldronBentoboxBalance,
                authority: Bob.publicKey,
                cauldronAuthority
            })
            .signers([Bob])
            .rpc();

        const total = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        assert.ok(total.collateralShare.toString() == "500");

        const userBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(Bob.publicKey));
        assert.ok(userBalance.collateralShare.toString() == "500");
    });

    it("Add collateral, skim = false", async () => {
        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // try without remaining accounts
        try {
            await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    cauldronBentoboxBalance,
                    authority: Bob.publicKey,
                    cauldronAuthority
                })
                .signers([Bob])
                .rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "IncorrectRemainingAccounts");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try invalid bentobox account
        try {
            await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    cauldronBentoboxBalance,
                    authority: Bob.publicKey,
                    cauldronAuthority
                }).remainingAccounts([
                    { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                    { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                ])
                .signers([Bob])
                .rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidBentoboxAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try invalid bentobox program account
        try {
            await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    cauldronBentoboxBalance,
                    authority: Bob.publicKey,
                    cauldronAuthority
                }).remainingAccounts([
                    { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                    { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                ])
                .signers([Bob])
                .rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidBentoboxProgramAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try invalid cauldron authority account
        try {
            await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    cauldronBentoboxBalance,
                    authority: Bob.publicKey,
                    cauldronAuthority: bentobox.getBentoboxAccount()
                }).remainingAccounts([
                    { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                    { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBentoboxAccount(), isWritable: true, isSigner: false },
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                ])
                .signers([Bob])
                .rpc()
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // try add collateral with empty user bentobox balance account
        try {
            await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    cauldronBentoboxBalance,
                    authority: Bob.publicKey,
                    cauldronAuthority
                }).remainingAccounts([
                    { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                    { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                    { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                    { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                ])
                .signers([Bob])
                .rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "TransferAmountToHigh");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // deposited to bentobox from Bob
        await bentobox.deposit(collateralMint.publicKey, BobTokenAccount, Bob.publicKey, new BN(1000), new BN(0), Bob)

        let bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "1000");

        let cauldron_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(cauldronBentoboxBalance);
        assert.ok(cauldron_balance_on_bentobox.amount.toString() == "1000"); // from previous test


        // try to add collateral    
        await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
            .accounts({
                userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                cauldronBentoboxBalance,
                authority: Bob.publicKey,
                cauldronAuthority
            }).remainingAccounts([
                { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
            ])
            .signers([Bob])
            .rpc()

        const total = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        assert.ok(total.collateralShare.toString() == "1000"); // 500 + 500
        const userBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(Bob.publicKey));
        assert.ok(userBalance.collateralShare.toString() == "1000"); // 500 + 500

        bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "500");
        cauldron_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(cauldronBentoboxBalance);
        assert.ok(cauldron_balance_on_bentobox.amount.toString() == "1500");
    });
});