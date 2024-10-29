import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, AnchorError } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";

import { Bentobox } from '../../../target/types/bentobox';;
import { StrategyMock } from "../../../target/types/strategy_mock";

import {
    createMintAccount, getErrorInfo, requestAirdrop, createAndFundUserAccount
} from "../../common/common";

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
    const random = Keypair.generate();
    const pool_owner = Keypair.generate();

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

        await requestAirdrop(
            connection,
            LAMPORTS_PER_SOL * 10,
            random
        );

        await bentobox_program.rpc.create({
            accounts: {
                bentoboxAccount: bentobox.publicKey,
                authority: bentoboxOwner.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [bentoboxOwner, bentobox],
        });
    });

    it('set strategy executor!', async () => {
        mint = await createMintAccount(connection, bentoboxOwner, bentoboxOwner.publicKey, 0);

        const executor_alice = Keypair.generate();
        const executor_bob = Keypair.generate();

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

        let pool_vault = await createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );
        const [strategy_mock_authority, _strategy_mock_authority_bump] =
            await getStrategyAddress(strategy_mock.publicKey, strategy_mock_program.programId);


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

        // try set executor alice signed by random wallet
        const [_alice_executor_info, _alice_executor_info_nonce] = await getStrategyExecutorInfoAddress(
            strategy_mock.publicKey,
            executor_alice.publicKey,
            strategy_mock_program.programId
        );

        const [_bob_executor_info, _bob_executor_info_nonce] = await getStrategyExecutorInfoAddress(
            strategy_mock.publicKey,
            executor_bob.publicKey,
            strategy_mock_program.programId
        );

        try {
            await strategy_mock_program.rpc.setStrategyExecutor(executor_alice.publicKey, true, {
                accounts: {
                    strategyAccount: strategy_mock.publicKey,
                    executorInfo: _alice_executor_info,
                    authority: random.publicKey,
                    systemProgram: SystemProgram.programId,
                },
                signers: [random]
            });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "UnauthorizedSetStrategyExecutor");
            let error = await getErrorInfo(strategy_mock_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // set new executors - alice and bob
        await strategy_mock_program.rpc.setStrategyExecutor(executor_alice.publicKey, true, {
            accounts: {
                strategyAccount: strategy_mock.publicKey,
                executorInfo: _alice_executor_info,
                authority: strategy_mock_owner.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [strategy_mock_owner]
        });

        await strategy_mock_program.rpc.setStrategyExecutor(executor_bob.publicKey, true, {
            accounts: {
                strategyAccount: strategy_mock.publicKey,
                executorInfo: _bob_executor_info,
                authority: strategy_mock_owner.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [strategy_mock_owner]
        });

        let alice_executor_info = await strategy_mock_program.account.executorInfo.fetch(_alice_executor_info);
        assert(alice_executor_info.isExecutor == true);

        let bob_executor_info = await strategy_mock_program.account.executorInfo.fetch(_bob_executor_info);
        assert(bob_executor_info.isExecutor == true);

        // remove alice from executors
        await strategy_mock_program.rpc.setStrategyExecutor(executor_alice.publicKey, false, {
            accounts: {
                strategyAccount: strategy_mock.publicKey,
                executorInfo: _alice_executor_info,
                authority: strategy_mock_owner.publicKey,
                systemProgram: SystemProgram.programId,
            },
            signers: [strategy_mock_owner]
        });

        alice_executor_info = await strategy_mock_program.account.executorInfo.fetch(_alice_executor_info);
        assert(alice_executor_info.isExecutor == false);
    });
});