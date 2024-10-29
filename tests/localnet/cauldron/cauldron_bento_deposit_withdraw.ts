import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Bento deposit / bento withdraw through cauldron", () => {
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

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();
    let cauldron_v2 = new Cauldron();
    let bentobox_v2 = new Bentobox();

    const cauldronOwner = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    let BobTokenAccount: PublicKey = null;
    let BentoboxOwnerTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, cauldronOwner, Bob]);

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

        //create token account for Bob with some collateral tokens
        BobTokenAccount = await common.createAndFundUserAccount(
            Bob.publicKey,
            bentoboxOwner,
            collateralMint,
            2000
        );

        //create token account for bentoboxOwner with some collateral tokens
        BentoboxOwnerTokenAccount = await common.createAndFundUserAccount(
            bentoboxOwner.publicKey,
            bentoboxOwner,
            collateralMint,
            2000
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create bentobox_v2
        await bentobox_v2.create(bentoboxOwner);
        // create total vault for collateral
        await bentobox.createVault(collateralMint.publicKey, cauldronOwner);
        // create collateral Balance account for Bob on Bentobox
        await bentobox.createBalance(Bob.publicKey, collateralMint.publicKey, Bob)
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint.publicKey)

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // initialize cauldron_v2 account        
        await cauldron_v2.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        //register cauldron_v2 to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron_v2.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron_v2.getCauldronAccount(), cauldron_v2.getCauldronProgram())
    });

    it("Bento deposit", async () => {
        // try to bento deposit with incorrect bentobox account
        try {
            await cauldronProgram.methods.bentoDeposit(Bob.publicKey, new BN(1000), new BN(0))
                .accounts({
                    fromVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxToBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox_v2.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidBentoboxAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }
        // try to bento deposit with incorrect bentobox program
        try {
            await cauldronProgram.methods.bentoDeposit(Bob.publicKey, new BN(1000), new BN(0))
                .accounts({
                    fromVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxToBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: cauldronProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidProgramId");
            assert.strictEqual(err.error.errorMessage, "Program ID was not as expected");
            assert.strictEqual(err.error.errorCode.number, 3008);
        }

        try {
            // deposited to bentobox from Bob using wrong master contract approved account
            await cauldronProgram.methods.bentoDeposit(Bob.publicKey, new BN(2000), new BN(0))
                .accounts({
                    fromVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxToBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron_v2.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron_v2.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "IncompatibleMasterContractWhitelistedAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            // deposited to bentobox from Bob using wrong master contract approved account
            await cauldronProgram.methods.bentoDeposit(Bob.publicKey, new BN(2000), new BN(0))
                .accounts({
                    fromVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxToBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron_v2.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "MasterContractNotApproved");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            // deposited to bentobox from Bob using wrong cauldron_v2.getCauldronAuthority()
            await cauldronProgram.methods.bentoDeposit(Bob.publicKey, new BN(2000), new BN(0))
                .accounts({
                    fromVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxToBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                    mint: collateralMint.publicKey,
                    cauldronAuthority: cauldron_v2.getCauldronAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // 1) approve using web3
        // Example: await collateralMint.approve(BobTokenAccount, cauldron.getCauldronAuthority(), Bob.publicKey, [Bob], 1000000); // better as max as possible
        // 2) approve using approve_cauldron instruction
        await cauldron.approveToCauldron(BobTokenAccount, Bob)

        // deposited to bentobox from Bob
        await cauldronProgram.methods.bentoDeposit(Bob.publicKey, new BN(2000), new BN(0))
            .accounts({
                fromVault: BobTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                mint: collateralMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: Bob.publicKey,
            })
            .signers([Bob])
            .rpc();


        let total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(collateralMint.publicKey));
        assert.ok(total.amount["base"].toString() == "2000");
        assert.ok(total.amount["elastic"].toString() == "2000");
        let balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(balance.amount.toString() == "2000");
    });

    it("Bento withdraw", async () => {

        // try withdraw from bento with incorrect bentobox account
        try {
            await cauldronProgram.methods.bentoWithdraw(new BN(1000), new BN(0))
                .accounts({
                    toVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxFromBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox_v2.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidBentoboxAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try withdraw from bento with incorrect bentobox program
        try {
            await cauldronProgram.methods.bentoWithdraw(new BN(1000), new BN(0))
                .accounts({
                    toVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxFromBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: cauldronProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidProgramId");
            assert.strictEqual(err.error.errorMessage, "Program ID was not as expected");
            assert.strictEqual(err.error.errorCode.number, 3008);
        }

        try {
            // withdraw from bentobox to Bob using wrong master contract approved account
            await cauldronProgram.methods.bentoWithdraw(new BN(500), new BN(0))
                .accounts({
                    toVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxFromBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron_v2.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron_v2.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "IncompatibleMasterContractWhitelistedAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            //  withdraw from bentobox to Bob using wrong master contract approved account
            await cauldronProgram.methods.bentoWithdraw(new BN(500), new BN(0))
                .accounts({
                    toVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxFromBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron_v2.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "MasterContractNotApproved");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            // withdraw from bentobox to Bob using wrong cauldron_authority
            await cauldronProgram.methods.bentoWithdraw(new BN(500), new BN(0))
                .accounts({
                    toVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                    bentoboxFromBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron_v2.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // withdraw from bentobox from Bob
        await cauldronProgram.methods.bentoWithdraw(new BN(500), new BN(0))
            .accounts({
                toVault: BobTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxFromBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: Bob.publicKey,
            })
            .signers([Bob])
            .rpc();

        let total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(collateralMint.publicKey));
        assert.ok(total.amount["base"].toString() == "1500");
        assert.ok(total.amount["elastic"].toString() == "1500");
        let balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(balance.amount.toString() == "1500");
    });
});