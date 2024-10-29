import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

import { TEST_PRICE, SOL_USD } from "../../common/src";
import { COLLATERIZATION_RATE_PRECISION } from "../../common/src/constants";

describe("Update switchboard data feed", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    let mimMint: Token = null;
    let collateralMint: Token = null;

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

        //initialize cauldron account
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, new BN(1000000))
    });

    it("Switchboad data feed updated!", async () => {
        let _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.authority.equals(cauldronOwner.publicKey));
        assert.ok(_cauldron.switchboardDataFeed.equals(TEST_PRICE));

        // try to sign with non cauldron owner
        try {
            await cauldronProgram.methods.updateSwitchboardDataFeed()
                .accounts({
                    cauldronAccount: cauldron.getCauldronAccount(),
                    switchboardDataFeed: SOL_USD,
                    authority: bentoboxOwner.publicKey,
                })
                .signers([bentoboxOwner])
                .rpc({ commitment: "confirmed" });
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;
            assert.strictEqual(err.error.errorCode.code, "ConstraintHasOne");
            assert.strictEqual(err.error.errorMessage, "A has one constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2001);
        }

        // additional check for new switchboard data feed owner, ONLY for devnet or mainnet, cause in local do not check switchboard data feed owner

        // try {
        //     await cauldronProgram.methods.updateSwitchboardDataFeed()
        //         .accounts({
        //             cauldronAccount: cauldron.getCauldronAccount(),
        //             switchboardDataFeed: collateralMint.publicKey,
        //             authority: cauldronOwner.publicKey,
        //         })
        //         .signers([cauldronOwner])
        //         .rpc({ commitment: "confirmed" });
        // } catch (_err) {
        //     assert.isTrue(_err instanceof AnchorError);
        //     const err: AnchorError = _err;

        //     assert.strictEqual(err.error.errorCode.code, "InvalidSwitchboardProgram");
        //     let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
        //     assert.strictEqual(err.error.errorMessage, error.errorMsg);
        //     assert.strictEqual(err.error.errorCode.number, error.errorCode);
        // }

        // change switchboard data feed with right signer (authority of Cauldron account - cauldronOwner)
        await cauldronProgram.methods.updateSwitchboardDataFeed()
            .accounts({
                cauldronAccount: cauldron.getCauldronAccount(),
                switchboardDataFeed: SOL_USD,
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc({ commitment: "confirmed" });

        _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.switchboardDataFeed.toBase58() == SOL_USD.toBase58());
    });
});
