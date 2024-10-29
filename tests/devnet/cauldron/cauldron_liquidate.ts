import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import { COLLATERIZATION_RATE_PRECISION, TEST_PRICE, TEST_PRICE_UPPER } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Liquidate", () => {
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
    const stan = Keypair.generate();
    const bob = Keypair.generate();
    const mimBalance = 2000;
    const collateralBalance = 20000;
    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    let cauldronAuthorityPda: PublicKey = null;

    let bentoboxOwnerMimTokenAccount: PublicKey = null;
    let stanMimTokenAccount: PublicKey = null;
    let stanCollateralTokenAccount: PublicKey = null;
    let bobMimTokenAccount: PublicKey = null;
    let bobCollateralTokenAccount: PublicKey = null;
    let cauldronMimBentoboxBalance: PublicKey = null;
    let cauldronCollateralBentoboxBalance: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, cauldronOwner, stan, bob]);

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
        bentoboxOwnerMimTokenAccount = await common.createAndFundUserAccount(
            bentoboxOwner.publicKey,
            bentoboxOwner,
            mimMint,
            mimBalance
        );

        stanCollateralTokenAccount = await common.createAndFundUserAccount(
            stan.publicKey,
            bentoboxOwner,
            collateralMint,
            collateralBalance
        );

        stanMimTokenAccount = await common.createAndFundUserAccount(
            stan.publicKey,
            bentoboxOwner,
            mimMint,
            0
        );

        bobCollateralTokenAccount = await common.createAndFundUserAccount(
            bob.publicKey,
            bentoboxOwner,
            collateralMint,
            0
        );

        bobMimTokenAccount = await common.createAndFundUserAccount(
            bob.publicKey,
            bentoboxOwner,
            mimMint,
            20000
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for MIM
        await bentobox.createVault(mimMint.publicKey, cauldronOwner);
        // create total vault for collateral
        await bentobox.createVault(collateralMint.publicKey, bentoboxOwner);
        // create MIM Balance account for Stan on Bentobox
        await bentobox.createBalance(stan.publicKey, mimMint.publicKey, stan);
        // create collateral Balance account for Stan on Bentobox
        await bentobox.createBalance(stan.publicKey, collateralMint.publicKey, stan);
        // create MIM Balance account for Bob on Bentobox
        await bentobox.createBalance(bob.publicKey, mimMint.publicKey, bob);
        // create collateral Balance account for Bob on Bentobox
        await bentobox.createBalance(bob.publicKey, collateralMint.publicKey, bob);
        // create strategy data account for MIM token
        await bentobox.createStrategyData(mimMint.publicKey);
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint.publicKey);

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, new BN(1000000))

        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Stan on cauldron
        await cauldron.createUserBalance(stan.publicKey, stan)
        // create user balance for Bob on cauldron
        await cauldron.createUserBalance(bob.publicKey, bob)


        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint.publicKey, cauldronOwner)
        cauldronAuthorityPda = cauldron.getCauldronAuthority()
        cauldronMimBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, mimMint.publicKey)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint.publicKey, cauldronOwner)
        cauldronCollateralBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, collateralMint.publicKey)

        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(mimMint.publicKey, bentoboxOwnerMimTokenAccount, cauldronAuthorityPda, new BN(mimBalance), new BN(0), bentoboxOwner)

        // deposited to bob mim balance account on bentobox
        await bentobox.deposit(mimMint.publicKey, bobMimTokenAccount, bob.publicKey, new BN(5000), new BN(0), bob)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Stan 
        await bentobox.createMasterContractApproval(stan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
    });

    it("Liquidate Position", async () => {
        await cauldron.approveToCauldron(stanCollateralTokenAccount, stan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(stan.publicKey, new BN(collateralBalance), new BN(0))
            .accounts({
                fromVault: stanCollateralTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(stan.publicKey, collateralMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint.publicKey),
                mint: collateralMint.publicKey,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(stan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: stan.publicKey,
            })
            .signers([stan])
            .rpc();

        await cauldronProgram.methods.addCollateral(stan.publicKey, new BN(5000), false)
            .accounts({
                userBalance: cauldron.getUserBalancePda(stan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.totalDataPda,
                cauldronBentoboxBalance: cauldronCollateralBentoboxBalance,
                authority: stan.publicKey,
                cauldronAuthority: cauldronAuthorityPda
            }).remainingAccounts([
                { pubkey: collateralMint.publicKey, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBalancePda(stan.publicKey, collateralMint.publicKey), isWritable: true, isSigner: false },
                { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractApprovedPda(stan.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
            ])
            .signers([stan])
            .rpc();

        await cauldron.borrow(stan.publicKey,
            new BN(39),
            stan,
            cauldronMimBentoboxBalance,
            bentobox.getTotalDataPda(mimMint.publicKey),
            bentobox.getBalancePda(stan.publicKey, mimMint.publicKey),
            bentoboxProgram.programId);

        try {
            await cauldron.liquidate(stan.publicKey,
                39,
                bob.publicKey,
                bob,
                bentobox)
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UserIsSolvent");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        await cauldron.updateSwitchboardDataFeed(TEST_PRICE_UPPER, cauldronOwner);

        await cauldron.liquidate(stan.publicKey,
            39,
            bob.publicKey,
            bob,
            bentobox)
    });
});
