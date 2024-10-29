import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as common from "../../common/common";

import { MINIMUM_SHARE_BALANCE, MAX_TARGET_PERCENTAGE } from "../../common/src/constants";

describe("Create BentoBox", () => {
  // const provider = common.getAnchorProvider();
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider); 
  const connection = provider.connection;

  const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

  let bentobox = Keypair.generate();
  const bentoboxOwner = Keypair.generate();

  it("Bentobox created!", async () => {
    await common.batchAirdrop(connection, [bentoboxOwner]);

    await bentoboxProgram.methods.create(MINIMUM_SHARE_BALANCE, MAX_TARGET_PERCENTAGE)
      .accounts({
        bentoboxAccount: bentobox.publicKey,
        authority: bentoboxOwner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bentoboxOwner, bentobox])
      .rpc()

    const _bentobox = await bentoboxProgram.account.bentoBox.fetch(bentobox.publicKey);
    assert.ok(_bentobox.authority.equals(bentoboxOwner.publicKey));
  });
});
