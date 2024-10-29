import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StrategyMock as StrategyMockProgram } from "../../target/types/strategy_mock";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { getStrategyExecutorInfoAddress, getStrategyAddress, getStrategyVaultAddress } from "./mock_strategy_pda_helper";

export class StrategyMock {
    strategyMockProgram: anchor.Program<StrategyMockProgram>

    strategyMockAccount: Keypair
    strategyOwner: Keypair
    strategyMockAuthorityPda: PublicKey

    totalVaultPdas: Map<String, PublicKey>; // mint -> pda
    strategyMockExecutorInfoPda: Map<String, PublicKey>; // user -> pda

    poolVault: PublicKey
    cpiResultAccount: Keypair
    baseStrategyInfo: Keypair

    constructor() {
        this.strategyMockProgram = anchor.workspace.StrategyMock as Program<StrategyMockProgram>;
        this.strategyMockAccount = Keypair.generate();
        this.cpiResultAccount = Keypair.generate();
        this.baseStrategyInfo = Keypair.generate();
        this.totalVaultPdas = new Map<String, PublicKey>();
        this.strategyMockExecutorInfoPda = new Map<String, PublicKey>();
    }

    getStrategyMockProgram() {
        return this.strategyMockProgram.programId
    }

    getStrategyMockAccount() {
        let result = this.strategyMockAccount.publicKey
        if (result) {
            return result
        }
        else {
            throw new Error(`StrategyMock account is not initialized`);
        }
    }

    getStrategyMockAuthority() {
        let result = this.strategyMockAuthorityPda
        if (result) {
            return result
        }
        else {
            throw new Error(`StrategyMockAuthority is not created`);
        }
    }

    getTotalVaultPda(mint: PublicKey) {
        let result = this.totalVaultPdas[mint.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Total vault for token ${mint} is not created`);
        }
    }

    getBaseStrategyInfoAccount() {
        let result = this.baseStrategyInfo.publicKey
        if (result) {
            return result
        }
        else {
            throw new Error(`BaseStrategyInfo is not created`);
        }
    }

    getCpiResultAccount() {
        let result = this.cpiResultAccount.publicKey
        if (result) {
            return result
        }
        else {
            throw new Error(`CpiResultAccount is not created`);
        }
    }

    getStrategyMockExecutorInfoPda(user: PublicKey) {
        let result = this.strategyMockExecutorInfoPda[user.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Executor info account for user ${user} is not created`);
        }
    }

    async initialize(mint: PublicKey, bentoboxAccount: PublicKey, bentoboxProgram: PublicKey, poolVault: PublicKey, poolOwner: Keypair, strategyOwner: Keypair) {
        this.strategyOwner = strategyOwner;

        const [_strategy_mock_vault, _strategy_mock_vault_nonce] = await getStrategyVaultAddress(
            mint,
            this.strategyMockAccount.publicKey,
            this.strategyMockProgram.programId
        );
        this.totalVaultPdas[mint.toBase58()] = _strategy_mock_vault;

        const [_strategy_mock_authority_pda, _strategy_mock_authority_bump] =
            await getStrategyAddress(this.strategyMockAccount.publicKey, this.strategyMockProgram.programId);

        this.strategyMockAuthorityPda = _strategy_mock_authority_pda;

        const [_strategy_mock_owner_executor_info, _strategy_mock_owner_executor_info_nonce] = await getStrategyExecutorInfoAddress(
            this.strategyMockAccount.publicKey,
            this.strategyOwner.publicKey,
            this.strategyMockProgram.programId
        );

        this.strategyMockExecutorInfoPda[this.strategyOwner.publicKey.toBase58()] = _strategy_mock_owner_executor_info

        await this.strategyMockProgram.methods.initialize()
            .accounts({
                strategyVault: _strategy_mock_vault,
                strategyAccount: this.strategyMockAccount.publicKey,
                baseStrategyInfo: this.baseStrategyInfo.publicKey,
                mint,
                bentoboxAccount,
                bentoboxProgram,
                authority: strategyOwner.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                cpiResultAccount: this.cpiResultAccount.publicKey,
                executorInfo: this.getStrategyMockExecutorInfoPda(strategyOwner.publicKey),
                poolVault,
                poolAuthority: poolOwner.publicKey,
                strategyAuthority: _strategy_mock_authority_pda
            })
            .signers([strategyOwner, poolOwner, this.strategyMockAccount, this.baseStrategyInfo, this.cpiResultAccount])
            .rpc();
    }

    async setStrategyExecutor(executor: PublicKey, value: boolean) {
        const [_executor_info, executor_info_nonce] = await getStrategyExecutorInfoAddress(
            this.strategyMockAccount.publicKey,
            executor,
            this.strategyMockProgram.programId
        );

        await this.strategyMockProgram.methods.setStrategyExecutor(executor, value)
            .accounts({
                strategyAccount: this.strategyMockAccount.publicKey,
                executorInfo: _executor_info,
                authority: this.strategyOwner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([this.strategyOwner])
    }
}