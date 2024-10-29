import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Keypair } from "@solana/web3.js";
import { SwitchboardTestContext } from "@switchboard-xyz/solana.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import { TEST_PRICE, DEVNET_URL, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src"
import * as common from "../../common/common";
import * as borsh from "borsh";

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Check switchboard price", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    let switchboard: SwitchboardTestContext;

    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;
    
    const cauldron_idl = require("../../../target/idl/cauldron.json");

    const tokensOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const someAccount = Keypair.generate();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    before(async () => {
        if (connection.rpcEndpoint == DEVNET_URL) {
            // load the switchboard devnet PID
            try {
                // switchboard = await SwitchboardTestContext.loadDevnetQueue(provider);
                switchboard = await SwitchboardTestContext.load(connection)
                console.log("devnet detected");
            } catch (error: any) {
                console.log(`Error: SBV2 Devnet - ${error.message}`);
            }
        }

        await common.batchAirdrop(connection, [tokensOwner, cauldronOwner]);

        collateralMint = await common.createMintAccount(
            connection,
            cauldronOwner,
            tokensOwner.publicKey,
            0
        );
        mimMint = await common.createMintAccount(
            connection,
            cauldronOwner,
            tokensOwner.publicKey,
            0
        );

        // create bentobox
        await bentobox.create(tokensOwner);

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)

    });

    it("Is valid price", async () => {
        // try to get price from incompatible feed account (differ than in cauldron)
        let min_rate = 0.1;
        let max_rate = 13

        try {
            await cauldronProgram.methods.isValidPrice(min_rate, max_rate)
                .accounts({
                    switchboardDataFeed: someAccount.publicKey,
                    cauldronAccount: cauldron.getCauldronAccount(),
                }).rpc();

        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "IncompatibleSwitchboardDataFeed");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // try to check price with always wrong min and max rates
        let wrong_max_rate = 0.2;

        let tx = await cauldronProgram.methods.isValidPrice(min_rate, wrong_max_rate)
            .accounts({
                switchboardDataFeed: TEST_PRICE,
                cauldronAccount: cauldron.getCauldronAccount(),
            })
            .rpc({ commitment: "confirmed" })
        let t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        let [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, cauldronProgram.programId.toString());

        let reader = new borsh.BinaryReader(buffer);
        let result = !!reader.readU8();
        assert.ok(!result);


        // for now price is definately between 0.1 and 13
        tx = await cauldronProgram.methods.isValidPrice(min_rate, max_rate)
            .accounts({
                switchboardDataFeed: TEST_PRICE,
                cauldronAccount: cauldron.getCauldronAccount()
            })
            .rpc({ commitment: "confirmed" })
        t = await provider.connection.getTransaction(tx, {
            commitment: "confirmed",
        });

        [key, data, buffer] = common.getLastReturnLog(t);
        assert.equal(key, cauldronProgram.programId.toString());

        reader = new borsh.BinaryReader(buffer);
        result = !!reader.readU8();
        assert.ok(result);
    });
});