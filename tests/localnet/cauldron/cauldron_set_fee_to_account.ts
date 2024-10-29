import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Cauldron set fee_to account", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const Bob = Keypair.generate();

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, cauldronOwner]);

        mimMint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        collateralMint = await common.createMintAccount(
            connection,
            cauldronOwner,
            cauldronOwner.publicKey,
            0
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
    });

    it("Cauldron set fee_to account", async () => {
        let _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.feeTo.equals(cauldronOwner.publicKey));

        // try to sign with non cauldron owner account
        try {
            await cauldronProgram.methods.setFeeTo(Bob.publicKey)
                .accounts({
                    cauldronAccount: cauldron.getCauldronAccount(),
                    authority: bentoboxOwner.publicKey,
                })
                .signers([bentoboxOwner])
                .rpc();
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintHasOne");
            assert.strictEqual(err.error.errorMessage, "A has one constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2001);
        }

        // set new fee_to account with right signer
        await cauldronProgram.methods.setFeeTo(Bob.publicKey)
            .accounts({
                cauldronAccount: cauldron.getCauldronAccount(),
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc();

        _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.feeTo.equals(Bob.publicKey));
    });
});
