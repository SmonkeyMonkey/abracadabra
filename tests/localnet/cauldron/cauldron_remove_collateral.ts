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

describe("Remove collateral", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();
    let bentobox_v2 = new Bentobox();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const cauldronOwner = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    let BobTokenAccount: PublicKey = null;

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
        // create bentobox_v2
        await bentobox_v2.create(bentoboxOwner);
        // create collateral Balance account for Bob on Bentobox
        await bentobox.createBalance(Bob.publicKey, collateralMint.publicKey, Bob)
        // create total vault for collateral
        await bentobox.createVault(collateralMint.publicKey, bentoboxOwner);
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint.publicKey)

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Bob on cauldron
        await cauldron.createUserBalance(Bob.publicKey, Bob)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)
        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint.publicKey, cauldronOwner)



        // register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // create
        await cauldron.createCauldronApprovalAccount(bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), bentoboxProgram.programId, Bob)
    });

    it("Remove collateral", async () => {
        // try remove collateral
        try {
            await cauldronProgram.methods.removeCollateral(Bob.publicKey, new BN(500))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: collateralMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    switchboardDataFeed: TEST_PRICE,
                    authority: Bob.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorMessage, "Overflow occurred when making integer subtraction.");
            assert.strictEqual(err.error.errorCode.number, 6007);
        }

        // try to remove collateral with incorrect collateral account
        try {
            await cauldronProgram.methods.removeCollateral(Bob.publicKey, new BN(500))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: mimMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    switchboardDataFeed: TEST_PRICE,
                    authority: Bob.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidCollateral");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try to remove collateral with incorrect bentobox account
        try {
            await cauldronProgram.methods.removeCollateral(Bob.publicKey, new BN(500))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: collateralMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox_v2.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    switchboardDataFeed: TEST_PRICE,
                    authority: Bob.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
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

        // try to remove collateral with incorrect bentobox program
        try {
            await cauldronProgram.methods.removeCollateral(Bob.publicKey, new BN(500))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: collateralMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: cauldronProgram.programId,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    switchboardDataFeed: TEST_PRICE,
                    authority: Bob.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
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

        // deposited to bentobox from Bob
        await bentobox.deposit(collateralMint.publicKey, BobTokenAccount, Bob.publicKey, new BN(1000), new BN(0), Bob)

        // try to add collateral    
        await cauldronProgram.methods.addCollateral(Bob.publicKey, new BN(500), false)
            .accounts({
                userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                authority: Bob.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority()
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

        let total = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        assert.ok(total.collateralShare.toString() == "500");
        let userBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(Bob.publicKey));
        assert.ok(userBalance.collateralShare.toString() == "500");

        let bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "500"); // 1000 - 500
        let cauldron_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey));
        assert.ok(cauldron_balance_on_bentobox.amount.toString() == "500");

        let cauldronAcc = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        let accrueInfo = cauldronAcc.accrueInfo;

        assert.ok(accrueInfo.lastAccrued.eqn(0));
        assert.ok(accrueInfo.feesEarned.eqn(0));
        assert.ok(accrueInfo.interestPerSecond.eqn(10000));

        // try remove collateral with wrong cauldron`s bentobox balance account
        try {
            await cauldronProgram.methods.removeCollateral(Bob.publicKey, new BN(500))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: collateralMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    switchboardDataFeed: TEST_PRICE,
                    authority: Bob.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
                })
                .signers([Bob])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // try remove collateral    
        await cauldronProgram.methods.removeCollateral(Bob.publicKey, new BN(500))
            .accounts({
                userBalance: cauldron.getUserBalancePda(Bob.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                collateral: collateralMint.publicKey,
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                toBentoboxBalance: bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                cauldronAuthority: cauldron.getCauldronAuthority(),
                switchboardDataFeed: TEST_PRICE,
                authority: Bob.publicKey,
                masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
            })
            .signers([Bob])
            .rpc();

        total = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        assert.ok(total.collateralShare.toString() == "0");
        userBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(Bob.publicKey));
        assert.ok(userBalance.collateralShare.toString() == "0");

        bob_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, collateralMint.publicKey));
        assert.ok(bob_balance_on_bentobox.amount.toString() == "1000");
        cauldron_balance_on_bentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey));
        assert.ok(cauldron_balance_on_bentobox.amount.toString() == "0");

        cauldronAcc = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        accrueInfo = cauldronAcc.accrueInfo;

        assert.notOk(accrueInfo.lastAccrued.eqn(0));
        assert.ok(accrueInfo.feesEarned.eqn(0));
        assert.ok(accrueInfo.interestPerSecond.eqn(10000));
    });
});