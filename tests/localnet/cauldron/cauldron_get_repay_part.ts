import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import * as borsh from "borsh";
import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION } from "../../common/src";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Get Repay part", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    let mimMint: Token = null;
    let collateralMint: Token = null;

    let cauldron = new Cauldron();
    let cauldron_v2 = new Cauldron();
    let bentobox = new Bentobox();
    let bentobox_v2 = new Bentobox();

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const borrowerStan = Keypair.generate();

    let bentoboxOwnerTokenAccount: PublicKey = null;
    let stanTokenAccount: PublicKey = null;
    let cauldronAuthorityPda: PublicKey = null;
    let cauldronBentoboxBalance: PublicKey = null;
    let cauldronCollateralBentoboxBalance: PublicKey = null;

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
            cauldronOwner,
            cauldronOwner.publicKey,
            0
        );

        // create token account for bentoboxOwner with some MiM tokens
        bentoboxOwnerTokenAccount = await common.createAndFundUserAccount(
            bentoboxOwner.publicKey,
            bentoboxOwner,
            mimMint,
            4000
        );

        stanTokenAccount = await common.createAndFundUserAccount(
            borrowerStan.publicKey,
            cauldronOwner,
            collateralMint,
            20000
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create bentobox_v2
        await bentobox_v2.create(bentoboxOwner);
        // create total vault for MIM
        await bentobox.createVault(mimMint.publicKey, cauldronOwner);
        // create MIM Balance account for Stan on Bentobox
        await bentobox.createBalance(borrowerStan.publicKey, mimMint.publicKey, borrowerStan)
        // create MIM Balance account for bentobox on Bentobox
        await bentobox.createBalance(bentobox.getBentoboxAuthority(), mimMint.publicKey, borrowerStan)
        // create total vault for collateral
        await bentobox.createVault(collateralMint.publicKey, bentoboxOwner);
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

        // initialize cauldron_v2 account        
        await cauldron_v2.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, new BN(1000000))

        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint.publicKey, cauldronOwner)
        cauldronAuthorityPda = cauldron.getCauldronAuthority()
        cauldronBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, mimMint.publicKey)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)
        cauldronCollateralBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, collateralMint.publicKey)

        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(mimMint.publicKey, bentoboxOwnerTokenAccount, bentobox.getBentoboxAuthority(), new BN(2000), new BN(0), bentoboxOwner)
        // deposited to bentobox from cauldron
        await bentobox.deposit(mimMint.publicKey, bentoboxOwnerTokenAccount, cauldron.getCauldronAuthority(), new BN(2000), new BN(0), bentoboxOwner)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Stan 
        await bentobox.createMasterContractApproval(borrowerStan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create approve account for bentobox_authority 
        await bentobox.createBentoboxAuthorityMasterContractApproval(cauldron.getCauldronAccount(), cauldronProgram.programId, cauldronOwner)
    });

    it("Borrow MIM and Repay", async () => {

        // 1) approve using web3
        // await collateralMint.approve(BobTokenAccount, cauldron_authority, Bob.publicKey, [Bob], 1000000);
        // 2) approve using approve_cauldron instruction
        await cauldron.approveToCauldron(stanTokenAccount, borrowerStan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(borrowerStan.publicKey, new BN(20000), new BN(0))
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
        assert.ok(bentoboxTotal.amount["base"].toString() == "20000");
        assert.ok(bentoboxTotal.amount["elastic"].toString() == "20000");
        let bentoboxBalance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        assert.ok(bentoboxBalance.amount.toString() == "20000");

        // adding collateral for borrower Stan
        await cauldronProgram.methods.addCollateral(borrowerStan.publicKey, new BN(5000), false)
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
        assert.ok(cauldronTotal.collateralShare.toString() == "5000");
        let stanCauldronUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(borrowerStan.publicKey));
        assert.ok(stanCauldronUserBalance.collateralShare.toString() == "5000");

        let stanCollaretalBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, collateralMint.publicKey));
        assert.ok(stanCollaretalBalanceOnBentobox.amount.toString() == "15000");
        let cauldronBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(cauldronCollateralBentoboxBalance);
        assert.ok(cauldronBalanceOnBentobox.amount.toString() == "5000");

        await cauldron.borrow(borrowerStan.publicKey, new BN(10),
            borrowerStan, cauldronBentoboxBalance,
            bentobox.getTotalDataPda(mimMint.publicKey),
            bentobox.getBalancePda(borrowerStan.publicKey,
                mimMint.publicKey), bentoboxProgram.programId);

        let bentoboxMimTotal = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        let stanMimBalanceOnBentobox = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(borrowerStan.publicKey, mimMint.publicKey));
        let cauldronBalance = await bentoboxProgram.account.balance.fetch(cauldronBentoboxBalance);
        cauldronTotal = await cauldronProgram.account.total.fetch(cauldron.getTotalDataPda());

        assert.ok(bentoboxMimTotal.amount["base"].toString() == "4000");
        assert.ok(stanMimBalanceOnBentobox.amount.toString() == "10");
        assert.ok(cauldronBalance.amount.toString() == "1990");
        assert.ok(cauldronTotal.borrow.base.toString() == "10");
        assert.ok(cauldronTotal.borrow.elastic.toString() == "10");

    });

    it("Get repay part", async () => {

        try {
            await cauldronProgram.methods.getRepayPart(new BN(50))
                .accounts({
                    cauldronAccount: cauldron_v2.getCauldronAccount(),
                    totalData: cauldron.getTotalDataPda(),
                    authority: cauldronOwner.publicKey,
                })
                .signers([cauldronOwner])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        let tx = await cauldronProgram.methods.getRepayPart(new BN(50))
            .accounts({
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.getTotalDataPda(),
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc({ commitment: "confirmed" });

        let t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        let [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, cauldronProgram.programId.toString());

        let reader = new borsh.BinaryReader(buffer);

        assert.equal(reader.readU64().toNumber(), 50);
    });

});