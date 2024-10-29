import * as anchor from '@coral-xyz/anchor';
import { assert } from "chai";
import { Blockchain } from './blockchain';
import { Bentobox as BentoboxProgram } from '../../../target/types/bentobox';
import { Program, BN } from "@coral-xyz/anchor"
import { Bentobox } from "../../common/bentobox";
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

import * as common from "../../common/common";

describe('bentobox devnet', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const bentoboxProgram = anchor.workspace.Bentobox as Program<BentoboxProgram>;
  const bentobox_idl = require("../../../target/idl/bentobox.json");
  
  // let bentoboxOwner = Keypair.generate();
  let bentoboxOwner = Keypair.fromSecretKey(Uint8Array.from([143,95,182,224,250,44,24,103,138,32,67,140,119,251,149,211,114,141,22,85,208,176,220,160,36,185,148,49,130,6,93,107,160,93,254,39,188,252,12,238,41,157,189,155,203,8,81,3,48,103,29,238,161,130,26,213,33,69,151,231,40,146,157,121]));
  // const strategyMockOwner = Keypair.generate();
  const strategyMockOwner = Keypair.fromSecretKey(Uint8Array.from([107,144,208,167,198,87,176,251,14,79,145,148,60,178,0,107,90,30,228,8,140,173,5,185,72,73,199,88,190,65,210,251,153,60,224,100,18,94,22,26,106,109,207,59,188,11,130,242,11,58,234,218,241,133,119,91,95,196,19,244,183,103,58,236]));
  let bentobox = new Bentobox();


  before(async () => {
    
    // await common.batchAirdrop(connection, [strategyMockOwner]);

    // console.log("Airdrop 2 SOL ...")
    await common.requestAirdrop(connection, LAMPORTS_PER_SOL * 2, bentoboxOwner)
    
    // create bentobox
    await bentobox.create(bentoboxOwner);
  });
  
  // run this test on devnet with devnet cluster and devnet wallet
  it('flash loan', async () => {
    let blockchain = new Blockchain(connection);
    await blockchain.initLendingMarket();
    await blockchain.initReserve(blockchain.token, 100, 40);
    await blockchain.initObligation();
    
    // create total vault for mint
    await bentobox.createVault(blockchain.token.mint.publicKey, bentoboxOwner);
    // create strategy data account for mint token
    await bentobox.createStrategyData(blockchain.token.mint.publicKey)
    await bentobox.setStrategyTargetPercentage(new BN(10), blockchain.token.mint.publicKey)

    await blockchain.setTokenHost(bentobox.getTotalVaultPda(blockchain.token.mint.publicKey));
    await blockchain.calcAndPrintMetrics();

    //check user lost tokens
    assert.equal(blockchain.metrics.tokenAUserBalance.value.uiAmount, 60); //100 - 40
    // check protocol gained tokens
    assert.equal(blockchain.metrics.tokenAProtocolBalance.value.uiAmount, 40);
    // check user was issued LP tokens in return
    assert.equal(blockchain.metrics.tokenALPUserBalance.value.uiAmount, 40);
    // check total liquidity available
    // @ts-ignore
    assert.equal(blockchain.metrics.reserveAState.data.liquidity.availableAmount, 40n);

    //--------------------------------------- depositing liquidity

    await blockchain.depositReserveLiquidity(blockchain.token, 10);
    await blockchain.calcAndPrintMetrics();

    //check changes in balances add up
    assert.equal(blockchain.metrics.tokenAUserBalance.value.uiAmount, 50); //60 - 10
    assert.equal(blockchain.metrics.tokenAProtocolBalance.value.uiAmount, 50); //40 + 10

    //--------------------------------------- flash loan

    const oldBorrowedAmount = blockchain.metrics.obligState.data.borrowedValue.toNumber();
    const oldProtocolFee = blockchain.metrics.tokenAProtocolFeeBalance.value.uiAmount;

    await blockchain.borrowFlashLoan(bentoboxProgram, bentobox, blockchain.token, 10);
    await blockchain.calcAndPrintMetrics();

    //check that fees went up, but the borrowed amount stayed the same
    assert.equal(blockchain.metrics.obligState.data.borrowedValue.toNumber(), oldBorrowedAmount);
    assert.isAbove(blockchain.metrics.tokenAProtocolFeeBalance.value.uiAmount, oldProtocolFee);
    assert.equal(blockchain.metrics.tokenAHostBalance.value.uiAmount, 1);

    const tokenTotalInfoAccount = await bentoboxProgram.account.total.fetch(bentobox.getTotalDataPda(blockchain.token.mint.publicKey));
    assert.equal(tokenTotalInfoAccount.amount["elastic"].toString(), "1");
  });
});
