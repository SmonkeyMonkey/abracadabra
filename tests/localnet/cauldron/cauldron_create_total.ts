import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

import * as common from "../../common/common";
import { getCauldronTotalAddress } from "../../common/cauldron_pda_helper";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";

describe("Create Cauldron Total data", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const depositerBob = Keypair.generate();

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, cauldronOwner, depositerBob]);

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

    it("Create total data account", async () => {
        const [_total_key, _total_nonce] = await getCauldronTotalAddress(
            cauldron.getCauldronAccount(),
            cauldronProgram.programId
        );

        await cauldronProgram.methods.createTotal()
            .accounts({
                totalData: _total_key,
                authority: depositerBob.publicKey,
                systemProgram: SystemProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
            })
            .signers([depositerBob])
            .rpc();

        const total = await cauldronProgram.account.total.fetch(_total_key);
        assert.ok(total.borrow["base"].toString() == "0");
        assert.ok(total.borrow["elastic"].toString() == "0");
        assert.ok(total.collateralShare.toString() == "0");
    });
});
