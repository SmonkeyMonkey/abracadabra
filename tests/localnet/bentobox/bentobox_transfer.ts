import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { Bentobox } from "../../common/bentobox"

describe("Transfer in BentoBox", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    const bentobox_idl = require("../../../target/idl/bentobox.json");

    let bentobox = new Bentobox();
    let mint: Token = null;

    const depositAmount = 1000;

    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();
    const Carol = Keypair.generate();

    let bobTokenAccount: PublicKey = null;
    let carolTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob, Carol]);

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
            depositAmount * 6
        );

        carolTokenAccount = await common.createAndFundUserAccount(
            Carol.publicKey,
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
        // create mint Balance account for Carol 
        await bentobox.createBalance(Carol.publicKey, mint.publicKey, Carol)
        // create strategy data account for mint token
        await bentobox.createStrategyData(mint.publicKey)

        await bentobox.deposit(mint.publicKey, bobTokenAccount, Bob.publicKey, new BN(depositAmount * 2), new BN(0), Bob)

        await bentobox.deposit(mint.publicKey, carolTokenAccount, Carol.publicKey, new BN(depositAmount * 2), new BN(0), Carol)
    });

    it("Single Transfer", async () => {

        await bentoboxProgram.methods.transfer(Bob.publicKey, Carol.publicKey, new BN(1000))
            .accounts({
                balanceFrom: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                balanceTo: bentobox.getBalancePda(Carol.publicKey, mint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                mint: mint.publicKey,
                authority: Bob.publicKey
            })
            .signers([Bob])
            .rpc()


        const _carolBalanceAccount = await bentoboxProgram.account.balance.fetch(
            bentobox.getBalancePda(Carol.publicKey, mint.publicKey)
        );

        assert.ok(_carolBalanceAccount.amount.toString(10) == "3000");

        // transfer more than available balance
        try {
            await bentoboxProgram.methods.transfer(Bob.publicKey, Carol.publicKey, new BN(4000))
                .accounts({
                    balanceFrom: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    balanceTo: bentobox.getBalancePda(Carol.publicKey, mint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: mint.publicKey,
                    authority: Bob.publicKey
                })
                .signers([Bob])
                .rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "TransferAmountToHigh");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // transfer with wrong signer
        try {
            await bentoboxProgram.methods.transfer(Bob.publicKey, Carol.publicKey, new BN(1000))
                .accounts({
                    balanceFrom: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    balanceTo: bentobox.getBalancePda(Carol.publicKey, mint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: mint.publicKey,
                    authority: Carol.publicKey
                })
                .signers([Carol])
                .rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "AllowedRemainingAccountsAreEmpty");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }
    });
});