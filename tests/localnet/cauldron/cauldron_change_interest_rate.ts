import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Keypair } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

import { ONE_PERCENT_RATE, INTEREST_PER_SECOND, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src/constants";

describe("Change interest rate", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

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


    it("Cauldron: change interest rate", async () => {
        let _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.lastInterestUpdate.toString() == "0");
        assert.ok(_cauldron.accrueInfo.interestPerSecond.toString() == INTEREST_PER_SECOND.toString());

        // try to sign with non cauldron owner
        try {
            await cauldronProgram.methods.changeInterestRate(new BN(200000))
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

        // try to сhange for not valid new rate
        // not valid condition: new_interest_rate >= old_interest_rate + old_interest_rate * 3 / 4 && new_interest_rate > ONE_PERCENT_RATE
        try {
            await cauldronProgram.methods.changeInterestRate(new BN(ONE_PERCENT_RATE.toNumber() + 1))
                .accounts({
                    cauldronAccount: cauldron.getCauldronAccount(),
                    authority: cauldronOwner.publicKey,
                })
                .signers([cauldronOwner])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "NotValidInterestRate");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // change borrow limit with right signer (authority of Cauldron account - cauldronOwner)
        await cauldronProgram.methods.changeInterestRate(new BN(200000))
            .accounts({
                cauldronAccount: cauldron.getCauldronAccount(),
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc();

        _cauldron = await cauldronProgram.account.cauldron.fetch(cauldron.getCauldronAccount());
        assert.ok(_cauldron.accrueInfo.interestPerSecond.toString() == "200000");
        // such check cause waste some seconds for test running    
        assert.ok(_cauldron.lastInterestUpdate.toNumber() < Date.now() / 1000  // Date.now() in miliseconds
            && _cauldron.lastInterestUpdate.toNumber() > Date.now() / 10000)

        // try to сhange interest rate too soon
        try {
            await cauldronProgram.methods.changeInterestRate(new BN(200000))
                .accounts({
                    cauldronAccount: cauldron.getCauldronAccount(),
                    authority: cauldronOwner.publicKey,
                })
                .signers([cauldronOwner])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "TooSoonToUpdateInterestRate");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }
    });
});