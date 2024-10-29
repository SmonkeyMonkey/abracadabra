import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program, BN, AnchorError } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { StrategyMock as StrategyMockProgram } from "../../../target/types/strategy_mock";

import { Bentobox } from "../../common/bentobox"
import { StrategyMock } from "../../common/mock_strategy"

import * as common from "../../common/common";

describe("bentobox safe harvest", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const strategyMockProgram = anchor.workspace.StrategyMock as Program<StrategyMockProgram>;
    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    const bentobox_idl = require("../../../target/idl/bentobox.json");

    let mint: Token = null;

    const strategyMockOwner = Keypair.generate();
    const Bob = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const pool_owner = Keypair.generate();

    let bentobox = new Bentobox();
    let strategyMock = new StrategyMock()
    let strategyMock_v2 = new StrategyMock()
    let pool_vault: PublicKey = null;
    let BobTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, strategyMockOwner, Bob]);

        mint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        BobTokenAccount = await common.createAndFundUserAccount(
            Bob.publicKey,
            bentoboxOwner,
            mint,
            2000
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for mint
        await bentobox.createVault(mint.publicKey, Bob);
        // create mint Balance account for Bob 
        await bentobox.createBalance(Bob.publicKey, mint.publicKey, Bob)
        // create strategy data account for mint token
        await bentobox.createStrategyData(mint.publicKey)
        // set strategy delay
        await bentobox.setStrategyDelay(new BN(10));

        await bentobox.deposit(mint.publicKey, BobTokenAccount, Bob.publicKey, new BN(2000), new BN(0), Bob)

        pool_vault = await common.createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );

        // initialize mock_strategy
        await strategyMock.initialize(mint.publicKey, bentobox.getBentoboxAccount(), bentoboxProgram.programId, pool_vault, pool_owner, strategyMockOwner)
        // initialize strategyMock_v2
        await strategyMock_v2.initialize(mint.publicKey, bentobox.getBentoboxAccount(), bentoboxProgram.programId, pool_vault, pool_owner, strategyMockOwner)
    });

    it("safe harvest", async () => {
        let mint_2 = await common.createMintAccount(connection, bentoboxOwner, bentoboxOwner.publicKey, 0);
        // create total vault for mint_2
        await bentobox.createVault(mint_2.publicKey, Bob);

        // try to do harvest when strategy is not set
        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([{ pubkey: pool_vault, isWritable: true, isSigner: false }])
                .signers([strategyMockOwner])
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "StrategyNotSet");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try to do harvest when set only pending strategy
        // set pending strategy
        await bentoboxProgram.methods.setStrategy()
            .accounts({
                strategyProgram: strategyMockProgram.programId,
                bentoboxProgram: bentoboxProgram.programId,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                strategyAccount: strategyMock.getStrategyMockAccount(),
                strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                tokenProgram: TOKEN_PROGRAM_ID,
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                bentoboxAuthority: bentobox.getBentoboxAuthority(),
                authority: bentoboxOwner.publicKey,
                strategyAuthority: strategyMock.getStrategyMockAuthority(),
                systemProgram: SystemProgram.programId
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false }
            ])
            .signers([bentoboxOwner]).rpc()

        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([{ pubkey: pool_vault, isWritable: true, isSigner: false }])
                .signers([strategyMockOwner])
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "StrategyNotSet");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(12 * 1000);

        // try set active strategy
        await bentoboxProgram.methods.setStrategy()
            .accounts({
                strategyProgram: strategyMockProgram.programId,
                bentoboxProgram: bentoboxProgram.programId,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                strategyAccount: strategyMock.getStrategyMockAccount(),
                strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                tokenProgram: TOKEN_PROGRAM_ID,
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                bentoboxAuthority: bentobox.getBentoboxAuthority(),
                authority: bentoboxOwner.publicKey,
                strategyAuthority: strategyMock.getStrategyMockAuthority(),
                systemProgram: SystemProgram.programId
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false }
            ])
            .signers([bentoboxOwner]).rpc()

        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock_v2.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)

                }).remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false }
                ])
                .signers([strategyMockOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidStrategyAccount");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try to use account bentobox token account for another token
        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint_2.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false }
                ])
                .signers([strategyMockOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // try to use account bentobox token account with not compatible token account
        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: strategyMock.getStrategyMockAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false }
                ])
                .signers([strategyMockOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorMessage, "Invalid authority of bentobox token account.");
            assert.strictEqual(err.error.errorCode.number, 6002);
        }

        // try to use another bentoboxVault
        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint_2.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false }
                ])
                .signers([strategyMockOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // 1) try to sign by signer which is not strategy executor
        await strategyMock.setStrategyExecutor(bentoboxOwner.publicKey, false)

        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: bentoboxOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false }
                ])
                .signers([bentoboxOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UnauthorizedSafeHarvest");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // 2) Use executor info account from allowed another user
        try {
            await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: bentoboxOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
                }).remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false }
                ])
                .signers([bentoboxOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UnauthorizedSafeHarvest");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        await strategyMock.setStrategyExecutor(bentoboxOwner.publicKey, true)
        // sign with one of strategy mock owner
        await bentoboxProgram.methods.safeHarvest(new BN(2000), true, new BN(500), true, bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                strategyProgram: strategyMockProgram.programId,
                bentoboxProgram: bentoboxProgram.programId,
                strategyVault: strategyMock.getTotalVaultPda(mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                authority: strategyMockOwner.publicKey,
                bentoboxAuthority: bentobox.getBentoboxAuthority(),
                strategyAuthority: strategyMock.getStrategyMockAuthority(),
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                cpiResultAccount: strategyMock.getCpiResultAccount(),
                strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                executorInfo: strategyMock.getStrategyMockExecutorInfoPda(strategyMockOwner.publicKey)
            }).remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false }
            ])
            .signers([strategyMockOwner]).rpc()
        const _base_strategy_info = await strategyMockProgram.account.baseStrategyInfo.fetch(strategyMock.getBaseStrategyInfoAccount());
        assert.ok(_base_strategy_info.maxBentoboxBalance.toString() == "2000");
    });
});
