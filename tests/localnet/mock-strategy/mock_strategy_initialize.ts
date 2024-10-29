import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";

import { Bentobox } from '../../../target/types/bentobox';;
import { StrategyMock } from "../../../target/types/strategy_mock";

import {
    createMintAccount, requestAirdrop, createAndFundUserAccount
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

    let mint: Token = null;
    const bentoboxOwner = Keypair.generate();
    const strategy_mock_owner = Keypair.generate();
    const strategy_mock = Keypair.generate();
    const base_strategy_info = Keypair.generate();
    const bentobox = Keypair.generate();
    const result = Keypair.generate();
    const pool_owner = Keypair.generate();

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
    });

    it('initialize!', async () => {
        const [_strategy_mock_authority_pda, _strategy_mock_authority_bump] =
            await getStrategyAddress(strategy_mock.publicKey, strategy_mock_program.programId);

        strategy_mock_authority = _strategy_mock_authority_pda;

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

        let pool_vault = await createAndFundUserAccount(
            pool_owner.publicKey,
            bentoboxOwner,
            mint,
            0
        );

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

        let vault_strategy_acc = await mint.getAccountInfo(_strategy_mock_vault);
        assert.ok(vault_strategy_acc.owner.equals(strategy_mock_authority));

        const st_mock = await strategy_mock_program.account.strategyMock.fetch(strategy_mock.publicKey);
        assert.ok(st_mock.authority.equals(strategy_mock_owner.publicKey));

        assert.ok(st_mock.bentoboxAccount.equals(bentobox.publicKey));

        assert.ok(st_mock.bentoboxProgram.equals(bentobox_program.programId));

        const baseStrategyInfo = await strategy_mock_program.account.baseStrategyInfo.fetch(base_strategy_info.publicKey);
        assert.ok(baseStrategyInfo.strategyToken.equals(mint.publicKey));

        const payer_executor_info = await strategy_mock_program.account.executorInfo.fetch(_strategy_mock_owner_executor_info);
        assert(payer_executor_info.isExecutor == true);
    });
});