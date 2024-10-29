import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { SwapperRaydium } from "../../../target/types/swapper_raydium";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import * as common from "../../common/common";
import * as raydium from "../../common/src/util/raydium_util"
import { Bentobox } from "../../common/bentobox"
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Cauldron } from "../../common/cauldron"
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";

import console from "console";
import { assert } from "chai";
import { COLLATERIZATION_RATE_PRECISION, USD_RAY, USDC_RAY_UPPER } from "../../common/src/constants";

describe("Liquidate and Swap Raydium", () => {
    const provider = common.getAnchorProvider();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const rayMintKey = new PublicKey("FSRvxBNrQWX2Fy2qvKMLL3ryEdRtE3PUTZBcdKwASZTU");
    const usdcMintKey = new PublicKey("BEcGFQK1T1tSu3kvHC17cyCkQ5dvXqAJ7ExB2bb5Do7a");

    const rayUsdcPool = new PublicKey("ELSGBb45rAQNsMTVzwjUqL8vBophWhPn4rNbqwxenmqY");

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;
    const swapperRaydiumProgram = anchor.workspace.SwapperRaydium as Program<SwapperRaydium>;

    //NOTE: Let`s pretend that USDC is mim.
    const mimMint: PublicKey = usdcMintKey;
    const collateralMint: PublicKey = rayMintKey;

    const mainOwner = Keypair.fromSecretKey(Uint8Array.from([113, 150, 89, 5, 90, 124, 230, 0, 25, 197, 133, 127, 120, 81, 174, 24, 237, 38, 253, 216, 103, 43, 198, 245, 144, 155, 145, 234, 115, 144, 60, 46, 173, 133, 35, 218, 99, 100, 254, 2, 158, 133, 136, 142, 11, 30, 94, 8, 159, 111, 115, 50, 248, 6, 41, 186, 240, 126, 183, 69, 160, 249, 164, 83,]));
    const stan = Keypair.fromSecretKey(Uint8Array.from([250, 130, 251, 35, 26, 116, 13, 90, 228, 102, 9, 146, 93, 91, 136, 103, 63, 5, 78, 128, 247, 145, 113, 210, 135, 177, 146, 217, 117, 194, 91, 47, 173, 180, 188, 164, 247, 63, 131, 61, 253, 19, 223, 153, 237, 81, 110, 156, 169, 48, 226, 131, 16, 53, 102, 92, 209, 227, 77, 92, 216, 96, 144, 247]));

    let mainOwnerMimTokenAccount: PublicKey = null;
    let mainOwnerCollateralTokenAccount: PublicKey = null;
    let stanMimTokenAccount: PublicKey = null;
    let stanCollateralTokenAccount: PublicKey = null;

    const cauldron = new Cauldron();
    const bentobox = new Bentobox();

    let cauldronAuthorityPda: PublicKey = null;
    let cauldronMimBentoboxBalance: PublicKey = null;
    let cauldronCollateralBentoboxBalance: PublicKey = null;

    //1 USDC = 9.933394 RAY
    // How to airdrop RAY and USDC on devnet see https://sdk.alphadefi.info/guides/swap
    const COLLATERAL_DECIMALS = Math.pow(10, 6);
    const MIM_DECIMALS = Math.pow(10, 6);
    const mimBorrowAmount = new u64(0.59 * MIM_DECIMALS);
    const collateralBalance = new u64(60 * COLLATERAL_DECIMALS);

    before(async () => {
        await common.batchAirdrop(connection, [mainOwner, stan]);
        console.log(`bentoboxOwner: ${mainOwner.publicKey.toBase58()}`);
        console.log(`stan: ${stan.publicKey.toBase58()}`);

        mainOwnerMimTokenAccount = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mimMint,
            mainOwner.publicKey
        );

        console.log(`main owner USDC TA: ${mainOwnerMimTokenAccount.toBase58()}`);

        mainOwnerCollateralTokenAccount = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            collateralMint,
            mainOwner.publicKey
        );

        console.log(`main owner RAY TA: ${mainOwnerCollateralTokenAccount.toBase58()}`);

        stanMimTokenAccount = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mimMint,
            stan.publicKey
        );

        console.log(`Stan USDC TA: ${stanMimTokenAccount.toBase58()}`);

        stanCollateralTokenAccount = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            collateralMint,
            stan.publicKey
        );

        console.log(`Stan RAY TA: ${stanCollateralTokenAccount.toBase58()}`);

        // create bentobox
        await bentobox.create(mainOwner);
        // create total vault for MIM
        await bentobox.createVault(mimMint, mainOwner);
        // create total vault for collateral
        await bentobox.createVault(collateralMint, mainOwner);
        // create MIM Balance account for Stan on Bentobox
        await bentobox.createBalance(stan.publicKey, mimMint, stan);
        // create collateral Balance account for Stan on Bentobox
        await bentobox.createBalance(stan.publicKey, collateralMint, stan);
        // create MIM Balance account for Bob on Bentobox
        await bentobox.createBalance(mainOwner.publicKey, mimMint, mainOwner);
        // create collateral Balance account for Bob on Bentobox
        await bentobox.createBalance(mainOwner.publicKey, collateralMint, mainOwner);
        // create strategy data account for MIM token
        await bentobox.createStrategyData(mimMint);
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint);


        //initialize cauldron account2
        await cauldron.initialize(mainOwner, mimMint, collateralMint, USD_RAY, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, new u64(1000000))

        // create cauldron total vault   
        await cauldron.createTotal(mainOwner);
        // create user balance for Stan on cauldron
        await cauldron.createUserBalance(stan.publicKey, stan)
        // create user balance for Bob on cauldron
        await cauldron.createUserBalance(mainOwner.publicKey, mainOwner)

        cauldronAuthorityPda = cauldron.getCauldronAuthority()
        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldronAuthorityPda, mimMint, mainOwner)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldronAuthorityPda, collateralMint, mainOwner)


        cauldronMimBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, mimMint)
        cauldronCollateralBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, collateralMint)

        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(mimMint, mainOwnerMimTokenAccount, cauldronAuthorityPda, mimBorrowAmount, new u64(0), mainOwner)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Stan 
        await bentobox.createMasterContractApproval(stan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(mainOwner, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
    });

    it("Liquidate With Raydium Swapper", async () => {
        await cauldron.approveToCauldron(stanCollateralTokenAccount, stan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(stan.publicKey, new u64(collateralBalance), new u64(0))
            .accounts({
                fromVault: stanCollateralTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(collateralMint),
                bentoboxToBalance: bentobox.getBalancePda(stan.publicKey, collateralMint),
                bentoboxTotalData: bentobox.getTotalDataPda(collateralMint),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(collateralMint),
                mint: collateralMint,
                cauldronAuthority: cauldronAuthorityPda,
                masterContractApproved: bentobox.getMasterContractApprovedPda(stan.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: stan.publicKey,
            })
            .signers([stan])
            .rpc();

        await cauldronProgram.methods.addCollateral(stan.publicKey, new u64(collateralBalance), false)
            .accounts({
                userBalance: cauldron.getUserBalancePda(stan.publicKey),
                cauldronAccount: cauldron.getCauldronAccount(),
                totalData: cauldron.totalDataPda,
                cauldronBentoboxBalance: cauldronCollateralBentoboxBalance,
                authority: stan.publicKey,
                cauldronAuthority: cauldronAuthorityPda
            }).remainingAccounts([
                { pubkey: collateralMint, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBalancePda(stan.publicKey, collateralMint), isWritable: true, isSigner: false },
                { pubkey: bentoboxProgram.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox.getBentoboxAccount(), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
                { pubkey: bentobox.getMasterContractApprovedPda(stan.publicKey, cauldron.getCauldronAccount()), isWritable: false, isSigner: false },
            ])
            .signers([stan])
            .rpc();

        await cauldron.borrow(stan.publicKey,
            mimBorrowAmount,
            stan,
            cauldronMimBentoboxBalance,
            bentobox.getTotalDataPda(mimMint),
            bentobox.getBalancePda(stan.publicKey, mimMint),
            bentoboxProgram.programId);

        await cauldron.updateSwitchboardDataFeed(USDC_RAY_UPPER, mainOwner);
        const raydiumPoolProperties = await raydium.fetchPoolKeys(connection, rayUsdcPool);

        await cauldron.createVault(collateralMint, mainOwner);
        await cauldron.createVault(mimMint, mainOwner);
        await cauldron.createVault(raydiumPoolProperties.lpMint, mainOwner);

        await cauldron.beginLiquidate(stan.publicKey, mimBorrowAmount, mainOwner, bentobox);

        await cauldron.liquidateSwapRaydium(mainOwner, mainOwner.publicKey, swapperRaydiumProgram.programId, raydiumPoolProperties);

        await cauldron.completeLiquidate(mainOwner, mainOwner.publicKey, bentobox);

        const mainOwnerMiMBentoBoxBalanceAddress = bentobox.getBalancePda(mainOwner.publicKey, mimMint);
        const mainOwnerMiMBentoBoxBalance = await bentobox.bentoboxProgram.account.balance.fetch(mainOwnerMiMBentoBoxBalanceAddress);
        const mimAmount = mainOwnerMiMBentoBoxBalance.amount.toString(10);
        const mimTokenAmountBefore = (await connection.getTokenAccountBalance(mainOwnerMimTokenAccount)).value.amount;
        await bentoboxProgram.methods.withdraw(mainOwner.publicKey, new u64(mimAmount), new u64(0))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mimMint),
                to: mainOwnerMimTokenAccount,
                balance: mainOwnerMiMBentoBoxBalanceAddress,
                totalData: bentobox.getTotalDataPda(mimMint),
                authority: mainOwner.publicKey,
                vaultAuthority: bentobox.getBentoboxAuthority(),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
            }).signers([mainOwner]).rpc({ commitment: "confirmed" });

        const mimTokenAmountAfter = (await connection.getTokenAccountBalance(mainOwnerMimTokenAccount)).value.amount;
        assert.equal(mimAmount, (parseInt(mimTokenAmountAfter) - parseInt(mimTokenAmountBefore)).toString())
    });
});
