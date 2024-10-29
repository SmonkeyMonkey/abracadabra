import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { Keypair } from "@solana/web3.js";
import { SwitchboardTestContext } from "@switchboard-xyz/solana.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";
import { TEST_PRICE, DEVNET_URL, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src"

import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Switchboard price", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    let switchboard: SwitchboardTestContext;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();

    const tokensOwner = Keypair.generate();
    const cauldronOwner = Keypair.generate();
    const someAccount = Keypair.generate();

    let mimMint: Token = null;
    let collateralMint: Token = null;

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

        mimMint = await common.createMintAccount(
            connection,
            tokensOwner,
            tokensOwner.publicKey,
            0
        );

        collateralMint = await common.createMintAccount(
            connection,
            cauldronOwner,
            cauldronOwner.publicKey,
            0
        );

        // create bentobox
        await bentobox.create(tokensOwner);

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)

    });

    it("Get price", async () => {
        // try to get price from incompatible feed account (differ than in cauldron)
        try {
            await cauldronProgram.methods.switchboardPrice().accounts({
                switchboardDataFeed: someAccount.publicKey,
                cauldronAccount: cauldron.getCauldronAccount()
            }).rpc();

        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "IncompatibleSwitchboardDataFeed");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }

        // LpOrca_USDC_USDT/USD 
        let listener = null;
        let [event, slot] = await new Promise((resolve, _reject) => {
            listener = cauldronProgram.addEventListener("LogSwitchboardPrice", (event, slot) => {
                resolve([event, slot]);
            });

            cauldronProgram.methods.switchboardPrice().accounts({
                switchboardDataFeed: TEST_PRICE,
                cauldronAccount: cauldron.getCauldronAccount()
            }).rpc({ commitment: "confirmed" });
        });
        await cauldronProgram.removeEventListener(listener);

        let mantissa = new BN(event.mantissa)
        let scale = event.scale

        assert.isAbove(slot, 0);
        assert.strictEqual(scale, 9);

        console.log("Mantissa: ", mantissa.toString())
        console.log("Scale: ", scale)
    });
});