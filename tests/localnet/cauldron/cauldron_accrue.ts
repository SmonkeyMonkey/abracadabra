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

describe("Accrue Call", () => {
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
        // create cauldron total vault   
        await cauldron.createTotal(cauldronOwner);
    });

    it("Accrue", async () => {
        await cauldronProgram.methods.accrue()
            .accounts({
                totalData: cauldron.getTotalDataPda(),
                authority: depositerBob.publicKey,
                cauldronAccount: cauldron.getCauldronAccount(),
            }).signers([depositerBob]).rpc();

        const _cauldronAcc = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        const _accrueInfo = _cauldronAcc.accrueInfo;

        assert.notOk(_accrueInfo.lastAccrued.eqn(0));
        assert.ok(_accrueInfo.feesEarned.eqn(0));
        assert.ok(_accrueInfo.interestPerSecond.eqn(10000));

    });
});
