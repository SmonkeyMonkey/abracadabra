import {
  Connection,
  Keypair,
  PublicKey
} from '@solana/web3.js';
import {
  depositObligationCollateralInstruction,
  depositReserveLiquidityInstruction,
  initLendingMarketInstruction,
  initObligationInstruction,
  initReserveInstruction,
  LENDING_MARKET_SIZE,
  LENDING_PROGRAM_ID,
  OBLIGATION_SIZE,
  parseReserve,
  refreshObligationInstruction,
  refreshReserveInstruction,
  RESERVE_SIZE,
  ReserveConfig,
  ReserveFees,
  WAD_BigInt,
  parseObligation,
} from '../../common/src';
import {
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import * as common from "../../common/common";

import { Program, BN } from "@coral-xyz/anchor";

import { Bentobox as BentoboxProgram } from '../../../target/types/bentobox';
import { Bentobox } from "../../common/bentobox"

// ============================================================================= bc class
interface IToken {
  currency: string,
  //mint & accounts
  mint: Token,
  userPk: PublicKey,
  hostPk: PublicKey,
  protocolKp: Keypair,
  //LP token
  lpMintKp: Keypair,
  lpUserKp: Keypair,
  lpProtocolKp: Keypair,
  feeReceiverKp: Keypair,
  //pyth,
  pythProductPk: PublicKey,
  pythPricePk: PublicKey,
  //reserve
  reserveKp: Keypair,
}

export class Blockchain {
  connection: Connection;

  FLASH_LOAN_PROGRAM_ID = new PublicKey("Cdy1ZrsWyWpSJbCzuvzCFaQnraDNZyPZ4am7udFsP2bU");

  lendingMarketOwnerKp: Keypair = null;
  lendingMarketKp: Keypair = new Keypair();
  lendingMarketAuthority: PublicKey;
  obligationKp: Keypair = new Keypair();
  obligationDeposits: PublicKey[] = [];
  obligationBorrows: PublicKey[] = [];

  token: IToken = {
    currency: 'BTC',
    mint: null,
    userPk: null,
    hostPk: null,
    protocolKp: new Keypair(),
    feeReceiverKp: new Keypair(),
    lpMintKp: new Keypair(),
    lpUserKp: new Keypair(),
    lpProtocolKp: new Keypair(),
    // pythProductPk: new PublicKey('2ciUuGZiee5macAMeQ7bHGTJtwcYTgnt6jdmQnnKZrfu'),
    pythProductPk: new PublicKey('3Mnn2fX6rQyUsyELYms1sBJyChWofzSNRoqYzvgMVz5E'),
    // pythPricePk: new PublicKey('EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw'),
    pythPricePk: new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix'),
    // pythPricePk: new PublicKey('42amVS4KgzR9rA28tkVYqVXjq9Qa8dcZQMbH5EYFX6XC'),
    reserveKp: new Keypair(),
  };

  //these are needed for printing and testing
  metrics = {
    //token A
    tokenAUserBalance: null,
    tokenAHostBalance: null,
    tokenAProtocolBalance: null,
    tokenAProtocolFeeBalance: null,
    tokenALPUserBalance: null,
    tokenALPProtocolBalance: null,
    //obligation
    obligState: null,
    //reserve A
    reserveAState: null,
    //reserve B
    reserveBState: null,
  }

  constructor(connection: Connection) {
    this.connection = connection;
  }

  // --------------------------------------- init lending market

  async initLendingMarket() {
    this.lendingMarketOwnerKp = await common.newAccountWithLamports(this.connection);

    console.log('create & initiate lending market');
    const createLendingMarketAccIx = await common.generateCreateStateAccIx(this.lendingMarketOwnerKp.publicKey,
      this.lendingMarketKp.publicKey,
      LENDING_MARKET_SIZE,
      this.connection
    );

    const quoteCurrency = Buffer.alloc(32);
    quoteCurrency.write('USD');
    const initLendingMarketIx = initLendingMarketInstruction(
      this.lendingMarketOwnerKp.publicKey,
      quoteCurrency,
      this.lendingMarketKp.publicKey,
    );

    await common.prepareAndSendTx(
      [createLendingMarketAccIx, initLendingMarketIx],
      [this.lendingMarketOwnerKp, this.lendingMarketKp],
      this.connection
    );
  }

  // ======================================= RESERVE (SUPPLY SIDE)
  // --------------------------------------- init reserve

  async initReserve(token: IToken, mintAmount: number, initAmount: number) {
    console.log(`prepare ${token.currency} accounts`);
    //init'ed client-side
    token.mint = await common.createMintAccount(this.connection, this.lendingMarketOwnerKp, this.lendingMarketOwnerKp.publicKey, 0);
    token.userPk = await common.createAndFundUserAccount(this.lendingMarketOwnerKp.publicKey, this.lendingMarketOwnerKp, token.mint, mintAmount);

    //init'ed bentoboxProgram-side, hence we only create the raw accounts
    const createProtocolAccIx = await common.generateCreateTokenAccIx(this.lendingMarketOwnerKp.publicKey, token.protocolKp.publicKey, this.connection);
    const createProtocolFeeAccIx = await common.generateCreateTokenAccIx(this.lendingMarketOwnerKp.publicKey, token.feeReceiverKp.publicKey, this.connection);
    const createLpMintAccIx = await common.generateCreateTokenMintIx(this.lendingMarketOwnerKp.publicKey, token.lpMintKp.publicKey, this.connection);
    const createLpUserAccIx = await common.generateCreateTokenAccIx(this.lendingMarketOwnerKp.publicKey, token.lpUserKp.publicKey, this.connection);
    const createLpProtocolAccIx = await common.generateCreateTokenAccIx(this.lendingMarketOwnerKp.publicKey, token.lpProtocolKp.publicKey, this.connection);

    const ix = [
      createProtocolAccIx,
      createProtocolFeeAccIx,
      createLpMintAccIx,
      createLpUserAccIx,
      createLpProtocolAccIx,
    ];
    const signers = [
      this.lendingMarketOwnerKp,
      token.protocolKp,
      token.feeReceiverKp,
      token.lpMintKp,
      token.lpUserKp,
      token.lpProtocolKp,
    ];
    await common.prepareAndSendTx(ix, signers, this.connection);

    console.log(`create & initiate ${token.currency} reserve`);
    const createReserveAccIx = await common.generateCreateStateAccIx(
      this.lendingMarketOwnerKp.publicKey,
      token.reserveKp.publicKey,
      RESERVE_SIZE,
      this.connection
    );
    const reserveConfig = Blockchain._generateStandardReserveConfig();

    //when we FIND the pda, we only pass OUR seed, not the bump seed
    let nonce;
    [this.lendingMarketAuthority, nonce] = PublicKey.findProgramAddressSync(
      [this.lendingMarketKp.publicKey.toBuffer()],
      LENDING_PROGRAM_ID,
    );

    
    const initReserveIx = initReserveInstruction(
      initAmount,
      reserveConfig,
      token.userPk,
      token.lpUserKp.publicKey,
      token.reserveKp.publicKey,
      token.mint.publicKey,
      token.protocolKp.publicKey,
      token.feeReceiverKp.publicKey,
      token.pythProductPk,
      token.pythPricePk,
      token.lpMintKp.publicKey,
      token.lpProtocolKp.publicKey,
      this.lendingMarketKp.publicKey,
      this.lendingMarketAuthority,
      this.lendingMarketOwnerKp.publicKey,
      this.lendingMarketOwnerKp.publicKey,
    );

    let slot = await this.connection.getSlot();
    console.log('current slot-----',slot);
    
    await common.prepareAndSendTx(
      [createReserveAccIx, initReserveIx],
      [this.lendingMarketOwnerKp, token.reserveKp],
      this.connection
    );
  }

  // --------------------------------------- deposit liquidity

  async depositReserveLiquidity(token: IToken, depositLiquidityAmount: number) {
    console.log(`deposit liquidity for ${token.currency}`);
    const refreshReserveIx = refreshReserveInstruction(
      token.reserveKp.publicKey,
      token.pythPricePk,
    );
    const depositReserveLiqIx = depositReserveLiquidityInstruction(
      depositLiquidityAmount,
      token.userPk,
      token.lpUserKp.publicKey,
      token.reserveKp.publicKey,
      token.protocolKp.publicKey,
      token.lpMintKp.publicKey,
      this.lendingMarketKp.publicKey,
      this.lendingMarketAuthority,
      this.lendingMarketOwnerKp.publicKey,
    );
    await common.prepareAndSendTx(
      [refreshReserveIx, depositReserveLiqIx],
      [this.lendingMarketOwnerKp],
      this.connection
    );
  }

  // ======================================= OBLIGATION (BORROW SIDE)
  // --------------------------------------- init obligation

  async initObligation() {
    console.log('create & initiate obligation');
    const createObligAccIx = await common.generateCreateStateAccIx(
      this.lendingMarketOwnerKp.publicKey,
      this.obligationKp.publicKey,
      OBLIGATION_SIZE,
      this.connection
    );
    const initObligIx = initObligationInstruction(
      this.obligationKp.publicKey,
      this.lendingMarketKp.publicKey,
      this.lendingMarketOwnerKp.publicKey,
    );
    await common.prepareAndSendTx(
      [createObligAccIx, initObligIx],
      [this.lendingMarketOwnerKp, this.obligationKp],
      this.connection
    );
  }

  // --------------------------------------- deposit collateral into obligation

  async depositObligationCollateral(token: IToken, depositCollateralAmount: number) {
    console.log(`deposit ${token.currency} collateral into obligation`);
    await this._refreshObligDepositsAndBorrows();
    const refreshReserveIx = refreshReserveInstruction(
      token.reserveKp.publicKey,
      token.pythPricePk,
    );
    const refreshObligIx = refreshObligationInstruction(
      this.obligationKp.publicKey,
      this.obligationDeposits,
      this.obligationBorrows,
    );
    const depositObligColIx = depositObligationCollateralInstruction(
      depositCollateralAmount,
      token.lpUserKp.publicKey,
      token.lpProtocolKp.publicKey,
      token.reserveKp.publicKey,
      this.obligationKp.publicKey,
      this.lendingMarketKp.publicKey,
      this.lendingMarketOwnerKp.publicKey,
      this.lendingMarketOwnerKp.publicKey,
    );
    await common.prepareAndSendTx(
      [refreshReserveIx, refreshObligIx, depositObligColIx],
      [this.lendingMarketOwnerKp],
      this.connection
    );
  }

  // --------------------------------------- set host PK for token

  async setTokenHost(hostPk: PublicKey) {
    this.token.hostPk = hostPk;
  }

  // --------------------------------------- flash loan

  async borrowFlashLoan(bentoboxProgram: Program<BentoboxProgram>, bentobox: Bentobox, token: IToken, liquidityAmount: number) {
    console.log(`borrow a flash loan for amount ${liquidityAmount}`);
    const refreshReserveIx = refreshReserveInstruction(
      token.reserveKp.publicKey,
      token.pythPricePk,
    );
    await common.prepareAndSendTx(
      [refreshReserveIx],
      [this.lendingMarketOwnerKp],
      this.connection
    );

    /**
     * Take flash loan using the CPI
     */
    try {
      const tx = await bentoboxProgram.methods.flashLoan(new BN(liquidityAmount))
        .accounts({
          lendingProgram: LENDING_PROGRAM_ID,
          sourceLiquidity: token.protocolKp.publicKey,
          destinationLiquidity: token.userPk,
          reserve: token.reserveKp.publicKey,
          flashLoanFeeReceiver: token.feeReceiverKp.publicKey,
          hostFeeReceiver: bentobox.getTotalVaultPda(this.token.mint.publicKey),
          lendingMarket: this.lendingMarketKp.publicKey,
          derivedLendingMarketAuthority: this.lendingMarketAuthority,
          bentoboxAccount: bentobox.getBentoboxAccount(),
          tokenProgram: TOKEN_PROGRAM_ID,
          flashLoanReceiver: this.FLASH_LOAN_PROGRAM_ID,
          authority: this.lendingMarketOwnerKp.publicKey,
          totalData: bentobox.getTotalDataPda(token.mint.publicKey),
          strategyData: bentobox.getStrategyDataPda(token.mint.publicKey),
        })
        .signers([this.lendingMarketOwnerKp]).rpc()
      console.log("Your transaction signature", tx);
    } catch (_err) {
      console.log(_err)
    }


  }

  // --------------------------------------- helpers

  static _generateStandardReserveConfig(): ReserveConfig {
    const reserveFees: ReserveFees = {
      // @ts-ignore
      borrowFeeWad: WAD_BigInt / 20n,
      // @ts-ignore
      flashLoanFeeWad: WAD_BigInt / 20n,
      hostFeePercentage: 20,
    };
    return {
      optimalUtilizationRate: 80,
      loanToValueRatio: 50,
      liquidationBonus: 3,
      liquidationThreshold: 80,
      minBorrowRate: 2,
      optimalBorrowRate: 8,
      maxBorrowRate: 15,
      fees: reserveFees,
    };
  }

  async _refreshObligDepositsAndBorrows() {
    const obligInfo = await this.connection.getAccountInfo(this.obligationKp.publicKey);
    const obligState = parseObligation(this.obligationKp.publicKey, obligInfo);
    this.obligationDeposits = obligState.data.deposits.map(d => d.depositReserve);
    this.obligationBorrows = obligState.data.borrows.map(d => d.borrowReserve);
  }

  async calcAndPrintMetrics() {
    console.log('// ---------------------------------------');
    // --------------------------------------- A token
    this.metrics.tokenAUserBalance = await this.connection.getTokenAccountBalance(this.token.userPk);
    this.metrics.tokenAHostBalance = this.token.hostPk ? await this.connection.getTokenAccountBalance(this.token.hostPk) : null;
    this.metrics.tokenAProtocolBalance = await this.connection.getTokenAccountBalance(this.token.protocolKp.publicKey);
    this.metrics.tokenAProtocolFeeBalance = await this.connection.getTokenAccountBalance(this.token.feeReceiverKp.publicKey);
    this.metrics.tokenALPUserBalance = await this.connection.getTokenAccountBalance(this.token.lpUserKp.publicKey);
    this.metrics.tokenALPProtocolBalance = await this.connection.getTokenAccountBalance(this.token.lpProtocolKp.publicKey);
    console.log(`A token (${this.token.currency}) balances:`);
    console.log(`  user account (${this.token.userPk.toBase58()}):`, this.metrics.tokenAUserBalance.value.uiAmount);
    console.log(`  host account (${this.token.hostPk ? this.token.hostPk.toBase58() : "Not created yet"}):`, this.metrics.tokenAHostBalance ? this.metrics.tokenAHostBalance.value.uiAmount : 0);
    console.log(`  protocol account (${this.token.protocolKp.publicKey.toBase58()}):`, this.metrics.tokenAProtocolBalance.value.uiAmount);
    console.log(`  protocol fee account (${this.token.feeReceiverKp.publicKey.toBase58()}):`, this.metrics.tokenAProtocolFeeBalance.value.uiAmount);
    console.log(`  user LP account (${this.token.lpUserKp.publicKey.toBase58()}):`, this.metrics.tokenALPUserBalance.value.uiAmount);
    console.log(`  protocol LP account (${this.token.lpProtocolKp.publicKey.toBase58()}):`, this.metrics.tokenALPProtocolBalance.value.uiAmount);

    // --------------------------------------- obligation state
    const obligInfo = await this.connection.getAccountInfo(this.obligationKp.publicKey);
    this.metrics.obligState = parseObligation(this.obligationKp.publicKey, obligInfo);
    console.log('Obligation state:');
    console.log('  total deposited value ($):', this.metrics.obligState.data.depositedValue.toNumber());
    console.log('  total borrowed value ($):', this.metrics.obligState.data.borrowedValue.toNumber());
    console.log('  allowed to borrow value ($):', this.metrics.obligState.data.allowedBorrowValue.toNumber());
    console.log('  unhealthy borrow value ($):', this.metrics.obligState.data.unhealthyBorrowValue.toNumber());

    // --------------------------------------- A reserve state
    const reserveAInfo = await this.connection.getAccountInfo(this.token.reserveKp.publicKey);
    this.metrics.reserveAState = parseReserve(this.token.reserveKp.publicKey, reserveAInfo);
    console.log(`A reserve (${this.token.currency}) state:`);
    console.log('  available liquidity', this.metrics.reserveAState.data.liquidity.availableAmount);
    console.log('  borrowed liquidity', this.metrics.reserveAState.data.liquidity.borrowedAmountWads.toString());
    console.log('  cumulative borrow rate', this.metrics.reserveAState.data.liquidity.cumulativeBorrowRateWads.toString());
    console.log('  market price', this.metrics.reserveAState.data.liquidity.marketPrice.toString());
  }
}
