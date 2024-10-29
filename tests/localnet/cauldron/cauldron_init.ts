import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import { Bentobox } from "../../common/bentobox"

import { TEST_PRICE } from "../../common/src";
import { INTEREST_PER_SECOND, DISTRIBUTION_PART, STALE_AFTER_SLOTS_ELAPSED, LIQUIDATION_MULTIPLIER, LIQUIDATION_MULTIPLIER_PRECISION, BORROW_OPENING_FEE, BORROW_OPENING_FEE_PRECISION, COLLATERIZATION_RATE, COLLATERIZATION_RATE_PRECISION, ONE_PERCENT_RATE, DISTRIBUTION_PRECISION, U64_MAX, COMPLETE_LIQUIDATION_DURATION } from "../../common/src/constants";


import {
    AggregatorAccount,
    SwitchboardProgram,
  } from "@switchboard-xyz/solana.js";
  
describe("Cauldron init", () => {
    // const provider = common.getAnchorProvider();
    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    let cauldron = Keypair.generate();
    let bentobox = new Bentobox();

    let switchboard: SwitchboardProgram;
    let aggregatorAccount: AggregatorAccount;
  
    before(async () => {
        switchboard = await SwitchboardProgram.fromProvider(provider);
        aggregatorAccount = new AggregatorAccount(switchboard, TEST_PRICE);
    });

    const bentoboxOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    it("Cauldron initialized!", async () => {
        let delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(5 * 1000);
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

        await cauldronProgram.methods.initialize(INTEREST_PER_SECOND, COLLATERIZATION_RATE, COLLATERIZATION_RATE_PRECISION, LIQUIDATION_MULTIPLIER, LIQUIDATION_MULTIPLIER_PRECISION, DISTRIBUTION_PART, DISTRIBUTION_PRECISION, STALE_AFTER_SLOTS_ELAPSED, cauldronOwner.publicKey, BORROW_OPENING_FEE, BORROW_OPENING_FEE_PRECISION, ONE_PERCENT_RATE, COMPLETE_LIQUIDATION_DURATION)
            .accounts({
                cauldronAccount: cauldron.publicKey,
                magicInternetMoney: mimMint.publicKey,
                collateral: collateralMint.publicKey,
                switchboardDataFeed: aggregatorAccount.publicKey,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                authority: cauldronOwner.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([cauldronOwner, cauldron])
            .rpc();

        const _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.publicKey);
        assert.ok(_cauldron.authority.equals(cauldronOwner.publicKey));
        assert.ok(_cauldron.constants.collaterizationRate.toString() == COLLATERIZATION_RATE.toString());
        assert.ok(_cauldron.constants.collaterizationRatePrecision.toString() == COLLATERIZATION_RATE_PRECISION.toString());
        assert.ok(_cauldron.constants.liquidationMultiplier.toString() == LIQUIDATION_MULTIPLIER.toString());
        assert.ok(_cauldron.constants.liquidationMultiplierPrecision.toString() == LIQUIDATION_MULTIPLIER_PRECISION.toString());
        assert.ok(_cauldron.constants.distributionPart.toString() == DISTRIBUTION_PART.toString());
        assert.ok(_cauldron.constants.distributionPrecision.toString() == DISTRIBUTION_PRECISION.toString());
        assert.ok(_cauldron.borrowLimit.total.toString() == U64_MAX.toString());
        assert.ok(_cauldron.borrowLimit.borrowPartPerAddress.toString() == U64_MAX.toString());
        assert.ok(_cauldron.constants.staleAfterSlotsElapsed.toString() == STALE_AFTER_SLOTS_ELAPSED.toString());
        assert.ok(_cauldron.accrueInfo.interestPerSecond.toString() == INTEREST_PER_SECOND.toString());
        assert.ok(_cauldron.feeTo.equals(cauldronOwner.publicKey));
        assert.ok(_cauldron.constants.borrowOpeningFee.toString() == BORROW_OPENING_FEE.toString());
        assert.ok(_cauldron.constants.borrowOpeningFeePrecision.toString() == BORROW_OPENING_FEE_PRECISION.toString());
        assert.ok(_cauldron.switchboardDataFeed.equals(TEST_PRICE));
        assert.ok(_cauldron.bentobox.equals(bentobox.getBentoboxAccount()));
        assert.ok(_cauldron.bentoboxProgram.equals(bentoboxProgram.programId));
        assert.ok(_cauldron.collateral.equals(collateralMint.publicKey));
        assert.ok(_cauldron.magicInternetMoney.equals(mimMint.publicKey));
        assert.ok(_cauldron.constants.completeLiquidationDuration.toString() == COMPLETE_LIQUIDATION_DURATION.toString());
    });
});
