import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import * as borsh from "borsh";

import { Bentobox } from "../../common/bentobox"

describe("BentoBox decimals operations", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    let bentobox = new Bentobox();
    let mint: Token = null;

    const depositAmount = 1000000;

    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    let BobTokenAccount: PublicKey = null;

    const collateralDecimal = Math.pow(10, 9);

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob]);

        mint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            9
        );

        BobTokenAccount = await common.createAndFundUserAccount(
            Bob.publicKey,
            bentoboxOwner,
            mint,
            depositAmount * 2 * collateralDecimal
        );

        for (let i = 0; i < 19; i++) {
            await mint.mintTo(BobTokenAccount, bentoboxOwner.publicKey, [bentoboxOwner], depositAmount * collateralDecimal);
        }

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for mint
        await bentobox.createVault(mint.publicKey, Bob);
        // create mint Balance account for Bob 
        await bentobox.createBalance(Bob.publicKey, mint.publicKey, Bob)
        // create strategy data account for mint token
        await bentobox.createStrategyData(mint.publicKey)
    });

    it("Deposit", async () => {
        let tx = null;
        let t = null;

        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);

        tx = await bentoboxProgram.methods.deposit(Bob.publicKey, new BN(9000000 * collateralDecimal), new BN(0))
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
            }).signers([Bob])
            .rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        let [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        class AmountShareOut extends common.Assignable { }

        let schema = new Map([
            [AmountShareOut, { kind: "struct", fields: [["amount_out", "u64"], ["share_out", "u64"]] }],
        ]);
        let deserialized = borsh.deserialize(schema, AmountShareOut, buffer);
        assert(deserialized.amount_out.toNumber() === 9000000 * collateralDecimal);
        assert(deserialized.share_out.toNumber() === 9000000 * collateralDecimal);

        let vault_token_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));

        assert.ok(
            (await mint.getAccountInfo(BobTokenAccount)).amount.toString() ==
            "12000000000000000"
        );
        assert.ok(vault_token_acc.amount.toString() == "9000000000000000");

        let balance_acc = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, mint.publicKey));
        assert.ok(balance_acc.amount.toString() == "9000000000000000");

        let total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));
        assert.ok(total.amount["base"].toString() == "9000000000000000");
        assert.ok(total.amount["elastic"].toString() == "9000000000000000");


        tx = await bentoboxProgram.methods.deposit(Bob.publicKey, new BN(9000000 * collateralDecimal), new BN(0))
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
            }).signers([Bob])
            .rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        schema = new Map([
            [AmountShareOut, { kind: "struct", fields: [["amount_out", "u64"], ["share_out", "u64"]] }],
        ]);
        deserialized = borsh.deserialize(schema, AmountShareOut, buffer);
        assert(deserialized.amount_out.toNumber() === 9000000 * collateralDecimal);
        assert(deserialized.share_out.toNumber() === 9000000 * collateralDecimal);

        vault_token_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));

        assert.ok(
            vault_token_acc.amount.toString() == "18000000000000000"
        );

        balance_acc = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, mint.publicKey));
        assert.ok(balance_acc.amount.toString() == "18000000000000000");

        total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mint.publicKey));

        assert.ok(total.amount["base"].toString() == "18000000000000000");
        assert.ok(total.amount["elastic"].toString() == "18000000000000000");
    });

    it("Withdraw!", async () => {
        let tx = null;
        let t = null;

        tx = await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(9000000 * collateralDecimal), new BN(0))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                to: BobTokenAccount,
                balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                totalData: bentobox.getTotalDataPda(mint.publicKey),
                authority: Bob.publicKey,
                vaultAuthority: bentobox.getBentoboxAuthority(),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
            }).signers([Bob]).rpc({ commitment: "confirmed" });

        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        let [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, bentoboxProgram.programId.toString());

        class AmountShareOut extends common.Assignable { }

        let schema = new Map([
            [AmountShareOut, { kind: "struct", fields: [["amount_out", "u64"], ["share_out", "u64"]] }],
        ]);
        let deserialized = borsh.deserialize(schema, AmountShareOut, buffer);
        assert(deserialized.amount_out.toNumber() === 9000000000000000);
        assert(deserialized.share_out.toNumber() === 9000000000000000);

        let vault_token_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(
            (await mint.getAccountInfo(BobTokenAccount)).amount.toString() == "12000000000000000"
        );
        assert.ok(vault_token_acc.amount.toString() == "9000000000000000");

        const _balanceAccount = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, mint.publicKey));
        assert.ok(_balanceAccount.amount.toString(10) == "9000000000000000");
    });
});