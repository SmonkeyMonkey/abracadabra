import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

import { getCauldronUserBalanceAddress } from "../../common/cauldron_pda_helper";
import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";

describe("Create user balance account", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const cauldronOwner = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const depositerBob = Keypair.generate();

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, depositerBob, cauldronOwner]);

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

    it("Create balance", async () => {
        const [_balance_key, _balance_nonce] = await getCauldronUserBalanceAddress(
            depositerBob.publicKey,
            cauldron.getCauldronAccount(),
            cauldronProgram.programId
        );


        await cauldronProgram.methods.createUserBalance(depositerBob.publicKey)
            .accounts({
                userBalance: _balance_key,
                cauldronAccount: cauldron.getCauldronAccount(),
                authority: depositerBob.publicKey,
                systemProgram: SystemProgram.programId,

            })
            .signers([depositerBob])
            .rpc();


        let balance_acc = await cauldronProgram.account.userBalance.fetch(_balance_key);
        assert.ok(balance_acc.collateralShare.toString() == "0");
        assert.ok(balance_acc.borrowPart.toString() == "0");

        // try {
        //     await cauldronProgram.methods.createUserBalance(depositerBob.publicKey)
        //         .accounts({
        //             userBalance: _balance_key,
        //             cauldronAccount: cauldron.getCauldronAccount(),
        //             authority: depositerBob.publicKey,
        //             systemProgram: SystemProgram.programId,
        //         })
        //         .signers([depositerBob])
        //         .rpc();

        // } catch (err) {
        //     assert.strictEqual(err.message, "failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0");
        // }
    });
});