import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../target/types/bentobox";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MINIMUM_SHARE_BALANCE, MAX_TARGET_PERCENTAGE } from "./src/constants";
import { getBentoboxBalanceAddress, getBentoboxTotalAddress, getMasterContractWhitelistAddress, getMasterContractApprovedAddress, getBentoboxTotalVaultAddress, getBentoboxStrategyDataAddress, getBentoBoxAddress } from "./bentobox_pda_helper";
export class Bentobox {
    bentoboxProgram: anchor.Program<BentoboxProgram>

    bentoboxAccount: Keypair
    bentoboxOwner: Keypair
    bentoboxAuthorityPda: PublicKey

    totalDataPdas: Map<String, PublicKey>; // mint -> pda
    totalVaultPdas: Map<String, PublicKey>; // mint -> pda
    balancePdas: Map<String, PublicKey>; // user + mint -> pda
    masterContractWhitelistedPdas: Map<String, PublicKey>; // master contract -> whitelisted pda
    masterContractApprovedPdas: Map<String, PublicKey>; // (user + master contract) -> master contract approved pda pda
    strategyDataPdas: Map<String, PublicKey>; // mint -> pda 
    approvedBentoboxPda: PublicKey
    bentoboxAuthorityBump: number

    constructor() {
        this.bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
        this.bentoboxAccount = Keypair.generate();
        this.balancePdas = new Map<String, PublicKey>();
        this.totalDataPdas = new Map<String, PublicKey>();
        this.totalVaultPdas = new Map<String, PublicKey>();
        this.masterContractWhitelistedPdas = new Map<String, PublicKey>();
        this.masterContractApprovedPdas = new Map<String, PublicKey>();
        this.strategyDataPdas = new Map<String, PublicKey>();
    }

    getBentoboxProgram() {
        return this.bentoboxProgram.programId
    }

    getBentoboxAccount() {
        let result = this.bentoboxAccount.publicKey
        if (result) {
            return result
        }
        else {
            throw new Error(`Bentobox account is not initialized`);
        }
    }

    getBentoboxAuthorityBump() {
        let result = this.bentoboxAuthorityBump
        if (result) {
            return result
        }
        else {
            throw new Error(`BentoboxAuthorityBump is not created`);
        }
    }

    getBentoboxAuthority() {
        let result = this.bentoboxAuthorityPda
        if (result) {
            return result
        }
        else {
            throw new Error(`BentoboxAuthority is not created`);
        }
    }

    getTotalDataPda(mint: PublicKey) {
        let result = this.totalDataPdas[mint.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Total data for token ${mint} is not created`);
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

    getBalancePda(user: PublicKey, mint: PublicKey) {
        let result = this.balancePdas[user.toBase58() + mint.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Balance account for user ${user} is not created`);
        }
    }

    getMasterContractWhitelistedPda(masterContract: PublicKey) {
        let result = this.masterContractWhitelistedPdas[masterContract.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Master contract ${masterContract} is not whitelisted for bentobox`);
        }
    }

    getMasterContractApprovedPda(user: PublicKey, masterContract: PublicKey) {
        let result = this.masterContractApprovedPdas[user.toBase58() + masterContract.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Master contract approved account for user ${user} to masterContract ${masterContract} is not created`);
        }
    }

    getStrategyDataPda(mint: PublicKey) {
        let result = this.strategyDataPdas[mint.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Strategy data account for token ${mint} is not created`);
        }
    }

    getApprovedBentoboxPda() {
        let result = this.approvedBentoboxPda
        if (result) {
            return result
        }
        else {
            throw new Error(`Approved_bentobox account is not created`);
        }
    }

    async create(bentoboxOwner: Keypair) {
        this.bentoboxOwner = bentoboxOwner;

        await this.bentoboxProgram.methods.create(MINIMUM_SHARE_BALANCE, MAX_TARGET_PERCENTAGE)
            .accounts({
                bentoboxAccount: this.bentoboxAccount.publicKey,
                authority: bentoboxOwner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([bentoboxOwner, this.bentoboxAccount])
            .rpc();


        const [_bentobox_authority_pda, _bentobox_authority_bump] =
            await getBentoBoxAddress(this.bentoboxAccount.publicKey, this.bentoboxProgram.programId);
        this.bentoboxAuthorityPda = _bentobox_authority_pda;
        this.bentoboxAuthorityBump = _bentobox_authority_bump
    }

    async createVault(mint: PublicKey, signer: Keypair) {
        const [_bentoboxTotalDataAddress, _bentoboxTotaDataNonce] = await getBentoboxTotalAddress(
            mint,
            this.bentoboxAccount.publicKey,
            this.bentoboxProgram.programId
        );
        const [_bentoboxTotalVaultAddress, _bentoboxTotalVaultNonce] =
            await getBentoboxTotalVaultAddress(
                mint,
                this.bentoboxAccount.publicKey,
                this.bentoboxProgram.programId
            );

        this.totalDataPdas[mint.toBase58()] = _bentoboxTotalDataAddress;
        this.totalVaultPdas[mint.toBase58()] = _bentoboxTotalVaultAddress;

        await this.bentoboxProgram.methods.createVault()
            .accounts({
                totalData: _bentoboxTotalDataAddress,
                bentoboxVault: _bentoboxTotalVaultAddress,
                authority: signer.publicKey,
                mint,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxAccount: this.bentoboxAccount.publicKey,
            })
            .signers([signer])
            .rpc();
    }

    async createBalance(user: PublicKey, mint: PublicKey, signer: Keypair) {
        const [_userBentoboxBalance, _userBentoboxBalanceNonce] = await getBentoboxBalanceAddress(
            user,
            mint,
            this.bentoboxAccount.publicKey,
            this.bentoboxProgram.programId
        );
        this.balancePdas[user.toBase58() + mint.toBase58()] = _userBentoboxBalance;
        
        await this.bentoboxProgram.methods.createBalance(user)
            .accounts({
                balance: _userBentoboxBalance,
                bentoboxAccount: this.bentoboxAccount.publicKey,
                authority: signer.publicKey,
                mint,
                systemProgram: SystemProgram.programId,
            })
            .signers([signer])
            .rpc();
    }

    async createMasterContractWhitelist(masterContractAccount: PublicKey, masterContractProgram: PublicKey) {
        const [whitelistSeed, _whitelistBump] = await getMasterContractWhitelistAddress(masterContractAccount, this.bentoboxAccount.publicKey, this.bentoboxProgram.programId);

        this.masterContractWhitelistedPdas[masterContractAccount.toBase58()] = whitelistSeed;

        await this.bentoboxProgram.methods.createMasterContractWhitelist(true)
            .accounts({
                masterContractWhitelisted: whitelistSeed,
                masterContractProgram: masterContractProgram,
                masterContractAccount: masterContractAccount,
                bentoboxAccount: this.bentoboxAccount.publicKey,
                authority: this.bentoboxOwner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([this.bentoboxOwner])
            .rpc();

    }

    async createMasterContractApproval(user: Keypair, masterContractAccount: PublicKey, masterContractProgram: PublicKey) {
        const [approvedSeed, _approvedBump] = await getMasterContractApprovedAddress(masterContractAccount, user.publicKey, this.bentoboxAccount.publicKey, this.bentoboxProgram.programId);
        this.masterContractApprovedPdas[user.publicKey.toBase58() + masterContractAccount.toBase58()] = approvedSeed;

        await this.bentoboxProgram.methods.createMasterContractApproval(true)
            .accounts({
                masterContractApproved: approvedSeed,
                masterContractWhitelisted: this.masterContractWhitelistedPdas[masterContractAccount.toBase58()],
                masterContractProgram: masterContractProgram,
                masterContractAccount: masterContractAccount,
                bentoboxAccount: this.bentoboxAccount.publicKey,
                systemProgram: SystemProgram.programId,
                authority: user.publicKey,
            }).signers([user])
            .rpc();
    }

    async createStrategyData(mint: PublicKey) {
        const [strategyDataAddress, _strategyDataNonce] = await getBentoboxStrategyDataAddress(
            this.bentoboxAccount.publicKey,
            mint,
            this.bentoboxProgram.programId
        );
        this.strategyDataPdas[mint.toBase58()] = strategyDataAddress

        await this.bentoboxProgram.methods.createStrategyData()
            .accounts({
                strategyData: strategyDataAddress,
                authority: this.bentoboxOwner.publicKey,
                mint,
                bentoboxAccount: this.bentoboxAccount.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([this.bentoboxOwner])
            .rpc();
    }

    async deposit(mint: PublicKey, from: PublicKey, to: PublicKey, amount: BN, share: BN, signer: Keypair) {
        await this.bentoboxProgram.methods.deposit(to, amount, share)
            .accounts({
                from,
                bentoboxVault: this.getTotalVaultPda(mint),
                balance: this.getBalancePda(to, mint),
                authority: signer.publicKey,
                totalData: this.getTotalDataPda(mint),
                bentoboxAccount: this.bentoboxAccount.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                mint,
                strategyData: this.getStrategyDataPda(mint),
            })
            .signers([signer])
            .rpc();
    }

    async withdraw(mint: PublicKey, from: PublicKey, to: PublicKey, amount: BN, share: BN, signer: Keypair) {
        await this.bentoboxProgram.methods.withdraw(from, amount, share)
            .accounts({
                bentoboxVault: this.getTotalVaultPda(mint),
                to,
                balance: this.getBalancePda(from, mint),
                totalData: this.getTotalDataPda(mint),
                authority: signer.publicKey,
                bentoboxAccount: this.bentoboxAccount.publicKey,
                vaultAuthority: this.getBentoboxAuthority(),
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([signer])
            .rpc();

    }

    async createBentoboxAuthorityMasterContractApproval(masterContractAccount: PublicKey, masterContractProgram: PublicKey, signer: Keypair) {
        const [approvedSeed, _approvedBump] = await getMasterContractApprovedAddress(masterContractAccount, this.bentoboxAuthorityPda, this.bentoboxAccount.publicKey, this.bentoboxProgram.programId);

        this.approvedBentoboxPda = approvedSeed

        await this.bentoboxProgram.methods.createBentoboxAuthorityMasterContractApproval(true)
            .accounts({
                masterContractApproved: approvedSeed,
                masterContractWhitelisted: this.getMasterContractWhitelistedPda(masterContractAccount),
                masterContractProgram,
                masterContractAccount,
                bentoboxAccount: this.bentoboxAccount.publicKey,
                systemProgram: SystemProgram.programId,
                bentoboxAuthority: this.bentoboxAuthorityPda,
                authority: signer.publicKey
            })
            .signers([signer])
            .rpc();

    }

    async setStrategyTargetPercentage(percentage: BN, mint: PublicKey) {
        await this.bentoboxProgram.methods.setStrategyTargetPercentage(percentage)
            .accounts({
                strategyData: this.getStrategyDataPda(mint),
                bentoboxAccount: this.bentoboxAccount.publicKey,
                mint,
                authority: this.bentoboxOwner.publicKey,

            })
            .signers([this.bentoboxOwner])
            .rpc();

    }

    async setStrategyDelay(amount: BN) {
        await this.bentoboxProgram.methods.setStrategyDelay(amount)
            .accounts({
                bentoboxAccount: this.bentoboxAccount.publicKey,
                authority: this.bentoboxOwner.publicKey,
                systemProgram: SystemProgram.programId,
            }).signers([this.bentoboxOwner]).rpc()

    }


}