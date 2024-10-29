import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, BN, AnchorError } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { StrategyMock as StrategyMockProgram } from "../../../target/types/strategy_mock";

import { Bentobox } from "../../common/bentobox"
import { StrategyMock } from "../../common/mock_strategy"

import * as common from "../../common/common";

describe('bentobox_harvest', () => {
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
    let pool_vault_v2: PublicKey = null;
    let BobTokenAccount: PublicKey = null;

    let someVault: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, strategyMockOwner, Bob, pool_owner]);

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
            4000
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
        await bentobox.setStrategyTargetPercentage(new BN(10), mint.publicKey)

        pool_vault = await common.createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );

        pool_vault_v2 = await common.createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );

        // initialize mock_strategy
        await strategyMock.initialize(mint.publicKey, bentobox.getBentoboxAccount(), bentoboxProgram.programId, pool_vault, pool_owner, strategyMockOwner)

        // initialize strategyMock_v2
        await strategyMock_v2.initialize(mint.publicKey, bentobox.getBentoboxAccount(), bentoboxProgram.programId, pool_vault_v2, pool_owner, strategyMockOwner)
    });

    it('Harvest. Breaking tests.', async () => {
        // try to do harvest when strategy is not set
        try {
            await bentoboxProgram.methods.harvest(false, new BN(0), bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
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
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                })
                .remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false },
                ])
                .signers([strategyMockOwner]).rpc()
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
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([bentoboxOwner]).rpc()

        try {
            await bentoboxProgram.methods.harvest(false, new BN(0), bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock.getStrategyMockAccount(),
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
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                })
                .remainingAccounts([
                    { pubkey: pool_vault, isWritable: true, isSigner: false },
                ])
                .signers([strategyMockOwner]).rpc()

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
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([bentoboxOwner]).rpc()


        // try to use another than active strategy

        try {
            await bentoboxProgram.methods.harvest(false, new BN(0), bentobox.getBentoboxAuthorityBump())
                .accounts({
                    strategyAccount: strategyMock_v2.getStrategyMockAccount(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    strategyProgram: strategyMockProgram.programId,
                    bentoboxProgram: bentoboxProgram.programId,
                    strategyVault: strategyMock_v2.getTotalVaultPda(mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    authority: strategyMockOwner.publicKey,
                    bentoboxAuthority: bentobox.getBentoboxAuthority(),
                    strategyAuthority: strategyMock_v2.getStrategyMockAuthority(),
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cpiResultAccount: strategyMock_v2.getCpiResultAccount(),
                    strategyData: bentobox.getStrategyDataPda(mint.publicKey),
                    baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
                })
                .remainingAccounts([
                    { pubkey: pool_vault_v2, isWritable: true, isSigner: false },
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
    });

    it('Harvest. Profit = 0, rebalancing - false', async () => {
        await bentoboxProgram.methods.harvest(false, new BN(0), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "0");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "2000");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toString() == "2000");

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toString() == "0");
    });

    it('Harvest. Profit = 0, rebalancing -> skimming', async () => {
        await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "200");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "1800");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toString() == "2000");

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toString() == "200");
    });

    it('Harvest. Profit = 0, rebalancing -> withdrawing', async () => {
        // conditions preparing
        // withdraw strategy need to set max bentobox value and check base harvest -> safe harvest does it
        await bentoboxProgram.methods.safeHarvest(new BN(4000), true, new BN(0), false, bentobox.getBentoboxAuthorityBump())
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
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "200");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "1800");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 2000);

        let new_strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(new_strategy_data_acc.balance.toNumber() == 200);

        // withdraw strategy
        await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(900), new BN(0))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                to: BobTokenAccount,
                balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                authority: Bob.publicKey,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                vaultAuthority: bentobox.getBentoboxAuthority(),
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([Bob]).rpc()

        strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "200");

        bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "900");

        total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1100);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 200);
        //conditions preparing finished

        await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false }
            ])
            .signers([strategyMockOwner]).rpc()

        strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "110");

        bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "990");

        total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1100);

        strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 110);
    });

    it('Harvest. Profit on pool, rebalancing -> skimming', async () => {
        // conditions preparing
        someVault = await common.createAndFundUserAccount(
            strategyMockOwner.publicKey,
            bentoboxOwner,
            mint,
            2000
        );
        await mint.transfer(someVault, pool_vault, strategyMockOwner, [strategyMockOwner], 100) // actually profit
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "210");
        // conditions preparing finished

        await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()
        // 100 - harvest profit, target out = 10 -> rebalancing on 10 to strategy
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "120");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "1080");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1200);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 120);
    });

    it('Harvest. Loss on pool, rebalancing -> skimming', async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);
        // conditions preparing
        await mint.transfer(pool_vault, someVault, pool_owner, [pool_owner], 100) // actually loss
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "20");
        // conditions preparing finished

        await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        // 100 - harvest loss, target out = 90 -> rebalancing on 90 to strategy 
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "110");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "990");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1100);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 110);
    });

    it('Harvest. Profit on pool, rebalancing -> withdrawing', async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);
        //prepare conditions
        await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(100), new BN(0))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                to: BobTokenAccount,
                balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                authority: Bob.publicKey,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                vaultAuthority: bentobox.getBentoboxAuthority(),
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([Bob]).rpc()

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "890");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1000);

        await mint.transfer(someVault, pool_vault, strategyMockOwner, [strategyMockOwner], 50) // actually profit
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "160");
        //prepare conditions finished
        
        let ix = await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner])
            .instruction();

        await sendAndConfirmTransaction(connection, common.wrapInTx(ix, 250000), [strategyMockOwner]);

        // 50 - harvest profit, target in = 5 -> rebalancing on 5 to strategy
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "105");

        bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "945");

        total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1050);
        
        
        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        // await delay(5 * 1000);
        assert.ok(strategy_data_acc.balance.toNumber() == 105);
    });

    it('Harvest. Loss on pool, rebalancing - false', async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);

        //prepare conditions
        await mint.transfer(pool_vault, someVault, pool_owner, [pool_owner], 50) // actually loss
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        
        await delay(2 * 1000);

        assert.ok(pool_vault_acc.amount.toString() == "55");
        //prepare conditions finished

        await bentoboxProgram.methods.harvest(false, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()
        // 50 - harvest loss, target = 0 + not rebalancing -> nothing rebalancing
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "55");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "945");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 1000);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 55);
    });

    it('Harvest. Profit on pool, rebalancing, limitation = 50, skimming', async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);
        //prepare conditions
        await bentoboxProgram.methods.deposit(Bob.publicKey, new BN(2000), new BN(0))
            .accounts({
                from: BobTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                authority: Bob.publicKey,
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                mint: mint.publicKey,
                strategyData: bentobox.getStrategyDataPda(mint.publicKey),
            })
            .signers([Bob]).rpc()
        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        await delay(2 * 1000);
        assert.ok(bentobox_vault_acc.amount.toString() == "2945");
        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 3000);

        await mint.transfer(someVault, pool_vault, strategyMockOwner, [strategyMockOwner], 100) // actually profit
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "155");
        //prepare conditions finished

        await bentoboxProgram.methods.harvest(true, new BN(50), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        // 100 - harvest profit, target = 249 + limitation(50) -> 50, rebalancing to strategy 50
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "105");

        bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "2995");

        total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 3100);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 105);
    });

    it('Harvest. Loss on pool, rebalancing, reinvest diff, skimming', async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);
        // make a loss on pool, but we have some tokens sitting in the contract so we can reinvest, rebalancing -> skimmimg
        // prepare conditions
        await mint.transfer(pool_vault, someVault, pool_owner, [pool_owner], 50) // actually loss
        await mint.transfer(someVault, strategyMock.getTotalVaultPda(mint.publicKey), strategyMockOwner, [strategyMockOwner], 30) // set to strategy
        await delay(2 * 1000);
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "55");
        //prepare conditions finished

        await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()
        // 50 - harvest loss, but on strategy - 30, -> loss = 20, rebalancing -> skimmimg
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "308");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "2772");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 3080);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 308);
    });

    it('Harvest. Loss on pool, rebalancing, reinvest from strategy vault, skimming', async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);
        // make a loss on pool, but we have some tokens sitting in the contract so
        // we can send the profit to BentoBox and reinvest the rest, 
        // rebalancing -> skimmimg
        //prepare conditions
        await mint.transfer(pool_vault, someVault, pool_owner, [pool_owner], 50) // actually loss
        await mint.transfer(someVault, strategyMock.getTotalVaultPda(mint.publicKey), strategyMockOwner, [strategyMockOwner], 80) // set to strategy
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "258");
        //prepare conditions finished
        
        await delay(2 * 1000);
        let ix = await bentoboxProgram.methods.harvest(true, new BN(500), bentobox.getBentoboxAuthorityBump())
            .accounts({
                strategyAccount: strategyMock.getStrategyMockAccount(),
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
                baseStrategyInfo: strategyMock.getBaseStrategyInfoAccount(),
            })
            .remainingAccounts([
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).instruction()

        await sendAndConfirmTransaction(connection, common.wrapInTx(ix, 250000), [strategyMockOwner]);

        // 50 - harvest loss, but on strategy - 80, -> profit = 30, rebalancing -> skimmimg
        let strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.ok(strategy_vault_acc.amount.toString() == "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "311");

        let bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(bentobox_vault_acc.amount.toString() == "2799");

        let total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total_info_data.amount["elastic"].toNumber() == 3110);

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toNumber() == 311);
    });
});