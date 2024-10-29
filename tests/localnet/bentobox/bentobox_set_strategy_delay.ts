import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as common from "../../common/common";

import { Bentobox } from "../../common/bentobox"

describe("BentoBox set strategy delay", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    let bentobox = new Bentobox();
    const bentoboxOwner = Keypair.generate();

    it("Bentobox strategy delay changed!", async () => {
        await common.batchAirdrop(connection, [bentoboxOwner]);

        // create bentobox
        await bentobox.create(bentoboxOwner);

        let _bentobox = await bentoboxProgram.account.bentoBox.fetch(bentobox.getBentoboxAccount());

        assert.ok(_bentobox.authority.equals(bentoboxOwner.publicKey));
        assert.equal(_bentobox.strategyDelay.toNumber(), 0);

        await bentoboxProgram.methods.setStrategyDelay(new BN(10000))
            .accounts({
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: bentoboxOwner.publicKey,
                systemProgram: SystemProgram.programId,
            }).signers([bentoboxOwner]).rpc()

        _bentobox = await bentoboxProgram.account.bentoBox.fetch(bentobox.getBentoboxAccount());
        assert.equal(_bentobox.strategyDelay.toNumber(), 10000);
    });
});
