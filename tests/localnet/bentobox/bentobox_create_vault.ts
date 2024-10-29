import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";

import * as common from "../../common/common";
import { getBentoboxTotalAddress, getBentoboxTotalVaultAddress } from "../../common/bentobox_pda_helper";
import { Bentobox } from "../../common/bentobox"

describe("Create Total BentoBox", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env()
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    let bentobox = new Bentobox();
    let mint: Token = null;

    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob]);

        mint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
    });

    it("Create total token account", async () => {
        const [_total_key, _total_nonce] = await getBentoboxTotalAddress(
            mint.publicKey,
            bentobox.getBentoboxAccount(),
            bentoboxProgram.programId
        );

        const [_total_vault_key, _total_vault_nonce] =
            await getBentoboxTotalVaultAddress(
                mint.publicKey,
                bentobox.getBentoboxAccount(),
                bentoboxProgram.programId
            );

        await bentoboxProgram.methods.createVault()
            .accounts({
                totalData: _total_key,
                bentoboxVault: _total_vault_key,
                authority: Bob.publicKey,
                mint: mint.publicKey,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxAccount: bentobox.getBentoboxAccount(),
            })
            .signers([Bob])
            .rpc()

        let vault_token_acc = await mint.getAccountInfo(_total_vault_key);
        assert.ok(vault_token_acc.owner.equals(bentobox.getBentoboxAuthority()));

        const total = await bentoboxProgram.account.total.fetch(_total_key);
        assert.ok(total.amount["base"].toString() == "0");
        assert.ok(total.amount["elastic"].toString() == "0");
    });
});
