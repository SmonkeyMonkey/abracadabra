import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"
import { SwapperOrca as SwapperOrcaProgram } from "../../../target/types/swapper_orca";
import { OrcaSolPool, COMPLETE_LIQUIDATION_DURATION, ORCA_TOKEN_SWAP_ID_DEVNET, ORCA_SOL_UPPER, SOL_TOKEN, ORCA_TOKEN, ORCA_SOL, COLLATERIZATION_RATE_PRECISION } from "../../common/src/constants"
import {
    getOrca,
    OrcaPoolConfig,
    Network,
    resolveOrCreateAssociatedTokenAddress,
    TransactionBuilder
} from "@orca-so/sdk";
import { Owner } from "@orca-so/sdk/dist/public/utils/web3/key-utils"
import * as fs from 'fs';
import Decimal from "decimal.js";

describe("Liquidate and Swap Orca", () => {
    const provider = common.getAnchorProvider();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;
    const swapperOrcaProgram = anchor.workspace.SwapperOrca as Program<SwapperOrcaProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    let collateralMint: PublicKey = SOL_TOKEN;
    let mimMint: PublicKey = ORCA_TOKEN;

    const COLLATERAL_DECIMALS = Math.pow(10, 9);
    const MIM_DECIMALS = Math.pow(10, 6);

    const mimBorrowAmount = new BN(new u64(0.0005 * MIM_DECIMALS));
    const collateralBalance: u64 = new u64(0.1 * COLLATERAL_DECIMALS);

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();

    const stan = Keypair.generate();
    const bob = Keypair.generate();

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();
    let orcaSolPool: OrcaSolPool = new OrcaSolPool();

    let cauldronAuthorityPda: PublicKey = null;

    let stanMimTokenAccount: PublicKey = null;
    let stanCollateralTokenAccount: PublicKey = null;
    let bobMimTokenAccount: PublicKey = null;
    let bobCollateralTokenAccount: PublicKey = null;
    let cauldronMimBentoboxBalance: PublicKey = null;
    let cauldronCollateralBentoboxBalance: PublicKey = null;
    let walletMimTokenAccount: PublicKey = null;

    let cleanupInstructions: TransactionInstruction[]
    let authorityForPoolAddress: PublicKey = null;
    let wallet: Keypair = null;

    before(async () => {
        // await common.batchAirdrop(connection, [bentoboxOwner, cauldronOwner]);
        // await common.requestAirdropSol(connection, 4, stan)
        // await common.requestAirdropSol(connection, 4, bob)

        wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${__dirname}/../../wallets/devnet.json`, 'utf8'))));

        const [_authorityForPoolAddress] = PublicKey.findProgramAddressSync(
            [orcaSolPool.poolAddress.toBuffer()],
            ORCA_TOKEN_SWAP_ID_DEVNET
        );
        authorityForPoolAddress = _authorityForPoolAddress

        const { address: _stanCollateralTokenAccount, ...resolveStanCollateralTokenAccountInstructions } =
            await resolveOrCreateAssociatedTokenAddress(
                connection,
                new Owner(stan),
                collateralMint,
                collateralBalance
            );
        stanCollateralTokenAccount = _stanCollateralTokenAccount

        const { address: _stanMimTokenAccount, ...resolveStanMimTokenAccountInstructions } =
            await resolveOrCreateAssociatedTokenAddress(
                connection,
                new Owner(stan),
                mimMint,
            );
        stanMimTokenAccount = _stanMimTokenAccount

        const { address: _bobCollateralTokenAccount, ...resolveBobCollateralTokenAccountInstructions } =
            await resolveOrCreateAssociatedTokenAddress(
                connection,
                new Owner(bob),
                collateralMint,
            );
        bobCollateralTokenAccount = _bobCollateralTokenAccount

        const { address: _bobMimTokenAccount, ...resolveBobMimTokenAccountInstructions } =
            await resolveOrCreateAssociatedTokenAddress(
                connection,
                new Owner(bob),
                mimMint,
            );
        bobMimTokenAccount = _bobMimTokenAccount

        cleanupInstructions = resolveStanCollateralTokenAccountInstructions.cleanupInstructions.concat(
            resolveStanMimTokenAccountInstructions.cleanupInstructions,
            resolveBobCollateralTokenAccountInstructions.cleanupInstructions,
            resolveBobMimTokenAccountInstructions.cleanupInstructions)

        resolveStanCollateralTokenAccountInstructions.cleanupInstructions = []
        resolveStanMimTokenAccountInstructions.cleanupInstructions = []
        resolveBobCollateralTokenAccountInstructions.cleanupInstructions = []
        resolveBobMimTokenAccountInstructions.cleanupInstructions = []

        let payload = await new TransactionBuilder(connection, stan.publicKey, new Owner(stan))
            .addInstruction(resolveStanCollateralTokenAccountInstructions)
            .addInstruction(resolveStanMimTokenAccountInstructions)
            .build();

        await payload.execute();

        payload = await new TransactionBuilder(connection, bob.publicKey, new Owner(bob))
            .addInstruction(resolveBobCollateralTokenAccountInstructions)
            .addInstruction(resolveBobMimTokenAccountInstructions)
            .build();

        await payload.execute();

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for MIM
        await bentobox.createVault(mimMint, cauldronOwner);
        // create total vault for collateral
        await bentobox.createVault(collateralMint, bentoboxOwner);
        // create MIM Balance account for Stan on Bentobox
        await bentobox.createBalance(stan.publicKey, mimMint, stan);
        // create collateral Balance account for Stan on Bentobox
        await bentobox.createBalance(stan.publicKey, collateralMint, stan);
        // create MIM Balance account for Bob on Bentobox
        await bentobox.createBalance(bob.publicKey, mimMint, bob);
        // create collateral Balance account for Bob on Bentobox
        await bentobox.createBalance(bob.publicKey, collateralMint, bob);
        // create mim Balance account for Bob on Bentobox
        await bentobox.createBalance(wallet.publicKey, mimMint, wallet);
        // create strategy data account for MIM token
        await bentobox.createStrategyData(mimMint);
        // create strategy data account for collateral token
        await bentobox.createStrategyData(collateralMint);

        //initialize cauldron account
        await cauldron.initialize(cauldronOwner, mimMint, collateralMint, ORCA_SOL, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, new BN(1000000))

        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
        // create user balance for Stan on cauldron
        await cauldron.createUserBalance(stan.publicKey, stan)
        // create user balance for Bob on cauldron
        await cauldron.createUserBalance(bob.publicKey, bob)

        // create MIM Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint, cauldronOwner)

        // create collateral Balance account for cauldron on Bentobox
        await bentobox.createBalance(cauldron.getCauldronAuthority(), collateralMint, cauldronOwner)

        cauldronAuthorityPda = cauldron.getCauldronAuthority()
        cauldronMimBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, mimMint)
        cauldronCollateralBentoboxBalance = bentobox.getBalancePda(cauldronAuthorityPda, collateralMint)

        const { address: walletMimTokenAccount, ..._ } =
            await resolveOrCreateAssociatedTokenAddress(
                connection,
                new Owner(wallet),
                mimMint,
            );

        const { address: walletCollateralTokenAccount, ...resolveWalletCollateralTokenAccountInstructions } =
            await resolveOrCreateAssociatedTokenAddress(
                connection,
                new Owner(wallet),
                collateralMint,
                new u64(0.2 * COLLATERAL_DECIMALS)
            );

        const { userTransferAuthority, ...approvalInstruction } = common.createApprovalInstruction(
            wallet.publicKey,
            new u64(0.2 * COLLATERAL_DECIMALS),
            walletCollateralTokenAccount,
            wallet
        );

        cleanupInstructions = resolveWalletCollateralTokenAccountInstructions.cleanupInstructions.concat(approvalInstruction.cleanupInstructions)
        resolveWalletCollateralTokenAccountInstructions.cleanupInstructions = []
        approvalInstruction.cleanupInstructions = []

        payload = await new TransactionBuilder(connection, wallet.publicKey, new Owner(wallet))
            .addInstruction(resolveWalletCollateralTokenAccountInstructions)
            .addInstruction(approvalInstruction)
            .build();

        // swap to get some MIMs and than deposit it  
        const orca = getOrca(connection, Network.DEVNET);
        const pool = orca.getPool(OrcaPoolConfig.ORCA_SOL);
        const solToken = pool.getTokenB();
        const solAmount = new Decimal(4);
        const quote = await pool.getQuote(solToken, solAmount);
        const orcaAmount = quote.getMinOutputAmount();

        console.log(`Swap ${solAmount.toString()} SOL for at least ${orcaAmount.toNumber()} ORCA`);
        const swapPayload = await pool.swap(wallet, solToken, solAmount, orcaAmount);
        const swapTxId = await swapPayload.execute();
        console.log("swap tx id", swapTxId)


        // deposited to cauldron balance account on bentobox
        await bentobox.deposit(mimMint, walletMimTokenAccount, cauldronAuthorityPda, new BN(0.2 * MIM_DECIMALS), new BN(0), wallet)

        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Stan 
        await bentobox.createMasterContractApproval(stan, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
    });

    it("Liquidate Position and swap", async () => {
        await cauldron.approveToCauldron(stanCollateralTokenAccount, stan);

        // deposited to bentobox from Stan
        await cauldronProgram.methods.bentoDeposit(stan.publicKey, new BN(collateralBalance), new BN(0))
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

        await cauldronProgram.methods.addCollateral(stan.publicKey, new BN(collateralBalance), false)
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

        await cauldron.updateSwitchboardDataFeed(ORCA_SOL_UPPER, cauldronOwner);

        await cauldron.createVault(collateralMint, cauldronOwner);
        await cauldron.createVault(mimMint, cauldronOwner);
        await cauldron.createVault(orcaSolPool.poolTokenMint, cauldronOwner);

        let staUserBalance = await cauldronProgram.account.userBalance.fetch(cauldron.getUserBalancePda(stan.publicKey));
        let timestampBeforeLiquidate = Date.now() / 1000;

        await cauldron.beginLiquidate(stan.publicKey, mimBorrowAmount, bob, bentobox);

        let bob_liquidator_account = await cauldronProgram.account.liquidatorAccount.fetch(cauldron.getLiquidatorAccountPda(bob.publicKey));

        assert.ok(bob_liquidator_account.realAmount.toString() == "0");
        assert.ok(bob_liquidator_account.originLiquidator.toString() == bob.publicKey.toString());
        assert.ok(bob_liquidator_account.timestamp.toNumber() < Date.now() / 1000 + COMPLETE_LIQUIDATION_DURATION.toNumber() && timestampBeforeLiquidate < bob_liquidator_account.timestamp.toNumber());

        // swap by another liquidator before timestamp
        try {
            await cauldronProgram.methods.liquidateSwap()
                .accounts({
                    liquidatorAccount: cauldron.getLiquidatorAccountPda(bob.publicKey),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    collateral: cauldron.collateral,
                    magicInternetMoneyMint: cauldron.magicInternetMoney,
                    cauldronSourceVault: cauldron.getTotalVaultPda(cauldron.collateral),
                    cauldronDestinationVault: cauldron.getTotalVaultPda(cauldron.magicInternetMoney),
                    swapperProgram: swapperOrcaProgram.programId,
                    swapProgram: ORCA_TOKEN_SWAP_ID_DEVNET,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    authority: stan.publicKey,
                }).remainingAccounts([
                    // Orca specific
                    { pubkey: orcaSolPool.poolAddress, isWritable: false, isSigner: false },
                    { pubkey: authorityForPoolAddress, isWritable: false, isSigner: false },
                    { pubkey: orcaSolPool.poolSource, isWritable: true, isSigner: false },
                    { pubkey: orcaSolPool.poolDestination, isWritable: true, isSigner: false },
                    { pubkey: orcaSolPool.poolTokenMint, isWritable: true, isSigner: false },
                    { pubkey: orcaSolPool.feeAccount, isWritable: true, isSigner: false },
                    { pubkey: cauldron.getTotalVaultPda(orcaSolPool.poolTokenMint), isWritable: true, isSigner: false },
                    { pubkey: cauldron.collateral, isWritable: false, isSigner: false },
                    { pubkey: cauldron.magicInternetMoney, isWritable: false, isSigner: false },
                ]).signers([stan])
                .rpc({ commitment: "confirmed" })
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "TooSoon");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        };

        await cauldron.liquidateSwapOrca(
            bob,
            bob.publicKey,
            swapperOrcaProgram.programId,
            ORCA_TOKEN_SWAP_ID_DEVNET,
            orcaSolPool.poolAddress,
            authorityForPoolAddress,
            orcaSolPool.poolSource,
            orcaSolPool.poolDestination,
            orcaSolPool.poolTokenMint,
            orcaSolPool.feeAccount);

        bob_liquidator_account = await cauldronProgram.account.liquidatorAccount.fetch(cauldron.getLiquidatorAccountPda(bob.publicKey));
        assert.ok(bob_liquidator_account.realAmount >= bob_liquidator_account.borrowShare);
        assert.ok(bob_liquidator_account.originLiquidator.toString() == bob.publicKey.toString());

        // complete liquidation by another liquidator before timestamp
        try {
            await cauldronProgram.methods.completeLiquidate()
                .accounts({
                    liquidatorAccount: cauldron.getLiquidatorAccountPda(bob.publicKey),
                    cauldronMimBentoboxBalance: bentobox.getBalancePda(cauldron.cauldronAuthorityPda, cauldron.magicInternetMoney),
                    authorityMimBentoboxBalance: bentobox.getBalancePda(stan.publicKey, cauldron.magicInternetMoney),
                    cauldronAccount: cauldron.getCauldronAccount(),
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxAccount: cauldron.bentoboxAccount,
                    bentoboxProgram: bentobox.getBentoboxProgram(),
                    magicInternetMoneyMint: cauldron.magicInternetMoney,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    mimStrategyData: bentobox.getStrategyDataPda(cauldron.magicInternetMoney),
                    bentoboxMimTotalData: bentobox.getTotalDataPda(cauldron.magicInternetMoney),
                    cauldronMimVault: cauldron.getTotalVaultPda(cauldron.magicInternetMoney),
                    bentoboxMimVault: bentobox.getTotalVaultPda(cauldron.magicInternetMoney),
                    authority: stan.publicKey,
                }).signers([stan])
                .rpc({ commitment: "confirmed" });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "TooSoon");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        };

        // complete liquidation by origin liquidator
        await cauldron.completeLiquidate(
            bob,
            bob.publicKey,
            bentobox)
    });
});
