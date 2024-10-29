import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import * as borsh from "borsh";

import { Bentobox } from "../../common/bentobox"

describe("ToShare and ToAmount BentoBox", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    let bentobox = new Bentobox();

    let mint: Token = null;
    let bobTokenAccount: PublicKey = null;

    const depositAmount = 1000;

    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob]);

        mint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        bobTokenAccount = await common.createAndFundUserAccount(
            Bob.publicKey,
            bentoboxOwner,
            mint,
            depositAmount * 2
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for mint
        await bentobox.createVault(mint.publicKey, Bob);
        // create mint Balance account for Bob 
        await bentobox.createBalance(Bob.publicKey, mint.publicKey, Bob)
        // create strategy data account for mint token
        await bentobox.createStrategyData(mint.publicKey)

        await bentobox.deposit(mint.publicKey, bobTokenAccount, Bob.publicKey, new BN(depositAmount), new BN(0), Bob)
    });

    it("toAmount and toShare", async () => {
        //Listen toAmount event

        let listener = null;
        let tx = null;
        let t = null;

        let [event_amount, slot_amount] = await new Promise((resolve, _reject) => {
            listener = bentoboxProgram.addEventListener("ConversionData", (event, slot) => {
                resolve([event, slot]);
            });

            bentoboxProgram.methods.toAmount(new BN(depositAmount), true)
                .accounts({
                    mint: mint.publicKey,
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                }).rpc({ commitment: "confirmed" });
        });

        await bentoboxProgram.removeEventListener(listener);

        assert.ok(slot_amount > 0);
        assert.ok(event_amount.data.toNumber() === depositAmount);

        tx = await bentoboxProgram.methods.toAmount(new BN(depositAmount), true)
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
        assert.equal(reader.readU64().toNumber(), depositAmount);

        //Listen toShare event

        let [event_share, slot_share] = await new Promise((resolve, _reject) => {
            listener = bentoboxProgram.addEventListener("ConversionData", (event, slot) => {
                resolve([event, slot]);
            });

            bentoboxProgram.methods.toShare(new BN(depositAmount), true)
                .accounts({
                    mint: mint.publicKey,
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                }).rpc({ commitment: "confirmed" });
        });

        await bentoboxProgram.removeEventListener(listener);

        assert.ok(slot_share > 0);
        assert.ok(event_share.data.toNumber() === depositAmount);

        tx = await bentoboxProgram.methods.toShare(new BN(depositAmount), true)
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
        assert.equal(reader.readU64().toNumber(), depositAmount);
    });
});