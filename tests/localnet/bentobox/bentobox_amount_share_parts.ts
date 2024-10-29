import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import * as borsh from "borsh";

import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { StrategyMock as StrategyMockProgram } from "../../../target/types/strategy_mock";

import { Bentobox } from "../../common/bentobox"
import { StrategyMock } from "../../common/mock_strategy"

describe("ToShare and ToAmount parts", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const strategyMockProgram = anchor.workspace.StrategyMock as Program<StrategyMockProgram>;

    let bentobox = new Bentobox();

    let mint: Token = null;
    let stanTokenAccount: PublicKey = null;
    let danTokenAccount: PublicKey = null;

    let strategyMock = new StrategyMock()
    let poolVault: PublicKey = null;
    let someVault: PublicKey = null;

    const depositAmount = 1000;

    const bentoboxOwner = Keypair.generate();
    const Stan = Keypair.generate();
    const Dan = Keypair.generate();
    const poolOwner = Keypair.generate();
    const strategyMockOwner = Keypair.generate();

    const mintDecimal = Math.pow(10, 9)

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, strategyMockOwner, poolOwner, Stan, Dan]);

        mint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            6
        );

        stanTokenAccount = await common.createAndFundUserAccount(
            Stan.publicKey,
            bentoboxOwner,
            mint,
            depositAmount * mintDecimal
        );

        danTokenAccount = await common.createAndFundUserAccount(
            Dan.publicKey,
            bentoboxOwner,
            mint,
            depositAmount * mintDecimal
        );

        poolVault = await common.createAndFundUserAccount(
            poolOwner.publicKey,
            bentoboxOwner,
            mint,
            0
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for mint
        await bentobox.createVault(mint.publicKey, Stan);
        // create mint Balance account for Stan 
        await bentobox.createBalance(Stan.publicKey, mint.publicKey, Stan)
        // create mint Balance account for Dan 
        await bentobox.createBalance(Dan.publicKey, mint.publicKey, Dan)
        // create strategy data account for mint token
        await bentobox.createStrategyData(mint.publicKey)
        // set strategy delay
        await bentobox.setStrategyDelay(new BN(10));

        await bentobox.setStrategyTargetPercentage(new BN(10), mint.publicKey)

        // initialize mock_strategy
        await strategyMock.initialize(mint.publicKey, bentobox.getBentoboxAccount(), bentoboxProgram.programId, poolVault, poolOwner, strategyMockOwner)
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
                { pubkey: poolVault, isWritable: true, isSigner: false },
            ])
            .signers([bentoboxOwner]).rpc()

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
                { pubkey: poolVault, isWritable: true, isSigner: false },
            ])
            .signers([bentoboxOwner]).rpc()
    });

    it("toAmount and toShare parts, two users", async () => {
        let tx = null;
        let t = null;

        // 1. One user (Stan) deposits on bentobox
        await bentobox.deposit(mint.publicKey, stanTokenAccount, Stan.publicKey, new BN(depositAmount * mintDecimal), new BN(0), Stan)

        // Stan share: 1000 * mintDecimal
        // Stan amount: 1000 * mintDecimal
        tx = await bentoboxProgram.methods.toAmount(new BN(depositAmount * mintDecimal), true)
            .accounts({
                mint: mint.publicKey,
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
            }).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        let [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        let reader = new borsh.BinaryReader(buffer);
        assert.equal(reader.readU64().toNumber(), depositAmount * mintDecimal);

        // 2. One user deposited on Bentobox, strategy gains profit
        // From startegy bentobox gains 200 * mintDecimal
        someVault = await common.createAndFundUserAccount(
            strategyMockOwner.publicKey,
            bentoboxOwner,
            mint,
            200 * mintDecimal
        );
        await mint.transfer(someVault, poolVault, strategyMockOwner, [strategyMockOwner], 200 * mintDecimal) // actually profit

        await bentoboxProgram.methods.safeHarvest(new BN(4000 * mintDecimal), true, new BN(0), false, bentobox.getBentoboxAuthorityBump())
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
                { pubkey: poolVault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        await bentoboxProgram.methods.harvest(false, new BN(500 * mintDecimal), bentobox.getBentoboxAuthorityBump())
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
                { pubkey: poolVault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        // Stan share: 1000 * mintDecimal
        // Stan amount: 1200 * mintDecimal
        tx = await bentoboxProgram.methods.toAmount(new BN(depositAmount * mintDecimal), true)
            .accounts({
                mint: mint.publicKey,
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
            }).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        reader = new borsh.BinaryReader(buffer);
        assert.equal(reader.readU64().toNumber(), 1200 * mintDecimal);

        // 3. Another user (Dan) deposits on bentobox
        tx = await bentoboxProgram.methods.deposit(Dan.publicKey, new BN(depositAmount * mintDecimal), new BN(0))
            .accounts({
                from: danTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                balance: bentobox.getBalancePda(Dan.publicKey, mint.publicKey),
                authority: Dan.publicKey,
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                mint: mint.publicKey,
                strategyData: bentobox.getStrategyDataPda(mint.publicKey),
            }).signers([Dan])
            .rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        class AmountShareOut extends common.Assignable { }
        let schema = new Map([
            [AmountShareOut, { kind: "struct", fields: [["amount_out", "u64"], ["share_out", "u64"]] }],
        ]);

        let deserialized = borsh.deserialize(schema, AmountShareOut, buffer);
        // Dan share: 833333333333
        // Dan amount: 1000 * mintDecimal
        assert(deserialized["amount_out"].toNumber() === 1000 * mintDecimal);
        assert(deserialized["share_out"].toNumber() === 833333333333);

        let balance_Dan = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Dan.publicKey, mint.publicKey));
        assert.ok(balance_Dan.amount.toString() == "833333333333");

        // 4. Strategy gains profit
        // From startegy bentobox gains 200 * mintDecimal
        someVault = await common.createAndFundUserAccount(
            strategyMockOwner.publicKey,
            bentoboxOwner,
            mint,
            200 * mintDecimal
        );
        await mint.transfer(someVault, poolVault, strategyMockOwner, [strategyMockOwner], 200 * mintDecimal) // actually profit

        await bentoboxProgram.methods.harvest(false, new BN(500 * mintDecimal), bentobox.getBentoboxAuthorityBump())
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
                { pubkey: poolVault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        // Stan amount: 1309090909092
        // Stan share: 1000 * mintDecimal
        tx = await bentoboxProgram.methods.toAmount(new BN(1000 * mintDecimal), true)
            .accounts({
                mint: mint.publicKey,
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
            }).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        reader = new borsh.BinaryReader(buffer);
        assert.equal(reader.readU64().toNumber(), 1309090909092);

        // Dan share: 833333333333
        // Dan amount: 1090909090909
        tx = await bentoboxProgram.methods.toAmount(new BN(833333333333), true)
            .accounts({
                mint: mint.publicKey,
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
            }).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        reader = new borsh.BinaryReader(buffer);
        assert.equal(reader.readU64().toNumber(), 1090909090909);


        tx = await bentoboxProgram.methods.withdraw(Stan.publicKey, new BN(0), new BN(1000 * mintDecimal))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                to: stanTokenAccount,
                balance: bentobox.getBalancePda(Stan.publicKey, mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                authority: Stan.publicKey,
                vaultAuthority: bentobox.getBentoboxAuthority(),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
            }).signers([Stan]).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);

        deserialized = borsh.deserialize(schema, AmountShareOut, buffer);
        assert(deserialized["amount_out"].toNumber() === 1309090909091);
        assert(deserialized["share_out"].toNumber() === 1000 * mintDecimal);

        someVault = await common.createAndFundUserAccount(
            strategyMockOwner.publicKey,
            bentoboxOwner,
            mint,
            200 * mintDecimal
        );
        await mint.transfer(someVault, poolVault, strategyMockOwner, [strategyMockOwner], 200 * mintDecimal) // actually profit

        // get harvest to sent money back to bentobox
        await bentoboxProgram.methods.harvest(false, new BN(500 * mintDecimal), bentobox.getBentoboxAuthorityBump())
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
                { pubkey: poolVault, isWritable: true, isSigner: false },
            ])
            .signers([strategyMockOwner]).rpc()

        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);

        tx = await bentoboxProgram.methods.withdraw(Dan.publicKey, new BN(1090909090908), new BN(0))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                to: danTokenAccount,
                balance: bentobox.getBalancePda(Dan.publicKey, mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                authority: Dan.publicKey,
                vaultAuthority: bentobox.getBentoboxAuthority(),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
            }).signers([Dan]).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);

        deserialized = borsh.deserialize(schema, AmountShareOut, buffer);
        
        assert(deserialized["amount_out"].toNumber() === 1090909090908);
        assert(deserialized["share_out"].toNumber() === 704225352112);
    });
});