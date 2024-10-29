import * as anchor from '@coral-xyz/anchor';
import { Program, BN, AnchorError } from '@coral-xyz/anchor';
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Token } from "@solana/spl-token";
import { assert } from "chai";

import * as common from "../../common/common";
import { Bentobox } from "../../common/bentobox"
import { getBentoboxStrategyDataAddress } from "../../common/bentobox_pda_helper";

describe('Bentobox strategy data', () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;

    const bentobox_idl = require("../../../target/idl/bentobox.json");

    let bentobox = new Bentobox();
    let mint: Token = null;
    const bentoboxOwner = Keypair.generate();

    let strategy_data_key: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner]);

        mint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );
        // create bentobox
        await bentobox.create(bentoboxOwner);
    });

    it("Create strategy data", async () => {
        // create strategy data    
        const [_strategy_data_key, _strategy_data_nonce] = await getBentoboxStrategyDataAddress(
            bentobox.getBentoboxAccount(),
            mint.publicKey,
            bentoboxProgram.programId
        );
        strategy_data_key = _strategy_data_key

        await bentoboxProgram.methods.createStrategyData()
            .accounts({
                strategyData: _strategy_data_key,
                authority: bentoboxOwner.publicKey,
                mint: mint.publicKey,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                systemProgram: SystemProgram.programId,
            }).signers([bentoboxOwner])
            .rpc()
    });

    it("Set strategy percentage", async () => {
        await bentoboxProgram.methods.setStrategyTargetPercentage(new BN(10))
            .accounts({
                strategyData: strategy_data_key,
                bentoboxAccount: bentobox.getBentoboxAccount(),
                mint: mint.publicKey,
                authority: bentoboxOwner.publicKey,
            }).signers([bentoboxOwner]).rpc()

        let strategy_data = await bentoboxProgram.account.strategyData.fetch(strategy_data_key);
        assert.ok(strategy_data.targetPercentage.toNumber() == 10);

        try {
            await bentoboxProgram.methods.setStrategyTargetPercentage(new BN(97))
                .accounts({
                    strategyData: strategy_data_key,
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    mint: mint.publicKey,
                    authority: bentoboxOwner.publicKey,
                }).signers([bentoboxOwner]).rpc()
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "StrategyTargetPercentageTooHigh");
            let error = await common.getErrorInfo(bentobox_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }
    });
});