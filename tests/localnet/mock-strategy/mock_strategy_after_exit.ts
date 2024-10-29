import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, AnchorError } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";

import { Bentobox } from '../../../target/types/bentobox';
import { StrategyMock } from "../../../target/types/strategy_mock";

import {
    createMintAccount, requestAirdrop, getErrorInfo, createAndFundUserAccount,
} from "../../common/common";

import { getBentoBoxAddress, getBentoboxTotalAddress, getBentoboxStrategyDataAddress, getBentoboxTotalVaultAddress } from "../../common/bentobox_pda_helper";
import { getStrategyExecutorInfoAddress, getStrategyAddress, getStrategyVaultAddress } from "../../common/mock_strategy_pda_helper";

describe('strategy-mock', () => {
    const url = 'http://127.0.0.1:8899';
    const connection = new Connection(url,
        anchor.AnchorProvider.defaultOptions().preflightCommitment
    );
    const provider = anchor.AnchorProvider.local(url);
    anchor.setProvider(provider);

    const strategy_mock_program = anchor.workspace.StrategyMock as Program<StrategyMock>;
    const bentobox_program = anchor.workspace.Bentobox as Program<Bentobox>;

    const strategy_mock_idl = require("../../../target/idl/strategy_mock.json");

    let mint: Token = null;
    const bentoboxOwner = Keypair.generate();
    const strategy_mock_owner = Keypair.generate();
    const strategy_mock = Keypair.generate();
    const base_strategy_info = Keypair.generate();
    const bentobox = Keypair.generate();
    const result = Keypair.generate();
    const pool_owner = Keypair.generate();

    let bentobox_authority_pda: PublicKey = null;
    let strategy_mock_vault: PublicKey = null;
    let pool_vault: PublicKey = null;
    let strategy_mock_authority: PublicKey = null;

    before(async () => {
        await requestAirdrop(
            connection,
            LAMPORTS_PER_SOL * 10,
            strategy_mock_owner
        );

        await requestAirdrop(
            connection,
            LAMPORTS_PER_SOL * 10,
            bentoboxOwner
        );

        await bentobox_program.rpc.create({
            accounts: {
                bentoboxAccount: bentobox.publicKey,
                authority: bentoboxOwner.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [bentoboxOwner, bentobox],
        });

        mint = await createMintAccount(connection, bentoboxOwner, bentoboxOwner.publicKey, 0);

        const [_strategy_mock_vault, _strategy_mock_vault_nonce] = await getStrategyVaultAddress(
            mint.publicKey,
            strategy_mock.publicKey,
            strategy_mock_program.programId
        );

        const [_strategy_mock_owner_executor_info, _strategy_mock_owner_executor_info_nonce] = await getStrategyExecutorInfoAddress(
            strategy_mock.publicKey,
            strategy_mock_owner.publicKey,
            strategy_mock_program.programId
        );

        let _pool_account = await createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );
        pool_vault = _pool_account

        const [_strategy_mock_authority_pda, _strategy_mock_authority_bump] =
            await getStrategyAddress(strategy_mock.publicKey, strategy_mock_program.programId);

        strategy_mock_authority = _strategy_mock_authority_pda;

        await strategy_mock_program.rpc.initialize({
            accounts: {
                strategyVault: _strategy_mock_vault,
                strategyAccount: strategy_mock.publicKey,
                baseStrategyInfo: base_strategy_info.publicKey,
                mint: mint.publicKey,
                bentoboxAccount: bentobox.publicKey,
                bentoboxProgram: bentobox_program.programId,
                authority: strategy_mock_owner.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                cpiResultAccount: result.publicKey,
                executorInfo: _strategy_mock_owner_executor_info,
                poolVault: pool_vault,
                poolAuthority: pool_owner.publicKey,
                strategyAuthority: strategy_mock_authority
            },
            signers: [strategy_mock_owner, pool_owner, strategy_mock, base_strategy_info, result]
        });

        const [_bentobox_authority_pda, _bentobox_authority_bump] =
            await getBentoBoxAddress(bentobox.publicKey, bentobox_program.programId);

        bentobox_authority_pda = _bentobox_authority_pda;
        strategy_mock_vault = _strategy_mock_vault
    });


    it('after exit!', async () => {
        let args = [];

        //unauthorized after exit
        try {
            await strategy_mock_program.rpc.afterExit("skim", args,
                {
                    accounts: {
                        strategyAccount: strategy_mock.publicKey,
                        baseStrategyInfo: base_strategy_info.publicKey,
                        authority: bentoboxOwner.publicKey,
                        strategyProgram: strategy_mock_program.programId
                    },
                    remainingAccounts: [
                        { pubkey: strategy_mock_program.programId, isWritable: false, isSigner: false },
                        { pubkey: bentobox_program.programId, isWritable: false, isSigner: false },
                        { pubkey: bentobox.publicKey, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_vault, isWritable: true, isSigner: false },
                        { pubkey: strategy_mock.publicKey, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_authority, isWritable: false, isSigner: false },
                        { pubkey: base_strategy_info.publicKey, isWritable: false, isSigner: false },
                        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
                        { pubkey: bentoboxOwner.publicKey, isWritable: true, isSigner: true },
                        { pubkey: pool_vault, isWritable: true, isSigner: false },
                    ],
                    signers: [bentoboxOwner]
                });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UnauthorizedAfterExit");
            let error = await getErrorInfo(strategy_mock_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try InvalidBaseStrategyInfoAccount
        let strategy_mock_2 = Keypair.generate();
        let base_strategy_info_2 = Keypair.generate();
        let result_2 = Keypair.generate();

        const [_strategy_mock_vault_2, _strategy_mock_vault_nonce] = await getStrategyVaultAddress(
            mint.publicKey,
            strategy_mock_2.publicKey,
            strategy_mock_program.programId
        );

        const [_strategy_mock_owner_executor_info_2, _strategy_mock_owner_executor_info_nonce_2] = await getStrategyExecutorInfoAddress(
            strategy_mock_2.publicKey,
            strategy_mock_owner.publicKey,
            strategy_mock_program.programId
        );

        const [_strategy_mock_authority_pda_2, _strategy_mock_authority_bump] =
            await getStrategyAddress(strategy_mock_2.publicKey, strategy_mock_program.programId);

        let pool_vault_2 = await createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );

        await strategy_mock_program.rpc.initialize({
            accounts: {
                strategyVault: _strategy_mock_vault_2,
                strategyAccount: strategy_mock_2.publicKey,
                baseStrategyInfo: base_strategy_info_2.publicKey,
                mint: mint.publicKey,
                bentoboxAccount: bentobox.publicKey,
                bentoboxProgram: bentobox_program.programId,
                authority: strategy_mock_owner.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                cpiResultAccount: result_2.publicKey,
                executorInfo: _strategy_mock_owner_executor_info_2,
                poolVault: pool_vault_2,
                poolAuthority: pool_owner.publicKey,
                strategyAuthority: _strategy_mock_authority_pda_2
            },
            signers: [strategy_mock_owner, pool_owner, strategy_mock_2, base_strategy_info_2, result_2]
        });

        try {
            await strategy_mock_program.rpc.afterExit("skim", args,
                {
                    accounts: {
                        strategyAccount: strategy_mock.publicKey,
                        baseStrategyInfo: base_strategy_info_2.publicKey,
                        authority: strategy_mock_owner.publicKey,
                        strategyProgram: strategy_mock_program.programId
                    },
                    remainingAccounts: [
                        { pubkey: strategy_mock_program.programId, isWritable: false, isSigner: false },
                        { pubkey: bentobox_program.programId, isWritable: false, isSigner: false },
                        { pubkey: bentobox.publicKey, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_vault, isWritable: true, isSigner: false },
                        { pubkey: strategy_mock.publicKey, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_authority, isWritable: false, isSigner: false },
                        { pubkey: base_strategy_info.publicKey, isWritable: false, isSigner: false },
                        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_owner.publicKey, isWritable: true, isSigner: true },
                        { pubkey: pool_vault_2, isWritable: true, isSigner: false },

                    ],
                    signers: [strategy_mock_owner]
                });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidBaseStrategyInfoAccount");
            let error = await getErrorInfo(strategy_mock_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        //try BentoBox Strategy: not exited
        try {
            await strategy_mock_program.rpc.afterExit("skim", args,
                {
                    accounts: {
                        strategyAccount: strategy_mock.publicKey,
                        baseStrategyInfo: base_strategy_info.publicKey,
                        authority: strategy_mock_owner.publicKey,
                        strategyProgram: strategy_mock_program.programId
                    },
                    remainingAccounts: [
                        { pubkey: strategy_mock_program.programId, isWritable: false, isSigner: false },
                        { pubkey: bentobox_program.programId, isWritable: false, isSigner: false },
                        { pubkey: bentobox.publicKey, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_vault, isWritable: true, isSigner: false },
                        { pubkey: strategy_mock.publicKey, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_authority, isWritable: false, isSigner: false },
                        { pubkey: base_strategy_info.publicKey, isWritable: false, isSigner: false },
                        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
                        { pubkey: strategy_mock_owner.publicKey, isWritable: true, isSigner: true },
                        { pubkey: pool_vault, isWritable: true, isSigner: false },
                    ],
                    signers: [strategy_mock_owner]
                });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "StrategyNotExited");
            let error = await getErrorInfo(strategy_mock_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // set exited to true, need to prepare accounts
        // create strategy data    
        const [_strategy_data_key, _strategy_data_nonce] = await getBentoboxStrategyDataAddress(
            bentobox.publicKey,
            mint.publicKey,
            bentobox_program.programId
        );

        await bentobox_program.rpc.createStrategyData({
            accounts: {
                strategyData: _strategy_data_key,
                authority: bentoboxOwner.publicKey,
                mint: mint.publicKey,
                bentoboxAccount: bentobox.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [bentoboxOwner],
        });

        const [_total_key, _total_nonce] = await getBentoboxTotalAddress(
            mint.publicKey,
            bentobox.publicKey,
            bentobox_program.programId
        );

        const [_total_vault_key, _total_vault_nonce] =
            await getBentoboxTotalVaultAddress(
                mint.publicKey,
                bentobox.publicKey,
                bentobox_program.programId
            );

        await bentobox_program.rpc.createVault({
            accounts: {
                totalData: _total_key,
                bentoboxVault: _total_vault_key,
                authority: bentoboxOwner.publicKey,
                mint: mint.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxAccount: bentobox.publicKey,
            },
            signers: [bentoboxOwner],
        });

        let someVault = await createAndFundUserAccount(
            strategy_mock_owner.publicKey,
            bentoboxOwner,
            mint,
            2000
        );

        // set exited = true  
        await bentobox_program.rpc.setStrategy({
            accounts: {
                strategyProgram: strategy_mock_program.programId,
                bentoboxProgram: bentobox_program.programId,
                bentoboxAccount: bentobox.publicKey,
                strategyAccount: strategy_mock.publicKey,
                strategyData: _strategy_data_key,
                bentoboxVault: _total_vault_key,
                strategyVault: strategy_mock_vault,
                totalData: _total_key,
                tokenProgram: TOKEN_PROGRAM_ID,
                baseStrategyInfo: base_strategy_info.publicKey,
                bentoboxAuthority: bentobox_authority_pda,
                authority: bentoboxOwner.publicKey,
                strategyAuthority: strategy_mock_authority,
                systemProgram: SystemProgram.programId,
            },
            remainingAccounts: [
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ],
            signers: [bentoboxOwner]
        });

        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(2000);

        await bentobox_program.rpc.setStrategy({
            accounts: {
                strategyProgram: strategy_mock_program.programId,
                bentoboxProgram: bentobox_program.programId,
                bentoboxAccount: bentobox.publicKey,
                strategyAccount: strategy_mock.publicKey,
                strategyData: _strategy_data_key,
                bentoboxVault: _total_vault_key,
                strategyVault: strategy_mock_vault,
                totalData: _total_key,
                tokenProgram: TOKEN_PROGRAM_ID,
                baseStrategyInfo: base_strategy_info.publicKey,
                bentoboxAuthority: bentobox_authority_pda,
                authority: bentoboxOwner.publicKey,
                strategyAuthority: strategy_mock_authority,
                systemProgram: SystemProgram.programId,
            },
            remainingAccounts: [
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ],
            signers: [bentoboxOwner]
        });

        await bentobox_program.rpc.setStrategy({
            accounts: {
                strategyProgram: strategy_mock_program.programId,
                bentoboxProgram: bentobox_program.programId,
                bentoboxAccount: bentobox.publicKey,
                strategyAccount: strategy_mock.publicKey,
                strategyData: _strategy_data_key,
                bentoboxVault: _total_vault_key,
                strategyVault: strategy_mock_vault,
                totalData: _total_key,
                tokenProgram: TOKEN_PROGRAM_ID,
                baseStrategyInfo: base_strategy_info.publicKey,
                bentoboxAuthority: bentobox_authority_pda,
                authority: bentoboxOwner.publicKey,
                strategyAuthority: strategy_mock_authority,
                systemProgram: SystemProgram.programId,
            },
            remainingAccounts: [
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ],
            signers: [bentoboxOwner]
        });

        delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(2000);

        await bentobox_program.rpc.setStrategy({
            accounts: {
                strategyProgram: strategy_mock_program.programId,
                bentoboxProgram: bentobox_program.programId,
                bentoboxAccount: bentobox.publicKey,
                strategyAccount: strategy_mock.publicKey,
                strategyData: _strategy_data_key,
                bentoboxVault: _total_vault_key,
                strategyVault: strategy_mock_vault,
                totalData: _total_key,
                tokenProgram: TOKEN_PROGRAM_ID,
                baseStrategyInfo: base_strategy_info.publicKey,
                bentoboxAuthority: bentobox_authority_pda,
                authority: bentoboxOwner.publicKey,
                strategyAuthority: strategy_mock_authority,
                systemProgram: SystemProgram.programId,
            },
            remainingAccounts: [
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ],
            signers: [bentoboxOwner]
        });
        // End: set exited = true  

        await mint.transfer(someVault, strategy_mock_vault, strategy_mock_owner, [strategy_mock_owner], 1000)
        let amount = [100, 0, 0, 0, 0, 0, 0, 0]; //100 in bytes
        args = [Buffer.from(amount)]
        await strategy_mock_program.rpc.afterExit("skim",
            args, {
            accounts: {
                strategyAccount: strategy_mock.publicKey,
                baseStrategyInfo: base_strategy_info.publicKey,
                authority: strategy_mock_owner.publicKey,
                strategyProgram: strategy_mock_program.programId
            },
            remainingAccounts: [
                { pubkey: strategy_mock_program.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox_program.programId, isWritable: false, isSigner: false },
                { pubkey: bentobox.publicKey, isWritable: false, isSigner: false },
                { pubkey: strategy_mock_vault, isWritable: true, isSigner: false },
                { pubkey: strategy_mock.publicKey, isWritable: false, isSigner: false },
                { pubkey: strategy_mock_authority, isWritable: true, isSigner: false },
                { pubkey: base_strategy_info.publicKey, isWritable: false, isSigner: false },
                { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
                { pubkey: bentoboxOwner.publicKey, isWritable: true, isSigner: true },
                { pubkey: pool_vault, isWritable: true, isSigner: false },
            ],
            signers: [strategy_mock_owner, bentoboxOwner]
        });

        let strategy_vault_acc = await mint.getAccountInfo(strategy_mock_vault);
        assert.ok(strategy_vault_acc.amount.toString() == "900");
        let pool_vault_acc = await mint.getAccountInfo(pool_vault);
        assert.ok(pool_vault_acc.amount.toString() == "100");

        //try empty remaining accounts
        try {
            await strategy_mock_program.rpc.afterExit("skim",
                args, {
                accounts: {
                    strategyAccount: strategy_mock.publicKey,
                    baseStrategyInfo: base_strategy_info.publicKey,
                    authority: strategy_mock_owner.publicKey,
                    strategyProgram: strategy_mock_program.programId
                },
                signers: [strategy_mock_owner],
                remainingAccounts: []
            });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorMessage, "After exit: accounts list for after exit is empty.");
            assert.strictEqual(err.error.errorCode.number, 6000);
        }
    });
});