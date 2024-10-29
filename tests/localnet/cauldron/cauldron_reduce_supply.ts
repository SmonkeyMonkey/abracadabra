import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { Cauldron as CauldronProgram } from "../../../target/types/cauldron";
import { Bentobox as BentoboxProgram } from "../../../target/types/bentobox";
import { PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { assert } from "chai";
import * as common from "../../common/common";

import { TEST_PRICE, COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED } from "../../common/src";
import { Bentobox } from "../../common/bentobox"
import { Cauldron } from "../../common/cauldron"

describe("Reduce supply", () => {
    // const provider = common.getAnchorProvider();
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;

    const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
    const cauldronProgram = anchor.workspace.Cauldron as Program<CauldronProgram>;

    const cauldron_idl = require("../../../target/idl/cauldron.json");

    let cauldron = new Cauldron();
    let bentobox = new Bentobox();
    let cauldron_v2 = new Cauldron();
    let bentobox_v2 = new Bentobox();

    let mimMint: Token = null;
    let collateralMint: Token = null;

    const cauldronOwner = Keypair.generate();
    const bentoboxOwner = Keypair.generate();
    const Bob = Keypair.generate();

    let BobTokenAccount: PublicKey = null;
    let cauldronOwnerTokenAccount: PublicKey = null;

    before(async () => {
        await common.batchAirdrop(connection, [bentoboxOwner, Bob, cauldronOwner]);

        mimMint = await common.createMintAccount(
            connection,
            cauldronOwner,
            cauldronOwner.publicKey,
            0
        );

        collateralMint = await common.createMintAccount(
            connection,
            bentoboxOwner,
            bentoboxOwner.publicKey,
            0
        );

        // create token account for Bob on MIM token
        BobTokenAccount = await common.createAndFundUserAccount(
            Bob.publicKey,
            cauldronOwner,
            mimMint,
            2000
        );

        // create token account for Bob on MIM token
        cauldronOwnerTokenAccount = await common.createAndFundUserAccount(
            cauldronOwner.publicKey,
            cauldronOwner,
            mimMint,
            2000
        );

        // create bentobox
        await bentobox.create(bentoboxOwner);
        // create bentobox_v2
        await bentobox_v2.create(bentoboxOwner);
        // create total vault for MIM
        await bentobox.createVault(mimMint.publicKey, cauldronOwner);
        // create strategy data account for MIM token
        await bentobox.createStrategyData(mimMint.publicKey)

        // initialize cauldron account        
        await cauldron.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        // initialize cauldron_v2 account        
        await cauldron_v2.initialize(cauldronOwner, mimMint.publicKey, collateralMint.publicKey, TEST_PRICE, bentobox.getBentoboxAccount(), COLLATERIZATION_RATE_PRECISION, STALE_AFTER_SLOTS_ELAPSED)
        //register cauldron to bentobox as master contract
        await bentobox.createMasterContractWhitelist(cauldron.getCauldronAccount(), cauldron.getCauldronProgram())
        // create bentobox approval account for Bob 
        await bentobox.createMasterContractApproval(Bob, cauldron.getCauldronAccount(), cauldron.getCauldronProgram())

        // 1) approve using web3
        // await mimMint.approve(BobTokenAccount, cauldron.getCauldronAuthority(), Bob.publicKey, [Bob], Number.MAX_VALUE);
        // 2) approve using approve_cauldron instruction
        await cauldron.approveToCauldron(BobTokenAccount, Bob);

        await bentobox.createBalance(cauldron.getCauldronAuthority(), mimMint.publicKey, cauldronOwner)

        // deposited to bentobox from Bob
        await cauldronProgram.methods.bentoDeposit(cauldron.getCauldronAuthority(), new BN(2000), new BN(0))
            .accounts({
                fromVault: BobTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                bentoboxToBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                bentoboxStrategyData: bentobox.getStrategyDataPda(mimMint.publicKey),
                mint: mimMint.publicKey,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                masterContractApproved: bentobox.getMasterContractApprovedPda(Bob.publicKey, cauldron.getCauldronAccount()),
                masterContractWhitelisted: bentobox.getMasterContractWhitelistedPda(cauldron.getCauldronAccount()),
                authority: Bob.publicKey,
            })
            .signers([Bob])
            .rpc();
    });

    it("Reduce supply", async () => {
        // try to reduce supply by random signer
        try {
            await cauldronProgram.methods.reduceSupply(new BN(1000))
                .accounts({
                    cauldronOwnerVault: BobTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    authority: Bob.publicKey,
                })
                .signers([Bob])
                .rpc();
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintHasOne");
            assert.strictEqual(err.error.errorMessage, "A has one constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2001);
        }

        // try to reduce supply with incorrect bentobox account
        try {
            await cauldronProgram.methods.reduceSupply(new BN(1000))
                .accounts({
                    cauldronOwnerVault: cauldronOwnerTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                    bentoboxAccount: bentobox_v2.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    authority: cauldronOwner.publicKey,
                })
                .signers([cauldronOwner])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidBentoboxAccount");
            let error = await common.getErrorInfo(cauldron_idl, err.error.errorCode.code);
            assert.strictEqual(err.error.errorMessage, error.errorMsg);
            assert.strictEqual(err.error.errorCode.number, error.errorCode);
        }
        // try to reduce supply with incorrect bentobox program
        try {
            await cauldronProgram.methods.reduceSupply(new BN(1000))
                .accounts({
                    cauldronOwnerVault: cauldronOwnerTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: cauldronProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    authority: cauldronOwner.publicKey,
                })
                .signers([cauldronOwner])
                .rpc();
        } catch (_err) {
            assert.isTrue(_err instanceof AnchorError);
            const err: AnchorError = _err;

            assert.strictEqual(err.error.errorCode.code, "InvalidProgramId");
            assert.strictEqual(err.error.errorMessage, "Program ID was not as expected");
            assert.strictEqual(err.error.errorCode.number, 3008);
        }

        try {
            // reduce supply using wrong cauldron_v2_authority
            await cauldronProgram.methods.reduceSupply(new BN(1000))
                .accounts({
                    cauldronOwnerVault: cauldronOwnerTokenAccount,
                    bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                    cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                    bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                    bentoboxAccount: bentobox.getBentoboxAccount(),
                    bentoboxProgram: bentoboxProgram.programId,
                    cauldronAccount: cauldron.getCauldronAccount(),
                    tokenProgram: TOKEN_PROGRAM_ID,
                    cauldronAuthority: cauldron_v2.getCauldronAuthority(),
                    bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                    authority: cauldronOwner.publicKey,
                })
                .signers([cauldronOwner])
                .rpc();
        } catch (err) {
            assert.strictEqual(err.error.errorCode.code, "ConstraintSeeds");
            assert.strictEqual(err.error.errorMessage, "A seeds constraint was violated");
            assert.strictEqual(err.error.errorCode.number, 2006);
        }

        // try to reduce supply by cauldronOwner
        let total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        assert.ok(total.amount["base"].toString() == "2000");
        assert.ok(total.amount["elastic"].toString() == "2000");
        let balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey));
        assert.ok(balance.amount.toString() == "2000");

        let cauldron_owner_token_acc = await mimMint.getAccountInfo(cauldronOwnerTokenAccount);
        assert.ok(cauldron_owner_token_acc.amount.toString() == "2000");

        await cauldronProgram.methods.reduceSupply(new BN(1000))
            .accounts({
                cauldronOwnerVault: cauldronOwnerTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc();

        total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        assert.ok(total.amount["base"].toString() == "1000");
        assert.ok(total.amount["elastic"].toString() == "1000");
        balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey));
        assert.ok(balance.amount.toString() == "1000");

        cauldron_owner_token_acc = await mimMint.getAccountInfo(cauldronOwnerTokenAccount);
        assert.ok(cauldron_owner_token_acc.amount.toString() == "3000");

        // try to reduce supply by max value
        await cauldronProgram.methods.reduceSupply(new BN(1500))
            .accounts({
                cauldronOwnerVault: cauldronOwnerTokenAccount,
                bentoboxVault: bentobox.getTotalVaultPda(mimMint.publicKey),
                cauldronBentoboxBalance: bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey),
                bentoboxTotalData: bentobox.getTotalDataPda(mimMint.publicKey),
                bentoboxAccount: bentobox.getBentoboxAccount(),
                bentoboxProgram: bentoboxProgram.programId,
                cauldronAccount: cauldron.getCauldronAccount(),
                tokenProgram: TOKEN_PROGRAM_ID,
                cauldronAuthority: cauldron.getCauldronAuthority(),
                bentoboxVaultAuthority: bentobox.getBentoboxAuthority(),
                authority: cauldronOwner.publicKey,
            })
            .signers([cauldronOwner])
            .rpc();

        total = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(mimMint.publicKey));
        assert.ok(total.amount["base"].toString() == "0");
        assert.ok(total.amount["elastic"].toString() == "0");
        balance = await bentoboxProgram.account.balance.fetch(bentobox.getBalancePda(cauldron.getCauldronAuthority(), mimMint.publicKey));
        assert.ok(balance.amount.toString() == "0");

        cauldron_owner_token_acc = await mimMint.getAccountInfo(cauldronOwnerTokenAccount);
        assert.ok(cauldron_owner_token_acc.amount.toString() == "4000");
    });
});