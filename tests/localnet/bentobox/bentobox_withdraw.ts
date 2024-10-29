import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import * as borsh from "borsh";

import { Bentobox } from "../../common/bentobox"

describe("Withdraw from BentoBox", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    let bentobox = new Bentobox();
    let mint: Token = null;

    const bentobox_idl = require("../../../target/idl/bentobox.json");

    const depositAmount = 1000;
    const withdrawAmount = 500;

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
            depositAmount * 2
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
    });

    it("Withdraw!", async () => {
        let tx = null;
        let t = null;

        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);

        tx = await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(withdrawAmount), new BN(0))
            .accounts({
                bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                to: bobTokenAccount,
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
        assert(deserialized.amount_out.toNumber() === 500);
        assert(deserialized.share_out.toNumber() === 500);

        let vault_token_acc = await mint.getAccountInfo(bentobox.getTotalVaultPda(mint.publicKey));
        assert.ok(
            (await mint.getAccountInfo(bobTokenAccount)).amount.toString() == "500"
        );
        assert.ok(vault_token_acc.amount.toString() == "1500");

        const _balanceAccount = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(Bob.publicKey, mint.publicKey));
        assert.ok(_balanceAccount.amount.toString(10) == "1500");

        // withdraw higher token amount than exists in bentobox
        try {
            await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(2000), new BN(0))
                .accounts({
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    to: bobTokenAccount,
                    balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    authority: Bob.publicKey,
                    vaultAuthority: bentobox.getBentoboxAuthority(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                }).signers([Bob]).rpc({ commitment: "confirmed" });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "WithdrawAmountToHigh");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // Authority of withdraw token account mismatch with signer
        try {
            await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(700), new BN(0))
                .accounts({
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    to: bobTokenAccount,
                    balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    authority: Bob.publicKey,
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    vaultAuthority: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    tokenProgram: TOKEN_PROGRAM_ID,
                }).signers([Bob]).rpc({ commitment: "confirmed" });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "WithdrawTokenAccountInvalidAuthority");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // BentoBox: Cannot empty.
        try {
            await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(700), new BN(0))
                .accounts({
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    to: bobTokenAccount,
                    balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    authority: Bob.publicKey,
                    vaultAuthority: bentobox.getBentoboxAuthority(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                }).signers([Bob]).rpc({ commitment: "confirmed" });

        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "WithdrawCannotEmpty");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // incompatible token accounts
        const mint5Decimals = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            5
        );

        let depositer5DecimalsAcc = await mint5Decimals.createAccount(
            Bob.publicKey
        );

        await delay(5 * 1000);

        try {
            await bentoboxProgram.methods.withdraw(Bob.publicKey, new BN(withdrawAmount), new BN(0))
                .accounts({
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    to: depositer5DecimalsAcc,
                    balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    authority: Carol.publicKey,
                    vaultAuthority: bentobox.getBentoboxAuthority(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                }).signers([Carol]).rpc({ commitment: "confirmed" });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorMessage, "Incompatible token accounts.");
            assert.strictEqual(err.error.errorCode.number, 6000);
        }

        // unauthorized withdraw
        try {
            await bentoboxProgram.methods.withdraw(Carol.publicKey, new BN(100), new BN(0))
                .accounts({
                    bentoboxVault: bentobox.getTotalVaultPda(mint.publicKey),
                    to: carolTokenAccount,
                    balance: bentobox.getBalancePda(Bob.publicKey, mint.publicKey),
                    totalData: bentobox.getTotalDataPda(mint.publicKey),
                    authority: Carol.publicKey,
                    vaultAuthority: bentobox.getBentoboxAuthority(),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([Carol]).rpc({ commitment: "confirmed" });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }
    });
});