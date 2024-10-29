import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { getBentoboxBalanceAddress } from "../../common/bentobox_pda_helper";
import { Bentobox } from "../../common/bentobox"

describe("Create user balance account", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env()
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    let bentobox = new Bentobox();
    let mint: Token = null;

    const depositAmount = 1000;

    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    let BobTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob]);

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
            depositAmount * 2
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create total vault for mint
        await bentobox.createVault(mint.publicKey, Bob);
        // create strategy data account for mint token
        await bentobox.createStrategyData(mint.publicKey)
    });

    it("Create balance", async () => {
        const [_balance_key, _balance_nonce] = await getBentoboxBalanceAddress(
            Bob.publicKey,
            mint.publicKey,
            bentobox.getBentoboxAccount(),
            bentoboxProgram.programId
        );

        // save it, just for use deposit function from Bentobox class below   
        bentobox.balancePdas[Bob.publicKey.toBase58() + mint.publicKey.toBase58()] = _balance_key

        await bentoboxProgram.methods.createBalance(Bob.publicKey)
            .accounts({
                balance: _balance_key,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: Bob.publicKey,
                mint: mint.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([Bob])
            .rpc();

        let balance_acc = await bentoboxProgram.account.balance.fetch(_balance_key);
        assert.ok(balance_acc.amount.toString() == "0");

        // deposited to bentobox and check for reinitialize
        await bentobox.deposit(mint.publicKey, BobTokenAccount, Bob.publicKey, new BN(depositAmount), new BN(0), Bob)

        balance_acc = await bentoboxProgram.account.balance.fetch(_balance_key);
        assert.ok(balance_acc.amount.toString() == "1000");

        // try {
        //     await bentoboxProgram.methods.createBalance(Bob.publicKey)
        //         .accounts({
        //             balance: _balance_key,
        //             bentoboxAccount: bentobox.getBentoboxAccount(),
        //             authority: Bob.publicKey,
        //             mint: mint.publicKey,
        //             systemProgram: SystemProgram.programId,
        //         })
        //         .signers([Bob])
        //         .rpc()

        // } catch (err) {
        //     assert.strictEqual(err.Message, "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0.");
        // }
        // failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0
        balance_acc = await bentoboxProgram.account.balance.fetch(_balance_key);
        assert.ok(balance_acc.amount.toString() == "1000");
    });
});