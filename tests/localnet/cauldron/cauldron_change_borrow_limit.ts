import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, U64_MAX, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Change borrow limit", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

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


    it("Cauldron: change borrow limit", async () => {
        let _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.borrowLimit.total.toString() == U64_MAX.toString());
        assert.ok(_cauldron.borrowLimit.borrowPartPerAddress.toString() == U64_MAX.toString());

        // try to sign with non cauldron owner
        try {
            await cauldronProgram.methods.changeBorrowLimit(new BN(200000), new BN(1500))
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

        // change borrow limit with right signer (authority of Cauldron account - cauldronOwner)
        await cauldronProgram.methods.changeBorrowLimit(new BN(200000), new BN(1500))
            .accounts({
                cauldronAccount: cauldron.getCauldronAccount(),
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc();

        _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.borrowLimit.total.toString() == "200000");
        assert.ok(_cauldron.borrowLimit.borrowPartPerAddress.toString() == "1500");
    });
});