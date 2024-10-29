import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../target/types/cauldron";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import { getCauldronUserBalanceAddress, getCauldronAuthorityAddress, getCauldronLiquidatorAccountAddress, getCauldronTotalAddress, getCauldronVaultAddress } from "./cauldron_pda_helper";
import { getMasterContractApprovedAddress } from "./bentobox_pda_helper";

import { INTEREST_PER_SECOND, DISTRIBUTION_PART, DISTRIBUTION_PRECISION, LIQUIDATION_MULTIPLIER, LIQUIDATION_MULTIPLIER_PRECISION, BORROW_OPENING_FEE, BORROW_OPENING_FEE_PRECISION, COLLATERIZATION_RATE, COMPLETE_LIQUIDATION_DURATION, ONE_PERCENT_RATE } from "./src/constants";
import { Bentobox } from "./bentobox";
export class Cauldron {
    cauldronProgram: anchor.Program<CauldronProgram>

    cauldronAccount: Keypair
    cauldronOwner: Keypair

    magicInternetMoney: PublicKey
    collateral: PublicKey
    bentoboxAccount: PublicKey
    switchboardDataFeed: PublicKey

    totalDataPda: PublicKey
    totalVaultPda: Map<String, PublicKey>; // mint -> pda
    cauldronAuthorityPda: PublicKey
    cauldronAuthorityApprovalPda: PublicKey

    userBalancePdas: Map<String, PublicKey>;
    liquidatorAccountPdas: Map<String, PublicKey>;

    constructor() {
        this.cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;
        this.cauldronAccount = Keypair.generate();
        this.userBalancePdas = new Map<String, PublicKey>();
        this.totalVaultPda = new Map<String, PublicKey>();
        this.liquidatorAccountPdas = new Map<String, PublicKey>();
    }

    getCauldronProgram() {
        return this.cauldronProgram.programId
    }

    getCauldronAccount() {
        return this.cauldronAccount.publicKey
    }

    getCauldronAuthority() {
        let result = this.cauldronAuthorityPda
        if (result) {
            return result
        }
        else {
            throw new Error(`Cauldron authority account is not created`);
        }
    }

    getTotalDataPda() {
        let result = this.totalDataPda
        if (result) {
            return result
        }
        else {
            throw new Error(`Total data is not created`);
        }
    }

    getTotalVaultPda(mint: PublicKey) {
        let result = this.totalVaultPda[mint.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Total vault for mint ${mint} is not created`);
        }
    }

    getUserBalancePda(user: PublicKey) {
        let result = this.userBalancePdas[user.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`User balance account for user ${user} is not created`);
        }
    }

    getLiquidatorAccountPda(liquidator: PublicKey) {
        let result = this.liquidatorAccountPdas[liquidator.toBase58()]
        if (result) {
            return result
        }
        else {
            throw new Error(`Liquidator account for liquidator ${liquidator} is not created`);
        }
    }

    getCauldronAuthorityApprovedPda() {
        let result = this.cauldronAuthorityApprovalPda
        if (result) {
            return result
        }
        else {
            throw new Error(`Cauldron_authority approved pda is not created`);
        }
    }

    async initialize(
        cauldronOwner: Keypair,
        magicInternetMoney: PublicKey,
        collateral: PublicKey,
        switchboardDataFeed: PublicKey,
        bentoboxAccount: PublicKey,
        collaterization_rate_precision: BN,
        stale_after_slots_elapsed: BN) {

        this.cauldronOwner = cauldronOwner;
        this.magicInternetMoney = magicInternetMoney
        this.collateral = collateral
        this.bentoboxAccount = bentoboxAccount
        this.switchboardDataFeed = switchboardDataFeed

        await this.cauldronProgram.methods.initialize(INTEREST_PER_SECOND, COLLATERIZATION_RATE, collaterization_rate_precision, LIQUIDATION_MULTIPLIER, LIQUIDATION_MULTIPLIER_PRECISION, DISTRIBUTION_PART, DISTRIBUTION_PRECISION, stale_after_slots_elapsed, cauldronOwner.publicKey, BORROW_OPENING_FEE, BORROW_OPENING_FEE_PRECISION, ONE_PERCENT_RATE, COMPLETE_LIQUIDATION_DURATION)
            .accounts({
                cauldronAccount: this.cauldronAccount.publicKey,
                magicInternetMoney,
                collateral,
                switchboardDataFeed,
                bentoboxAccount,
                authority: cauldronOwner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([cauldronOwner, this.cauldronAccount])
            .rpc();

        const [_cauldronAuthorityAddress, _cauldronAuthorityNonce] =
            await getCauldronAuthorityAddress(this.cauldronAccount.publicKey, this.cauldronProgram.programId);
        this.cauldronAuthorityPda = _cauldronAuthorityAddress;
    }

    async createVault(mint: PublicKey, signer: Keypair) {
        const [_total_vault_key, _total_vault_nonce] =
            await getCauldronVaultAddress(
                mint,
                this.cauldronAccount.publicKey,
                this.cauldronProgram.programId
            );

        this.totalVaultPda[mint.toBase58()] = _total_vault_key

        await this.cauldronProgram.methods.createVault()
            .accounts({
                cauldronVault: _total_vault_key,
                mint,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAccount: this.cauldronAccount.publicKey,
                authority: signer.publicKey,
            })
            .signers([signer])
            .rpc();
    }

    async createTotal(signer: Keypair) {
        const [_total_key, _total_nonce] = await getCauldronTotalAddress(
            this.cauldronAccount.publicKey,
            this.cauldronProgram.programId
        );

        this.totalDataPda = _total_key

        await this.cauldronProgram.methods.createTotal()
            .accounts({
                totalData: this.totalDataPda,
                systemProgram: SystemProgram.programId,
                cauldronAccount: this.cauldronAccount.publicKey,
                authority: signer.publicKey,
            })
            .signers([signer])
            .rpc();
    }

    async createUserBalance(user: PublicKey, signer: Keypair) {
        const [_cauldronUserBalance, _cauldronUserBalanceNonce] = await getCauldronUserBalanceAddress(
            user,
            this.cauldronAccount.publicKey,
            this.cauldronProgram.programId
        );
        this.userBalancePdas[user.toBase58()] = _cauldronUserBalance;

        await this.cauldronProgram.methods.createUserBalance(user)
            .accounts({
                userBalance: _cauldronUserBalance,
                cauldronAccount: this.cauldronAccount.publicKey,
                authority: signer.publicKey,
                systemProgram: SystemProgram.programId,

            })
            .signers([signer])
            .rpc();
    }

    async borrow(to: PublicKey, amount: BN, signer: Keypair, cauldronBentoboxBalance: PublicKey, bentoboxTotalData: PublicKey, toBentoboxBalance: PublicKey, bentoboxProgram: PublicKey) {
        await this.cauldronProgram.methods.borrow(to, amount)
            .accounts({
                from: this.cauldronAuthorityPda,
                cauldronBentoboxBalance,
                toBentoboxBalance,
                bentoboxTotalData,
                userBalance: this.getUserBalancePda(signer.publicKey),
                totalData: this.getTotalDataPda(),
                cauldronAccount: this.cauldronAccount.publicKey,
                bentoboxAccount: this.bentoboxAccount,
                bentoboxProgram,
                magicInternetMoneyMint: this.magicInternetMoney,
                switchboardDataFeed: this.switchboardDataFeed,
                authority: signer.publicKey,
            }).signers([signer])
            .rpc();
    }

    async updateSwitchboardDataFeed(newSwitchboardDataFeed: PublicKey, signer: Keypair) {
        await this.cauldronProgram.methods.updateSwitchboardDataFeed()
            .accounts({
                cauldronAccount: this.getCauldronAccount(),
                switchboardDataFeed: newSwitchboardDataFeed,
                authority: signer.publicKey,
            })
            .signers([signer])
            .rpc({ commitment: "confirmed" });

        this.switchboardDataFeed = newSwitchboardDataFeed
    }

    async approveToCauldron(accountToApprove: PublicKey, signer: Keypair) {
        await this.cauldronProgram.methods.approveToCauldron()
            .accounts({
                accountToApprove: accountToApprove,
                cauldronAuthority: this.getCauldronAuthority(),
                cauldronAccount: this.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                authority: signer.publicKey,
            })
            .signers([signer])
            .rpc();
    }

    async createCauldronApprovalAccount(masterContractWhitelisted: PublicKey, bentoboxProgram: PublicKey, signer: Keypair) {
        const [approvedSeed, _approvedBump] = await getMasterContractApprovedAddress(this.cauldronAccount.publicKey, this.getCauldronAuthority(), this.bentoboxAccount, bentoboxProgram);
        this.cauldronAuthorityApprovalPda = approvedSeed

        await this.cauldronProgram.methods.createCauldronApprovalAccount()
            .accounts({
                masterContractApproved: approvedSeed,
                masterContractWhitelisted,
                cauldronAuthority: this.getCauldronAuthority(),
                cauldronAccount: this.cauldronAccount.publicKey,
                cauldronProgram: this.cauldronProgram.programId,
                bentoboxAccount: this.bentoboxAccount,
                bentoboxProgram: bentoboxProgram,
                systemProgram: SystemProgram.programId,
                authority: signer.publicKey,
            }).signers([signer])
            .rpc();
    }

    async liquidate(
        user: PublicKey,
        maxBorrowPart: number,
        to: PublicKey,
        signer: Keypair,
        bentobox: Bentobox) {
        await this.cauldronProgram.methods.liquidate(user, new BN(maxBorrowPart), to)
            .accounts({
                bentoboxCollateralTotalData: bentobox.getTotalDataPda(this.collateral),
                bentoboxMimTotalData: bentobox.getTotalDataPda(this.magicInternetMoney),
                bentoboxAccount: this.bentoboxAccount,
                bentoboxProgram: bentobox.getBentoboxProgram(),
                cauldronAccount: this.cauldronAccount.publicKey,
                cauldronAuthority: this.getCauldronAuthority(),
                switchboardDataFeed: this.switchboardDataFeed,
                totalData: this.getTotalDataPda(),
                userBalance: this.getUserBalancePda(user),
                cauldronCollateralBentoboxBalance: bentobox.getBalancePda(this.getCauldronAuthority(), this.collateral),
                authorityCollateralBentoboxBalance: bentobox.getBalancePda(signer.publicKey, this.collateral),
                cauldronMimBentoboxBalance: bentobox.getBalancePda(this.getCauldronAuthority(), this.magicInternetMoney),
                authorityMimBentoboxBalance: bentobox.getBalancePda(signer.publicKey, this.magicInternetMoney),
                collateral: this.collateral,
                magicInternetMoneyMint: this.magicInternetMoney,
                masterContractApproved: bentobox.getMasterContractApprovedPda(signer.publicKey, this.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(this.getCauldronAccount()),
                authority: signer.publicKey,
            }).signers([signer])
            .rpc({ commitment: "confirmed" });
    }

    async beginLiquidate(
        user: PublicKey,
        maxBorrowPart: BN,
        signer: Keypair,
        bentobox: Bentobox) {
        const [_cauldronLiquidatorAccountAddress, _cauldronLiquidatorAccountNonce] = await getCauldronLiquidatorAccountAddress(
            signer.publicKey,
            this.cauldronAccount.publicKey,
            this.cauldronProgram.programId
        );
        this.liquidatorAccountPdas[signer.publicKey.toBase58()] = _cauldronLiquidatorAccountAddress;

        try {
            let tx = await this.cauldronProgram.methods.beginLiquidate(user, maxBorrowPart)
                .accounts({
                    bentoboxCollateralTotalData: bentobox.getTotalDataPda(this.collateral),
                    bentoboxMimTotalData: bentobox.getTotalDataPda(this.magicInternetMoney),
                    bentoboxAccount: this.bentoboxAccount,
                    bentoboxProgram: bentobox.getBentoboxProgram(),
                    cauldronAccount: this.cauldronAccount.publicKey,
                    cauldronAuthority: this.getCauldronAuthority(),
                    switchboardDataFeed: this.switchboardDataFeed,
                    totalData: this.getTotalDataPda(),
                    userBalance: this.getUserBalancePda(user),
                    cauldronCollateralBentoboxBalance: bentobox.getBalancePda(this.getCauldronAuthority(), this.collateral),
                    collateral: this.collateral,
                    magicInternetMoneyMint: this.magicInternetMoney,
                    liquidatorAccount: _cauldronLiquidatorAccountAddress,
                    authority: signer.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronSourceVault: this.getTotalVaultPda(this.collateral),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    bentoboxCollateralVault: bentobox.getTotalVaultPda(this.collateral),
                    systemProgram: SystemProgram.programId,
                })
                .signers([signer])
                .rpc({ commitment: "confirmed" });
            console.log("Begin liquidate tx", tx)
        } catch (err) {
            console.log("begin liquidate error", err)
        }
    }

    // Remaining accounts required by Orca Swap
    //   1. `[writable]` token swap
    //   2. `[]` swap authority
    //   3. `[writable]` pool source account
    //   4. `[writable]` pool destination account
    //   5. `[writable]` pool token mint
    //   6. `[writable]` pool fee account
    //   7. `[writable]` pool host fee account
    //   8. `[]` source mint account
    //   9. `[]` destination mint account
    async liquidateSwapOrca(
        signer: Keypair,
        originLiquidator: PublicKey,
        swapperProgram: PublicKey,

        swapProgram: PublicKey,
        tokenSwap: PublicKey,
        swapAuthority: PublicKey,
        poolSourceVault: PublicKey,
        poolDestinationVault: PublicKey,
        poolTokenMint: PublicKey,
        poolFeeAccount: PublicKey) {

        try {
            let tx = await this.cauldronProgram.methods.liquidateSwap()
                .accounts({
                    liquidatorAccount: this.getLiquidatorAccountPda(originLiquidator),
                    cauldronAccount: this.getCauldronAccount(),
                    cauldronAuthority: this.getCauldronAuthority(),
                    collateral: this.collateral,
                    magicInternetMoneyMint: this.magicInternetMoney,
                    cauldronSourceVault: this.getTotalVaultPda(this.collateral),
                    cauldronDestinationVault: this.getTotalVaultPda(this.magicInternetMoney),
                    swapperProgram,
                    swapProgram,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    authority: signer.publicKey,
                }).remainingAccounts([
                    // Orca specific
                    { pubkey: tokenSwap, isWritable: false, isSigner: false },
                    { pubkey: swapAuthority, isWritable: false, isSigner: false },
                    { pubkey: poolSourceVault, isWritable: true, isSigner: false },
                    { pubkey: poolDestinationVault, isWritable: true, isSigner: false },
                    { pubkey: poolTokenMint, isWritable: true, isSigner: false },
                    { pubkey: poolFeeAccount, isWritable: true, isSigner: false },
                    { pubkey: this.getTotalVaultPda(poolTokenMint), isWritable: true, isSigner: false },
                    { pubkey: this.collateral, isWritable: false, isSigner: false },
                    { pubkey: this.magicInternetMoney, isWritable: false, isSigner: false },
                ]).signers([signer])
                .rpc({ commitment: "confirmed" });
            console.log("Orca swap tx", tx)
        } catch (_err) {
            console.log("Orca swap error", _err);
        }
    }

    // Remaining accounts required by Raydium Swap
    //   1. `[writable]` amm Account
    //   2. `[]` amm authority
    //   3. `[writable]` amm open_orders Account
    //   4. `[writable]` amm target_orders Account
    //   5. `[writable]` pool_token_coin Amm Account to swap FROM or To,
    //   6. `[writable]` pool_token_pc Amm Account to swap FROM or To,
    //   7. `[]` serum dex program id
    //   8. `[writable]` serum market Account. serum_dex program is the owner.
    //   9. `[writable]` bids Account
    //   10. `[writable]` asks Account
    //   11. `[writable]` event_q Account
    //   12. `[writable]` coin_vault Account
    //   13. `[writable]` pc_vault Account
    //   14. '[]` vault_signer Account
    async liquidateSwapRaydium(signer: Keypair,
        originLiquidator: PublicKey,
        swapperProgram: PublicKey,
        raydiumPoolProperties: any) {
        try {
            let tx = await this.cauldronProgram.methods.liquidateSwap()
                .accounts({
                    liquidatorAccount: this.getLiquidatorAccountPda(originLiquidator),
                    cauldronAccount: this.getCauldronAccount(),
                    cauldronAuthority: this.getCauldronAuthority(),
                    collateral: this.collateral,
                    magicInternetMoneyMint: this.magicInternetMoney,
                    cauldronSourceVault: this.getTotalVaultPda(this.collateral),
                    cauldronDestinationVault: this.getTotalVaultPda(this.magicInternetMoney),
                    swapperProgram,
                    swapProgram: raydiumPoolProperties.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    authority: signer.publicKey,
                }).remainingAccounts([
                    // Raydium specific
                    { pubkey: raydiumPoolProperties.id, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.authority, isWritable: false, isSigner: false },
                    { pubkey: raydiumPoolProperties.openOrders, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.targetOrders, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.baseVault, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.quoteVault, isWritable: true, isSigner: false },

                    { pubkey: raydiumPoolProperties.marketProgramId, isWritable: false, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketId, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketBids, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketAsks, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketEventQueue, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketBaseVault, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketQuoteVault, isWritable: true, isSigner: false },
                    { pubkey: raydiumPoolProperties.marketAuthority, isWritable: false, isSigner: false },
                ]).signers([signer])
                .rpc({ commitment: "confirmed" });
            console.log("Raydium swap tx", tx)
        } catch (_err) {
            console.log("Raydium swap error", _err);
        }
    }

    async completeLiquidate(
        signer: Keypair,
        originLiquidator: PublicKey,
        bentobox: Bentobox) {
        try {
            let tx = await this.cauldronProgram.methods.completeLiquidate()
                .accounts({
                    liquidatorAccount: this.getLiquidatorAccountPda(originLiquidator),
                    cauldronMimBentoboxBalance: bentobox.getBalancePda(this.cauldronAuthorityPda, this.magicInternetMoney),
                    authorityMimBentoboxBalance: bentobox.getBalancePda(signer.publicKey, this.magicInternetMoney),
                    cauldronAccount: this.getCauldronAccount(),
                    cauldronAuthority: this.getCauldronAuthority(),
                    bentoboxAccount: this.bentoboxAccount,
                    bentoboxProgram: bentobox.getBentoboxProgram(),
                    magicInternetMoneyMint: this.magicInternetMoney,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    mimStrategyData: bentobox.getStrategyDataPda(this.magicInternetMoney),
                    bentoboxMimTotalData: bentobox.getTotalDataPda(this.magicInternetMoney),
                    cauldronMimVault: this.getTotalVaultPda(this.magicInternetMoney),
                    bentoboxMimVault: bentobox.getTotalVaultPda(this.magicInternetMoney),
                    authority: signer.publicKey,
                }).signers([signer])
                .rpc({ commitment: "confirmed" });
            console.log("Complete liquidation tx", tx)
        } catch (_err) {
            console.log("Complete liquidation err", _err)
        }
    }
}