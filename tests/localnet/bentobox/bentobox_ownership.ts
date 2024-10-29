import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from '@coral-xyz/anchor';
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import * as common from "../../common/common";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Bentobox } from "../../common/bentobox"

describe("Ownership BentoBox", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    const bentobox_idl = require("../../../target/idl/bentobox.json");

    let bentobox = new Bentobox();
    const mrFirstyOwner = Keypair.generate();
    const mrSecondaryOwner = Keypair.generate();

    before(async () => {
        await common.batchAirdrop(connection, [mrFirstyOwner, mrSecondaryOwner]);

        // create bentobox
        await bentobox.create(mrFirstyOwner);
    });

    it("Change Ownership. Breaking tests.", async () => {
        try {
            await bentoboxProgram.methods.transferAuthority(mrFirstyOwner.publicKey, true, false)
                .accounts({
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    authority: mrFirstyOwner.publicKey
                })
                .signers([mrFirstyOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "SameAuthority");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            await bentoboxProgram.methods.transferAuthority(mrSecondaryOwner.publicKey, true, false)
                .accounts({
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    authority: mrSecondaryOwner.publicKey
                })
                .signers([mrSecondaryOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;
            assert.strictEqual(err.error.errorMessage, "A has one constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2001);
        }

        try {
            await bentoboxProgram.methods.transferAuthority(PublicKey.default, true, false)
                .accounts({
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    authority: mrFirstyOwner.publicKey
                })
                .signers([mrFirstyOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "EmptyAuthorityAddress");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            await bentoboxProgram.methods.claimAuthority()
                .accounts({
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    authority: mrFirstyOwner.publicKey
                })
                .signers([mrFirstyOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "EmptyPendingAuthorityAddress");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        try {
            await bentoboxProgram.methods.transferAuthority(mrSecondaryOwner.publicKey, false, false)
                .accounts({
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    authority: mrFirstyOwner.publicKey
                })
                .signers([mrFirstyOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidClaimAuthority");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }
    });

    it("Change Ownership. Direct.", async () => {
        await bentoboxProgram.methods.transferAuthority(mrSecondaryOwner.publicKey, true, false)
            .accounts({
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: mrFirstyOwner.publicKey
            })
            .signers([mrFirstyOwner]).rpc()
        const _bentoboxAcc = await bentoboxProgram.account.bentoBox.fetch(bentobox.getBentoboxAccount());
        assert.ok(_bentoboxAcc.authority.equals(mrSecondaryOwner.publicKey), "Wrong authority of BentoBox after authority transfer.");
    });


    it("Change Ownership. Claim Ownership.", async () => {
        await bentoboxProgram.methods.transferAuthority(mrFirstyOwner.publicKey, false, false)
            .accounts({
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: mrSecondaryOwner.publicKey
            })
            .signers([mrSecondaryOwner]).rpc()
        let _bentoboxAcc = await bentoboxProgram.account.bentoBox.fetch(bentobox.getBentoboxAccount());

        assert.ok(_bentoboxAcc.authority.equals(mrSecondaryOwner.publicKey), "Wrong authority of BentoBox after authority transfer.");
        assert.notEqual(_bentoboxAcc.pendingAuthority, null, "Pending authority of BentoBox should not be null.");
        assert.equal(_bentoboxAcc.pendingAuthority.toString(), mrFirstyOwner.publicKey.toString(), "Wrong pending authority of BentoBox after indirectr authority transfer.");

        await bentoboxProgram.methods.claimAuthority()
            .accounts({
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: mrFirstyOwner.publicKey
            })
            .signers([mrFirstyOwner]).rpc()

        _bentoboxAcc = await bentoboxProgram.account.bentoBox.fetch(bentobox.getBentoboxAccount());

        assert.ok(_bentoboxAcc.authority.equals(mrFirstyOwner.publicKey), "Wrong authority of BentoBox after authority claim.");
        assert.equal(_bentoboxAcc.pendingAuthority, null, "Wrong pending authority of BentoBox after indirectr authority claim.");
    });

    it("Change Ownership. Renounce.", async () => {
        await bentoboxProgram.methods.transferAuthority(PublicKey.default, true, true)
            .accounts({
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: mrFirstyOwner.publicKey
            })
            .signers([mrFirstyOwner]).rpc()
        const _bentoboxAcc = await bentoboxProgram.account.bentoBox.fetch(bentobox.getBentoboxAccount());
        assert.ok(_bentoboxAcc.authority.equals(PublicKey.default), "Wrong authority of BentoBox after renounce. Should be default value.");
    });
});