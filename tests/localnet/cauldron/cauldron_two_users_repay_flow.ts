import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import * as borsh from "borsh";

import { TEST_PRICE } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Two users repay test flow", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    const collateralDecimal = Math.pow(10, 9);
    const mimDecimal = Math.pow(10, 6);

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const borrowerStan = Keypair.generate();
    const borrowerDan = Keypair.generate();

    let bentoboxOwnerTokenAccount: PublicKey = null;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    let stanTokenAccount: PublicKey = null;
    let danTokenAccount: PublicKey = null;
    let cauldronAuthorityPda: PublicKey = null;
    let cauldronMimBentoboxBalance: PublicKey = null;
    let cauldronCollateralBentoboxBalance: PublicKey = null;

    let stanMimTokenAccount: PublicKey = null;
    let danMimTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, borrowerStan, borrowerDan, cauldronOwner]);

        mimMint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            6
        );

        collateralMint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            9
        );

        // create token account for bentoboxOwner with some MiM tokens
        bentoboxOwnerTokenAccount = await common.createAndFundUserAccount(
            bentoboxOwner.publicKey,
            bentoboxOwner,
            mimMint,
            2000 * mimDecimal
        );

        stanTokenAccount = await common.createAndFundUserAccount(
            borrowerStan.publicKey,
            bentoboxOwner,
            collateralMint,
            3000000 * collateralDecimal
        );

        danTokenAccount = await common.createAndFundUserAccount(
            borrowerDan.publicKey,
            bentoboxOwner,
            collateralMint,
            2000000 * collateralDecimal
        );

        stanMimTokenAccount = await common.createAndFundUserAccount(
            borrowerStan.publicKey,
            bentoboxOwner,
            mimMint,
            10 * mimDecimal
        );

        danMimTokenAccount = await common.createAndFundUserAccount(
            borrowerDan.publicKey,
            bentoboxOwner,
            mimMint,
            10 * mimDecimal
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
        // create MIM Balance account for Dan on Bentobox
        await bentobox.createBalance(borrowerDan.publicKey, mimMint.publicKey, borrowerDan)
        // create collateral Balance account for Dan on Bentobox
        await bentobox.createBalance(borrowerDan.publicKey, collateralMint.publicKey, borrowerDan)
        // create strategy data account for MIM token
        await bentobox.createStrategyData(mimMint.publicKey)
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint.publicKey);

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), new BN(1000000000), new BN(1000000))
        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Stan on cauldron
        await cauldron.createUserBalance(borrowerStan.publicKey, borrowerStan)
        // create user balance for Dan on cauldron
        await cauldron.createUserBalance(borrowerDan.publicKey, borrowerDan)


        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint.publicKey, cauldronOwner)
        cauldronAuthorityPda = cauldron.getCauldronAuthority()
        cauldronMimBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, mimMint.publicKey)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)
        cauldronCollateralBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, collateralMint.publicKey)

        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(mimMint.publicKey, bentoboxOwnerTokenAccount, cauldronAuthorityPda, new BN(2000 * mimDecimal), new BN(0), bentoboxOwner)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Stan 
        await bentobox.createMasterContractApproval(borrowerStan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Dan 
        await bentobox.createMasterContractApproval(borrowerDan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // create
        await cauldron.createCauldronApprovalAccount(bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), bentoboxProgram.programId, borrowerStan)
        // create


    });

    it("Bento deposit, add collateral, borrow and bento withdraw", async () => {

        // 1) approve using web3
        // await collateralMint.approve(BobTokenAccount, cauldron_authority, Bob.publicKey, [Bob], 1000000); // TODO: better as max as possible
        // 2) approve using approve_cauldron instruction
        await cauldron.approveToCauldron(stanTokenAccount, borrowerStan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(borrowerStan.publicKey, new BN(3000000 * collateralDecimal), new BN(0))
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

        // 2) approve using approve_cauldron instruction
        await cauldron.approveToCauldron(danTokenAccount, borrowerDan);

        // deposited to bentobox from Dan
        await cauldronProgram.methods.bentoDeposit(borrowerDan.publicKey, new BN(2000000 * collateralDecimal), new BN(0))
            .accounts({
                fromVault: danTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                mint: collateralMint.publicKey,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerDan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerDan.publicKey,
            })
            .signers([borrowerDan])
            .rpc();

        let bentoboxTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(collateralMint.publicKey));
        let stanCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        let danCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey));


        let stanCollateralAccount = await collateralMint.getAccountInfo(stanTokenAccount);
        let danCollateralAccount = await collateralMint.getAccountInfo(danTokenAccount);

        assert.ok(new BN(bentoboxTotal.amount["base"]).eq(new BN(5000000 * collateralDecimal)));
        assert.ok(stanCollaretalBentobox.amount.toString() == (3000000 * collateralDecimal).toString());
        assert.ok(danCollaretalBentobox.amount.toString() == (2000000 * collateralDecimal).toString());
        assert.ok(stanCollateralAccount.amount.toString() == (0 * collateralDecimal).toString());
        assert.ok(danCollateralAccount.amount.toString() == (0 * collateralDecimal).toString());

        // Borrower Stan adding collaterals  
        await cauldronProgram.methods.addCollateral(borrowerStan.publicKey, new BN(1500000 * collateralDecimal), false)
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

        // Borrower Dan adding collaterals  
        await cauldronProgram.methods.addCollateral(borrowerDan.publicKey, new BN(1000000 * collateralDecimal), false)
            .accounts({
                userBalance: cauldron.getUserBalancePda(borrowerDan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.totalDataPda,
                cauldronBentoboxBalance: cauldronCollateralBentoboxBalance,
                authority: borrowerDan.publicKey,
                cauldronAuthority: cauldronAuthorityPda
            }).remainingAccounts([
                { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractApprovedPda(borrowerDan.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
            ])
            .signers([borrowerDan])
            .rpc();

        let cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        assert.ok(cauldronTotal.collateralShare.toString() == (2500000 * collateralDecimal).toString());

        let stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        assert.ok(stanCauldronUserBalance.collateralShare.toString() == (1500000 * collateralDecimal).toString());

        let danCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerDan.publicKey));
        assert.ok(danCauldronUserBalance.collateralShare.toString() == (1000000 * collateralDecimal).toString());

        stanCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        danCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey));

        assert.ok(stanCollaretalBentobox.amount.toString() == (1500000 * collateralDecimal).toString());
        assert.ok(danCollaretalBentobox.amount.toString() == (1000000 * collateralDecimal).toString());

        let cauldronCollateralBentobox = await bentoboxProgram.account.balance.fetch(cauldronCollateralBentoboxBalance);
        assert.ok(cauldronCollateralBentobox.amount.toString() == (2500000 * collateralDecimal).toString());

        // Borrower Stan borrowing MIMs  
        await cauldron.borrow(borrowerStan.publicKey, new BN(1000 * mimDecimal),
            borrowerStan, cauldronMimBentoboxBalance,
            bentobox.getTotalDataPda(mimMint.publicKey),
            bentobox.getBalancePda(borrowerStan.publicKey,
                mimMint.publicKey), bentoboxProgram.programId);

        // Borrower Dan borrowing MIMs  
        await cauldron.borrow(borrowerDan.publicKey, new BN(500 * mimDecimal),
            borrowerDan, cauldronMimBentoboxBalance,
            bentobox.getTotalDataPda(mimMint.publicKey),
            bentobox.getBalancePda(borrowerDan.publicKey,
                mimMint.publicKey), bentoboxProgram.programId);


        let bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        let stanMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        let danMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey));
        let cauldronMimBalance = await bentoboxProgram.account.balance.fetch(cauldronMimBentoboxBalance);
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        danCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerDan.publicKey));
        assert.ok(stanCauldronUserBalance.borrowPart.toString() == (1010 * mimDecimal).toString());
        assert.ok(danCauldronUserBalance.borrowPart.toString() == (505 * mimDecimal).toString());

        assert.ok(new BN(bentoboxMimTotal.amount["base"]).eq(new BN(2000 * mimDecimal)));
        assert.ok(stanMimBentobox.amount.toString() == (1000 * mimDecimal).toString());
        assert.ok(danMimBentobox.amount.toString() == (500 * mimDecimal).toString());
        assert.ok(cauldronMimBalance.amount.toString() == (500 * mimDecimal).toString());

        assert.ok(cauldronTotal.borrow.base.eq(new BN(1515 * mimDecimal)));
        assert.ok(cauldronTotal.borrow.elastic.eq(new BN(1515 * mimDecimal)));

        // withdraw Mims from bentobox to Stan
        await cauldronProgram.methods.bentoWithdraw(new BN(1000 * mimDecimal), new BN(0))
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

        // withdraw Mims from bentobox to Dan
        await cauldronProgram.methods.bentoWithdraw(new BN(500 * mimDecimal), new BN(0))
            .accounts({
                toVault: danMimTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                bentoboxFromBalance: bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldronAuthorityPda,
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerDan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerDan.publicKey,
            })
            .signers([borrowerDan])
            .rpc();

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        stanMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        danMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey));
        cauldronMimBalance = await bentoboxProgram.account.balance.fetch(cauldronMimBentoboxBalance);
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());

        let stanMimAccount = await mimMint.getAccountInfo(stanMimTokenAccount);
        let danMimAccount = await mimMint.getAccountInfo(danMimTokenAccount);

        assert.ok(new BN(bentoboxMimTotal.amount["base"]).eq(new BN(500 * mimDecimal)));
        assert.ok(stanMimBentobox.amount.toString() == (0 * mimDecimal).toString());
        assert.ok(danMimBentobox.amount.toString() == (0 * mimDecimal).toString());
        assert.ok(cauldronMimBalance.amount.toString() == (500 * mimDecimal).toString());
        assert.ok(stanMimAccount.amount.toString() == (1010 * mimDecimal).toString());
        assert.ok(danMimAccount.amount.toString() == (510 * mimDecimal).toString());


        // Repay part

        await cauldron.approveToCauldron(stanMimTokenAccount, borrowerStan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(borrowerStan.publicKey, new BN(1010 * mimDecimal), new BN(0))
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

        await cauldron.approveToCauldron(danMimTokenAccount, borrowerDan);

        // deposited to bentobox from Dan
        await cauldronProgram.methods.bentoDeposit(borrowerDan.publicKey, new BN(505 * mimDecimal), new BN(0))
            .accounts({
                fromVault: danMimTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(mimMint.publicKey),
                mint: mimMint.publicKey,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerDan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerDan.publicKey,
            })
            .signers([borrowerDan])
            .rpc();

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        stanMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        danMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey));
        cauldronMimBalance = await bentoboxProgram.account.balance.fetch(cauldronMimBentoboxBalance);
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());

        stanMimAccount = await mimMint.getAccountInfo(stanMimTokenAccount);
        danMimAccount = await mimMint.getAccountInfo(danMimTokenAccount);

        assert.ok(new BN(bentoboxMimTotal.amount["base"]).eq(new BN(2015 * mimDecimal)));
        assert.ok(stanMimBentobox.amount.toString() == (1010 * mimDecimal).toString());
        assert.ok(danMimBentobox.amount.toString() == (505 * mimDecimal).toString());
        assert.ok(cauldronMimBalance.amount.toString() == (500 * mimDecimal).toString());
        assert.ok(stanMimAccount.amount.toString() == (0 * mimDecimal).toString());
        assert.ok(danMimAccount.amount.toString() == (5 * mimDecimal).toString());


        // repaying Mims for Stan
        await cauldronProgram.methods.repay(borrowerStan.publicKey, false, new BN(1010 * mimDecimal))
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

        // repaying Mims for Dan
        await cauldronProgram.methods.repay(borrowerDan.publicKey, false, new BN(505 * mimDecimal))
            .accounts({
                totalData: cauldron.getTotalDataPda(),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                userBalance: cauldron.getUserBalancePda(borrowerDan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                fromBentoboxBalance: bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey),
                magicInternetMoneyMint: mimMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                authority: borrowerDan.publicKey,
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerDan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
            })
            .remainingAccounts([{ pubkey: bentobox.getBentoboxAuthority(), isWritable: false, isSigner: false }])
            .signers([borrowerDan]).rpc();

        let cauldronAcc = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        let accrueInfo = cauldronAcc.accrueInfo;

        assert.notOk(accrueInfo.lastAccrued.eqn(0));
        assert.ok(accrueInfo.feesEarned.eq(new BN(15 * mimDecimal)));
        assert.ok(accrueInfo.interestPerSecond.eqn(10000));

        bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        stanMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        danMimBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, mimMint.publicKey));
        cauldronMimBalance = await bentoboxProgram.account.balance.fetch(cauldronMimBentoboxBalance);
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        danCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerDan.publicKey));

        assert.ok(stanCauldronUserBalance.borrowPart.toString() == (0 * mimDecimal).toString());
        assert.ok(danCauldronUserBalance.borrowPart.toString() == (0 * mimDecimal).toString());

        assert.ok(new BN(bentoboxMimTotal.amount["base"]).eq(new BN(2015 * mimDecimal)));
        assert.ok(stanMimBentobox.amount.toString() == (0 * mimDecimal).toString());
        assert.ok(danMimBentobox.amount.toString() == (0 * mimDecimal).toString());
        assert.ok(cauldronMimBalance.amount.toString() == (2015 * mimDecimal).toString());

        assert.ok(cauldronTotal.borrow.base.eq(new BN(0 * mimDecimal)));
        assert.ok(cauldronTotal.borrow.elastic.eq(new BN(0 * mimDecimal)));


        // remove collateral after we repayed MIMs for Stan
        await cauldronProgram.methods.removeCollateral(borrowerStan.publicKey, new BN(1500000 * collateralDecimal))
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

        // remove collateral after we repayed MIMs for Dan
        await cauldronProgram.methods.removeCollateral(borrowerDan.publicKey, new BN(1000000 * collateralDecimal))
            .accounts({
                userBalance: cauldron.getUserBalancePda(borrowerDan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                collateral: collateralMint.publicKey,
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), collateralMint.publicKey),
                toBentoboxBalance: bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                cauldronAuthority: cauldron.getCauldronAuthority(),
                switchboardDataFeed: TEST_PRICE,
                authority: borrowerDan.publicKey,
                masterContractApproved: cauldron.getCauldronAuthorityApprovedPda(),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount())
            })
            .signers([borrowerDan])
            .rpc();

        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());
        assert.ok(cauldronTotal.collateralShare.toString() == (0 * collateralDecimal).toString());
        assert.ok(cauldronTotal.borrow.base.toString() == (0 * collateralDecimal).toString());
        assert.ok(cauldronTotal.borrow.elastic.toString() == (0 * collateralDecimal).toString());

        stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        assert.ok(stanCauldronUserBalance.collateralShare.toString() == (0 * collateralDecimal).toString());

        danCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerDan.publicKey));
        assert.ok(danCauldronUserBalance.collateralShare.toString() == (0 * collateralDecimal).toString());

        stanCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        danCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey));

        assert.ok(stanCollaretalBentobox.amount.toString() == (3000000 * collateralDecimal).toString());
        assert.ok(danCollaretalBentobox.amount.toString() == (2000000 * collateralDecimal).toString());

        cauldronCollateralBentobox = await bentoboxProgram.account.balance.fetch(cauldronCollateralBentoboxBalance);
        assert.ok(cauldronCollateralBentobox.amount.toString() == (0 * collateralDecimal).toString());


        // withdraw collateral from bentobox to Stan
        await cauldronProgram.methods.bentoWithdraw(new BN(3000000 * collateralDecimal), new BN(0))
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

        // withdraw collateral from bentobox to Dan
        await cauldronProgram.methods.bentoWithdraw(new BN(2000000 * collateralDecimal), new BN(0))
            .accounts({
                toVault: danTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxFromBalance: bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldronAuthorityPda,
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(borrowerDan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: borrowerDan.publicKey,
            })
            .signers([borrowerDan])
            .rpc();


        bentoboxTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(collateralMint.publicKey));
        stanCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        danCollaretalBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerDan.publicKey, collateralMint.publicKey));

        stanCollateralAccount = await collateralMint.getAccountInfo(stanTokenAccount);
        danCollateralAccount = await collateralMint.getAccountInfo(danTokenAccount);

        assert.ok(new BN(bentoboxTotal.amount["base"]).eq(new BN(0 * collateralDecimal)));
        assert.ok(stanCollateralAccount.amount.toString() == (3000000 * collateralDecimal).toString());
        assert.ok(danCollateralAccount.amount.toString() == (2000000 * collateralDecimal).toString());
        assert.ok(stanCollaretalBentobox.amount.toString() == (0 * collateralDecimal).toString());
        assert.ok(danCollaretalBentobox.amount.toString() == (0 * collateralDecimal).toString());

    });

});