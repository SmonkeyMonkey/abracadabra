import * as anchor from '@coral-xyz/anchor';
import { Program, BN, AnchorError } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { StrategyMock as StrategyMockProgram } from "../../../target/types/strategy_mock";

import { Bentobox } from "../../common/bentobox"
import { StrategyMock } from "../../common/mock_strategy"

import * as common from "../../common/common";

describe("Bentobox set strategy loss", () => {
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
    let pool_vault: PublicKey = null;

    let BobTokenAccount: PublicKey = null;
    let defaultPubKey = SystemProgram.programId;

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

        // initialize mock_strategy
        await strategyMock.initialize(mint.publicKey, bentobox.getBentoboxAccount(), bentoboxProgram.programId, pool_vault, pool_owner, strategyMockOwner)
    });

    it('Set strategy loss!', async () => {
        // case when there will be no profit in pool
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

        let strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.equal(strategy_data_acc.pendingStrategy.toString(), strategyMock.getStrategyMockAccount().toString());
        assert.equal(strategy_data_acc.activeStrategy.toString(), defaultPubKey.toString());
        assert.ok(strategy_data_acc.strategyStartDate > new BN(0));

        // try set strategy too soon
        try {
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
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "TooEarlyStrategyStartData");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(12 * 1000);

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
                { pubkey: pool_vault, isWritable: true, isSigner: false }
            ])
            .signers([bentoboxOwner]).rpc()

        strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.equal(strategy_data_acc.pendingStrategy.toString(), defaultPubKey.toString());
        assert.equal(strategy_data_acc.activeStrategy.toString(), strategyMock.getStrategyMockAccount().toString());
        assert.ok(strategy_data_acc.strategyStartDate.isZero());

        // 2. profit = 0, rebalancing -> skimming
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

        strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.ok(strategy_data_acc.balance.toString() == "200");

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

        strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.equal(strategy_data_acc.pendingStrategy.toString(), strategyMock.getStrategyMockAccount().toString());
        assert.equal(strategy_data_acc.activeStrategy.toString(), strategyMock.getStrategyMockAccount().toString());
        assert.ok(strategy_data_acc.strategyStartDate > new BN(0));

        let someVault = await common.createAndFundUserAccount(
            strategyMockOwner.publicKey,
            bentoboxOwner,
            mint,
            2000
        );

        await mint.transfer(pool_vault, someVault, pool_owner, [pool_owner], 100) // actually loss
        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "100");

        delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(12 * 1000);

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

        strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.equal(strategy_data_acc.pendingStrategy.toString(), defaultPubKey.toString());
        assert.equal(strategy_data_acc.activeStrategy.toString(), strategyMock.getStrategyMockAccount().toString());
        assert.ok(strategy_data_acc.strategyStartDate.isZero());

        strategy_vault_acc = await mint.getAccountInfo(strategyMock.getTotalVaultPda(mint.publicKey));
        assert.equal(strategy_vault_acc.amount.toString(), "0");

        pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.equal(pool_vault_acc.amount.toString(), "0");

        bentobox_vault_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.equal(bentobox_vault_acc.amount.toString(), "1900");

        total_info_data = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.equal(total_info_data.amount["elastic"].toString(), "1900");

        strategy_data_acc = await bentoboxProgram.account.strategyData.fetch(bentobox.getStrategyDataPda(mint.publicKey));
        assert.equal(strategy_data_acc.balance.toString(), "0");
    });
});
