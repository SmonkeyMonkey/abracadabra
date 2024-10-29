import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Repay test flow", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const borrowerStan = Keypair.generate();

    let bentoboxOwnerTokenAccount: PublicKey = null;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    let stanTokenAccount: PublicKey = null;
    let cauldronAuthorityPda: PublicKey = null;
    let cauldronMimBentoboxBalance: PublicKey = null;
    let cauldronCollateralBentoboxBalance: PublicKey = null;

    let stanMimTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, borrowerStan, cauldronOwner]);

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

        // create token account for bentoboxOwner with some MiM tokens
        bentoboxOwnerTokenAccount = await common.createAndFundUserAccount(
            bentoboxOwner.publicKey,
            bentoboxOwner,
            mimMint,
            2000
        );

        stanTokenAccount = await common.createAndFundUserAccount(
            borrowerStan.publicKey,
            bentoboxOwner,
            collateralMint,
            200000
        );

        stanMimTokenAccount = await common.createAndFundUserAccount(
            borrowerStan.publicKey,
            bentoboxOwner,
            mimMint,
            10
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for MIM
        await bentobox.createVault(mimMint.publicKey, cauldronOwner);
        // create total vault for collateral
        await bentobox.createVault(collateralMint.publicKey, bentoboxOwner);
        // create MIM Balance account for Stan on Bentobox
        await bentobox.createBalance(borrowerStan.publicKey, mimMint.publicKey, borrowerStan)
        // create collateral Balance account for Stan on Bentobox
        await bentobox.createBalance(borrowerStan.publicKey, collateralMint.publicKey, borrowerStan)
        // create strategy data account for MIM token
        await bentobox.createStrategyData(mimMint.publicKey)
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint.publicKey);

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, new BN(1000000))

        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Stan on cauldron
        await cauldron.createUserBalance(borrowerStan.publicKey, borrowerStan)


        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint.publicKey, cauldronOwner)
        cauldronAuthorityPda = cauldron.getCauldronAuthority()
        cauldronMimBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, mimMint.publicKey)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)
        cauldronCollateralBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, collateralMint.publicKey)

        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(mimMint.publicKey, bentoboxOwnerTokenAccount, cauldronAuthorityPda, new BN(2000), new BN(0), bentoboxOwner)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Stan 
        await bentobox.createMasterContractApproval(borrowerStan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // create
        await cauldron.createCauldronApprovalAccount(bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), bentoboxProgram.programId, borrowerStan)

    });

    it("Bento deposit, add collateral, borrow and bento withdraw", async () => {

        // 1) approve using web3
        // await collateralMint.approve(BobTokenAccount, cauldron_authority, Bob.publicKey, [Bob], 1000000);
        // 2) approve using approve_cauldron instruction
        await cauldron.approveToCauldron(stanTokenAccount, borrowerStan);


        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(borrowerStan.publicKey, new BN(200000), new BN(0))
            .accounts({
                fromVault: stanTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                mint: collateralMint.publicKey,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerStan.publicKey,
            })
            .signers([borrowerStan])
            .rpc();

        let bentoboxTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(collateralMint.publicKey));
        assert.ok(bentoboxTotal.amount["base"].toString() == "200000");
        assert.ok(bentoboxTotal.amount["elastic"].toString() == "200000");
        let bentoboxBalance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        assert.ok(bentoboxBalance.amount.toString() == "200000");

        try {
            await cauldron.borrow(borrowerStan.publicKey, new BN(30),
                borrowerStan, cauldronMimBentoboxBalance,
                bentobox.getTotalDataPda(mimMint.publicKey),
                bentobox.getBalancePda(borrowerStan.publicKey,
                    mimMint.publicKey), bentoboxProgram.programId);
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UserInsolventError");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }


        await cauldronProgram.methods.addCollateral(borrowerStan.publicKey, new BN(100000), false)
            .accounts({
                userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.totalDataPda,
                cauldronBentoboxBalance: cauldronCollateralBentoboxBalance,
                authority: borrowerStan.publicKey,
                cauldronAuthority: cauldronAuthorityPda
            }).remainingAccounts([
                { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
            ])
            .signers([borrowerStan])
            .rpc();

        let cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.totalDataPda);
        assert.ok(cauldronTotal.collateralShare.toString() == "100000");
        let stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        assert.ok(stanCauldronUserBalance.collateralShare.toString() == "100000");

        let stanCollaretalBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        assert.ok(stanCollaretalBalanceOnBentobox.amount.toString() == "100000");
        let cauldronBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(cauldronCollateralBentoboxBalance);
        assert.ok(cauldronBalanceOnBentobox.amount.toString() == "100000");


        await cauldron.borrow(borrowerStan.publicKey, new BN(100),
            borrowerStan, cauldronMimBentoboxBalance,
            bentobox.getTotalDataPda(mimMint.publicKey),
            bentobox.getBalancePda(borrowerStan.publicKey,
                mimMint.publicKey), bentoboxProgram.programId);

        let bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        let stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        let cauldronBalance = await bentoboxProgram.account.balance.fetch(cauldronMimBentoboxBalance);
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());

        assert.ok(bentoboxMimTotal.amount["base"].toString() == "2000");
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "100");
        assert.ok(cauldronBalance.amount.toString() == "1900");
        assert.ok(cauldronTotal.borrow.base.toString() == "101");
        assert.ok(cauldronTotal.borrow.elastic.toString() == "101");

        // trying to borrow more mims that we are allowed
        try {
            await cauldron.borrow(borrowerStan.publicKey, new BN(1000),
                borrowerStan, cauldronMimBentoboxBalance,
                bentobox.getTotalDataPda(mimMint.publicKey),
                bentobox.getBalancePda(borrowerStan.publicKey,
                    mimMint.publicKey), bentoboxProgram.programId);
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UserInsolventError");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // withdraw Mims from bentobox to Stan
        await cauldronProgram.methods.bentoWithdraw(new BN(20), new BN(0))
            .accounts({
                toVault: stanMimTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                bentoboxFromBalance: bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldronAuthorityPda,
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerStan.publicKey,
            })
            .signers([borrowerStan])
            .rpc();


        let stanMimAccount = await mimMint.getAccountInfo(stanMimTokenAccount);
        assert.ok(stanMimAccount.amount.toString() == (30).toString());

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        assert.ok(bentoboxMimTotal.amount["base"].toString() == "1980");
        assert.ok(bentoboxMimTotal.amount["elastic"].toString() == "1980");
        stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "80");

        // Repay part

        await cauldron.approveToCauldron(stanMimTokenAccount, borrowerStan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(borrowerStan.publicKey, new BN(10), new BN(0))
            .accounts({
                fromVault: stanMimTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(mimMint.publicKey),
                mint: mimMint.publicKey,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerStan.publicKey,
            })
            .signers([borrowerStan])
            .rpc();


        stanMimAccount = await mimMint.getAccountInfo(stanMimTokenAccount);
        assert.ok(stanMimAccount.amount.toString() == (20).toString());

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        assert.ok(bentoboxMimTotal.amount["base"].toString() == "1990");
        assert.ok(bentoboxMimTotal.amount["elastic"].toString() == "1990");
        stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "90");

        await cauldronProgram.methods.repay(borrowerStan.publicKey, false, new BN(10))
            .accounts({
                totalData: cauldron.getTotalDataPda(),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                fromBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey),
                magicInternetMoneyMint: mimMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                authority: borrowerStan.publicKey,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
            })
            .remainingAccounts([{ pubkey: bentobox.getBentoboxAuthority(), isWritable: false, isSigner: false }])
            .signers([borrowerStan]).rpc();

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        cauldronBalance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey));
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());

        assert.ok(bentoboxMimTotal.amount["base"].toString() == "1990");
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "80");
        assert.ok(cauldronBalance.amount.toString() == "1910");
        assert.ok(cauldronTotal.borrow.base.toString() == "91");
        assert.ok(cauldronTotal.borrow.elastic.toString() == "91");


        let cauldronAcc = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        let accrueInfo = cauldronAcc.accrueInfo;

        assert.notOk(accrueInfo.lastAccrued.eqn(0));
        assert.ok(accrueInfo.feesEarned.eqn(1));
        assert.ok(accrueInfo.interestPerSecond.eqn(10000));


        try {
            await cauldronProgram.methods.removeCollateral(borrowerStan.publicKey, new BN(10000))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: collateralMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    switchboardDataFeed: TEST_PRICE,
                    authority: borrowerStan.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
                })
                .signers([borrowerStan])
                .rpc();
        } catch (_err) {
            console.log(_err);
        }

        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.totalDataPda);
        assert.ok(cauldronTotal.collateralShare.toString() == "90000");
        stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        assert.ok(stanCauldronUserBalance.collateralShare.toString() == "90000");

        stanCollaretalBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        assert.ok(stanCollaretalBalanceOnBentobox.amount.toString() == "110000");
        cauldronBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(cauldronCollateralBentoboxBalance);
        assert.ok(cauldronBalanceOnBentobox.amount.toString() == "90000");

        // removing more collaterals that we are not allowed to
        try {
            await cauldronProgram.methods.removeCollateral(borrowerStan.publicKey, new BN(80000))
                .accounts({
                    userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    collateral: collateralMint.publicKey,
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                    toBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    switchboardDataFeed: TEST_PRICE,
                    authority: borrowerStan.publicKey,
                    masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                    masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
                })
                .signers([borrowerStan])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UserInsolventError");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // repaying more MIMs to be able to remove more collateral
        await cauldronProgram.methods.repay(borrowerStan.publicKey, false, new BN(40))
            .accounts({
                totalData: cauldron.getTotalDataPda(),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                fromBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey),
                magicInternetMoneyMint: mimMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                authority: borrowerStan.publicKey,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
            })
            .remainingAccounts([{ pubkey: bentobox.getBentoboxAuthority(), isWritable: false, isSigner: false }])
            .signers([borrowerStan]).rpc();

        // remove more collateral after we repayed more MIMs
        await cauldronProgram.methods.removeCollateral(borrowerStan.publicKey, new BN(80000))
            .accounts({
                userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                collateral: collateralMint.publicKey,
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                toBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                cauldronAuthority: cauldron.getCauldronAuthority(),
                switchboardDataFeed: TEST_PRICE,
                authority: borrowerStan.publicKey,
                masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
            })
            .signers([borrowerStan])
            .rpc();

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(borrowerStan.publicKey, new BN(11), new BN(0))
            .accounts({
                fromVault: stanMimTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(mimMint.publicKey),
                mint: mimMint.publicKey,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerStan.publicKey,
            })
            .signers([borrowerStan])
            .rpc();

        stanMimAccount = await mimMint.getAccountInfo(stanMimTokenAccount);
        assert.ok(stanMimAccount.amount.toString() == (9).toString());

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        assert.ok(bentoboxMimTotal.amount["base"].toString() == "2001");
        assert.ok(bentoboxMimTotal.amount["elastic"].toString() == "2001");
        stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "51");


        // repaying all MIMs to be able to remove all collateral
        await cauldronProgram.methods.repay(borrowerStan.publicKey, false, new BN(51))
            .accounts({
                totalData: cauldron.getTotalDataPda(),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                fromBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey),
                magicInternetMoneyMint: mimMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                authority: borrowerStan.publicKey,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
            })
            .remainingAccounts([{ pubkey: bentobox.getBentoboxAuthority(), isWritable: false, isSigner: false }])
            .signers([borrowerStan]).rpc();

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        cauldronBalance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey));
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        let userStanCauldronBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));


        assert.ok(bentoboxMimTotal.amount["base"].toString() == "2001");
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "0");
        assert.ok(cauldronBalance.amount.toString() == "2001");
        assert.ok(cauldronTotal.borrow.base.toString() == "0");
        assert.ok(cauldronTotal.borrow.elastic.toString() == "0");
        assert.ok(userStanCauldronBalance.borrowPart.toString() == "0");


        // remove rest of  collateral after we repayed all MIMs
        await cauldronProgram.methods.removeCollateral(borrowerStan.publicKey, new BN(10000))
            .accounts({
                userBalance: cauldron.getUserBalancePda(borrowerStan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                collateral: collateralMint.publicKey,
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                toBentoboxBalance: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                cauldronAuthority: cauldron.getCauldronAuthority(),
                switchboardDataFeed: TEST_PRICE,
                authority: borrowerStan.publicKey,
                masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
            })
            .signers([borrowerStan])
            .rpc();

        // withdraw collateral from bentobox to Stan
        await cauldronProgram.methods.bentoWithdraw(new BN(100000), new BN(0))
            .accounts({
                toVault: stanTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxFromBalance: bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldronAuthorityPda,
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerStan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerStan.publicKey,
            })
            .signers([borrowerStan])
            .rpc();

        let stanTokAccount = await collateralMint.getAccountInfo(stanTokenAccount);
        assert.ok(stanTokAccount.amount.toString() == (100000).toString());

        // let bentoboxCollateralTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(collateralMint.publicKey));
        // assert.ok(bentoboxCollateralTotal.amount["base"].toString() == "190000");
        // assert.ok(bentoboxCollateralTotal.amount["elastic"].toString() == "190000");
        // stanCollaretalBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        // assert.ok(stanCollaretalBalanceOnBentobox.amount.toString() == "100000");

    });

});