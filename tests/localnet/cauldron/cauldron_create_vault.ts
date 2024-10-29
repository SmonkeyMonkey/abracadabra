import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

import * as common from "../../common/common";
import { getCauldronVaultAddress } from "../../common/cauldron_pda_helper";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";

describe("Create Cauldron Vault", () => {
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

    it("Create vault account", async () => {
        const [_total_vault_key, _total_vault_nonce] =
            await getCauldronVaultAddress(
                collateralMint.publicKey,
                cauldron.getCauldronAccount(),
                cauldronProgram.programId
            );

        await cauldronProgram.methods.createVault()
            .accounts({
                cauldronVault: _total_vault_key,
                authority: depositerBob.publicKey,
                mint: collateralMint.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAccount: cauldron.getCauldronAccount(),
            })
            .signers([depositerBob])
            .rpc();

        let vault_token_acc = await collateralMint.getAccountInfo(_total_vault_key);
        assert.ok(vault_token_acc.owner.equals(cauldron.getCauldronAuthority()));
    });
});
