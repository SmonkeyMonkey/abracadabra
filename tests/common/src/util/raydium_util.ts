import { AccountInfo, Connection, Keypair, PublicKey, sendAndConfirmTransaction, Signer, SystemProgram, Transaction, TransactionInstruction, } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, SPL_ACCOUNT_LAYOUT, TokenAccount,
  Route, Trade, TokenAmount, Token, Percent, Currency,
  Liquidity, Market,
  GetMultipleAccountsInfoConfig,
  LiquidityPoolKeys,
  LiquidityStateLayout, LiquidityAssociatedPoolKeys, getMultipleAccountsInfo,
  LIQUIDITY_STATE_LAYOUT_V4, findProgramAddress
} from "@raydium-io/raydium-sdk";

import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, Token as SplToken } from "@solana/spl-token"
import { OpenOrders } from "@project-serum/serum"

const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey('9rpQHSyFVM1dkkHFQ2TtTzPEW7DVmEyPmN8wVniqJtuC')
const SERUM_PROGRAM_ID_V3 = new PublicKey('DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY')

// const LIQUIDITY_PROGRAM_ID_V5 = new PublicKey("");

// liquidity version => liquidity program id
// const LIQUIDITY_VERSION_TO_PROGRAMID = {
//     4: LIQUIDITY_PROGRAM_ID_V4,
//     // 5: LIQUIDITY_PROGRAM_ID_V5,
// };

function getProgramId(version: number) {
  return LIQUIDITY_PROGRAM_ID_V4
}

function getStateLayout(version: number): any {
  return LIQUIDITY_STATE_LAYOUT_V4
}

async function getAssociatedId({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("amm_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedAuthority({ programId }: { programId: PublicKey }) {
  return findProgramAddress(
    // new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))
    [Buffer.from([97, 109, 109, 32, 97, 117, 116, 104, 111, 114, 105, 116, 121])],
    programId,
  );
}

async function getAssociatedBaseVault({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("coin_vault_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedQuoteVault({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("pc_vault_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedLpMint({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("lp_mint_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedLpVault({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("temp_lp_token_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedTargetOrders({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("target_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedWithdrawQueue({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("withdraw_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedOpenOrders({ programId, marketId }: { programId: PublicKey; marketId: PublicKey }) {
  const { publicKey } = await findProgramAddress(
    [programId.toBuffer(), marketId.toBuffer(), Buffer.from("open_order_associated_seed", "utf-8")],
    programId,
  );
  return publicKey;
}

async function getAssociatedPoolKeys({
  version,
  marketId,
  baseMint,
  quoteMint,
}: {
  version: number;
  marketId: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
}): Promise<LiquidityAssociatedPoolKeys> {
  const programId = LIQUIDITY_PROGRAM_ID_V4;

  const id = await getAssociatedId({ programId, marketId });
  const lpMint = await getAssociatedLpMint({ programId, marketId });
  const { publicKey: authority, nonce } = await getAssociatedAuthority({ programId });
  const baseVault = await getAssociatedBaseVault({ programId, marketId });
  const quoteVault = await getAssociatedQuoteVault({ programId, marketId });
  const lpVault = await getAssociatedLpVault({ programId, marketId });
  const openOrders = await getAssociatedOpenOrders({ programId, marketId });
  const targetOrders = await getAssociatedTargetOrders({ programId, marketId });
  const withdrawQueue = await getAssociatedWithdrawQueue({ programId, marketId });

  const serumVersion = 3;
  const serumProgramId = SERUM_PROGRAM_ID_V3
  const { publicKey: marketAuthority } = await Market.getAssociatedAuthority({
    programId: serumProgramId,
    marketId,
  });

  return {
    // base
    id,
    baseMint,
    quoteMint,
    lpMint,
    // version
    version,
    programId,
    // keys
    authority,
    nonce,
    baseVault,
    quoteVault,
    lpVault,
    openOrders,
    targetOrders,
    withdrawQueue,
    // market version
    marketVersion: serumVersion,
    marketProgramId: serumProgramId,
    // market keys
    marketId,
    marketAuthority,
  };
}

export async function fetchAllPoolKeys(
  connection: Connection,
  config?: GetMultipleAccountsInfoConfig,
): Promise<LiquidityPoolKeys[]> {
  // supported versions
  const supported = [{
    version: 4,
    programId: LIQUIDITY_PROGRAM_ID_V4,
    serumVersion: 3,
    serumProgramId: SERUM_PROGRAM_ID_V3,
    stateLayout: LIQUIDITY_STATE_LAYOUT_V4,
  }]

  let poolsAccountInfo: {
    pubkey: PublicKey;
    account: AccountInfo<Buffer>;

    version: number;
    programId: PublicKey;
    serumVersion: number;
    serumProgramId: PublicKey;
    stateLayout: LiquidityStateLayout;
  }[][] = [];
  try {
    poolsAccountInfo = await Promise.all(
      supported.map(({ programId, version, serumVersion, serumProgramId, stateLayout }) =>
        connection
          .getProgramAccounts(programId, {
            filters: [{ dataSize: stateLayout.span }],
          })
          .then((accounts) => {
            return accounts.map((info) => {
              return {
                ...info,
                ...{ version, programId, serumVersion, serumProgramId, stateLayout },
              };
            });
          }),
      ),
    );
  } catch (error) {
  }

  const flatPoolsAccountInfo = poolsAccountInfo.flat();
  // temp pool keys without market keys
  const tempPoolsKeys: Omit<LiquidityAssociatedPoolKeys, "nonce">[] = [];

  for (const {
    pubkey,
    account: accountInfo,
    version,
    programId,
    serumVersion,
    serumProgramId,
    stateLayout: LIQUIDITY_STATE_LAYOUT,
  } of flatPoolsAccountInfo) {

    const { data } = accountInfo;

    const fields = LIQUIDITY_STATE_LAYOUT.decode(data);
    const { status, nonce, baseMint, quoteMint, lpMint, openOrders, targetOrders, baseVault, quoteVault, marketId } =
      fields;

    let withdrawQueue, lpVault;
    if (Liquidity.isV4(fields)) {
      withdrawQueue = fields.withdrawQueue;
      lpVault = fields.lpVault;
    } else {
      withdrawQueue = PublicKey.default;
      lpVault = PublicKey.default;
    }
    // uninitialized
    if (status.isZero()) {
      continue;
    }

    const associatedPoolKeys = await getAssociatedPoolKeys({
      version,
      baseMint,
      quoteMint,
      marketId,
    });
    // double check keys with on-chain data
    // logger.assert(Number(nonce) === associatedPoolKeys.nonce, "invalid nonce");

    tempPoolsKeys.push({
      id: pubkey,
      baseMint,
      quoteMint,
      lpMint,
      version,
      programId,

      authority: associatedPoolKeys.authority,
      openOrders,
      targetOrders,
      baseVault,
      quoteVault,
      withdrawQueue,
      lpVault,
      marketVersion: serumVersion,
      marketProgramId: serumProgramId,
      marketId,
      marketAuthority: associatedPoolKeys.marketAuthority,
    });
  }

  // fetch market keys
  let marketsInfo: (AccountInfo<Buffer> | null)[] = [];
  try {
    marketsInfo = await getMultipleAccountsInfo(
      connection,
      tempPoolsKeys.map(({ marketId }) => marketId),
      config,
    );
  } catch (error) {

  }

  const poolsKeys: LiquidityPoolKeys[] = [];

  for (const index in marketsInfo) {
    const poolKeys = tempPoolsKeys[index];
    const marketInfo = marketsInfo[index];

    const { id, marketVersion } = poolKeys;

    // @ts-ignore
    const { data } = marketInfo;
    const { state: MARKET_STATE_LAYOUT } = Market.getLayouts(marketVersion);

    const {
      baseVault: marketBaseVault,
      quoteVault: marketQuoteVault,
      bids: marketBids,
      asks: marketAsks,
      eventQueue: marketEventQueue,
    } = MARKET_STATE_LAYOUT.decode(data);

    poolsKeys.push({
      ...poolKeys,
      ...{
        marketBaseVault,
        marketQuoteVault,
        marketBids,
        marketAsks,
        marketEventQueue,
      },
    });
  }

  return poolsKeys;
}

export async function fetchPoolKeys(
  connection: Connection,
  poolId: PublicKey,
  version: number = 4
) {

  // const version = 4
  const serumVersion = 3
  const marketVersion = 3

  const programId = LIQUIDITY_PROGRAM_ID_V4
  const serumProgramId = SERUM_PROGRAM_ID_V3

  const account = await connection.getAccountInfo(poolId)
  const { state: LiquidityStateLayout } = Liquidity.getLayouts(version)

  //@ts-ignore
  const fields = LiquidityStateLayout.decode(account.data);
  const { status, baseMint, quoteMint, lpMint, openOrders, targetOrders, baseVault, quoteVault, marketId } = fields;

  let withdrawQueue: PublicKey
  let lpVault: PublicKey

  if (Liquidity.isV4(fields)) {
    withdrawQueue = fields.withdrawQueue;
    lpVault = fields.lpVault;
  } else {
    withdrawQueue = PublicKey.default;
    lpVault = PublicKey.default;
  }

  // uninitialized
  // if (status.isZero()) {
  //   return ;
  // }

  const associatedPoolKeys = await getAssociatedPoolKeys({
    version,
    baseMint,
    quoteMint,
    marketId,
  });

  const poolKeys = {
    id: poolId,
    baseMint,
    quoteMint,
    lpMint,
    version,
    programId,

    authority: associatedPoolKeys.authority,
    openOrders,
    targetOrders,
    baseVault,
    quoteVault,
    withdrawQueue,
    lpVault,
    marketVersion: serumVersion,
    marketProgramId: serumProgramId,
    marketId,
    marketAuthority: associatedPoolKeys.marketAuthority,
  };

  const marketInfo = await connection.getAccountInfo(marketId);
  const { state: MARKET_STATE_LAYOUT } = Market.getLayouts(marketVersion);
  //@ts-ignore
  const market = MARKET_STATE_LAYOUT.decode(marketInfo.data);

  const {
    baseVault: marketBaseVault,
    quoteVault: marketQuoteVault,
    bids: marketBids,
    asks: marketAsks,
    eventQueue: marketEventQueue,
  } = market;

  // const poolKeys: LiquidityPoolKeys;
  return {
    ...poolKeys,
    ...{
      marketBaseVault,
      marketQuoteVault,
      marketBids,
      marketAsks,
      marketEventQueue,
    },
  };
}

export async function getRouteRelated(
  connection: Connection,
  tokenInMint: PublicKey,
  tokenOutMint: PublicKey,
): Promise<LiquidityPoolKeys[]> {
  if (!tokenInMint || !tokenOutMint) return []
  const tokenInMintString = tokenInMint.toBase58();
  const tokenOutMintString = tokenOutMint.toBase58();
  const allPoolKeys = await fetchAllPoolKeys(connection);

  const routeMiddleMints: any[] = ['So11111111111111111111111111111111111111112']
  const candidateTokenMints = routeMiddleMints.concat([tokenInMintString, tokenOutMintString])
  const onlyRouteMints = routeMiddleMints.filter((routeMint) => ![tokenInMintString, tokenOutMintString].includes(routeMint))
  const routeRelated = allPoolKeys.filter((info) => {
    const isCandidate = candidateTokenMints.includes(info.baseMint.toBase58()) && candidateTokenMints.includes(info.quoteMint.toBase58())
    const onlyInRoute = onlyRouteMints.includes(info.baseMint.toBase58()) && onlyRouteMints.includes(info.quoteMint.toBase58())
    return isCandidate && !onlyInRoute
  })
  return routeRelated
}

export async function getTokenAccountsByOwner(
  connection: Connection,
  owner: PublicKey,
) {
  const tokenResp = await connection.getTokenAccountsByOwner(
    owner,
    {
      programId: TOKEN_PROGRAM_ID
    },
  );

  const accounts: TokenAccount[] = [];

  for (const { pubkey, account } of tokenResp.value) {
    accounts.push({
      pubkey,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data)
    });
  }

  return accounts;
}

export async function wrapSol(connection: Connection, ownerKeypair: Keypair, amountSol: number) {
  let tokenAccounts = await getTokenAccountsByOwner(connection, ownerKeypair.publicKey);
  let wSolTokenAccount = tokenAccounts.find((value) => {
    return value.accountInfo.mint.toBase58() === NATIVE_MINT.toBase58();
  });

  if (wSolTokenAccount !== undefined) {
    await transferWsol(connection, ownerKeypair, amountSol, wSolTokenAccount.pubkey);
    return wSolTokenAccount.pubkey;
  } else {
    return await createWsol(connection, ownerKeypair, amountSol);
  }
}

async function createWsol(connection: Connection, ownerKeypair: Keypair, amount: number) {
  const newAccount = Keypair.generate()
  const newAccountPubkey = newAccount.publicKey
  const owner = ownerKeypair.publicKey

  const lamports = await connection.getMinimumBalanceForRentExemption(SPL_ACCOUNT_LAYOUT.span)

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey,
      lamports: lamports,
      space: SPL_ACCOUNT_LAYOUT.span,
      programId: TOKEN_PROGRAM_ID
    }),

    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: newAccountPubkey,
      lamports: amount * 10 ** 9,
    }),

    SplToken.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      NATIVE_MINT,
      newAccountPubkey,
      owner
    )
  )
  await sendTx(connection, transaction, [ownerKeypair, newAccount])
  return newAccountPubkey;
}

async function transferWsol(connection: Connection, ownerKeypair: Keypair, amount: number, account: PublicKey) {
  const transaction = new Transaction().add(
    // trasnfer SOL
    SystemProgram.transfer({
      fromPubkey: ownerKeypair.publicKey,
      toPubkey: account,
      lamports: amount * 10 ** 9,
    }),
    // Sync Native instruction.
    new TransactionInstruction({
      keys: [
        {
          pubkey: account,
          isSigner: false,
          isWritable: true,
        },
      ],
      data: Buffer.from(new Uint8Array([17])),
      programId: TOKEN_PROGRAM_ID,
    })
  )
  await sendTx(connection, transaction, [ownerKeypair])
}

export async function closeWsol(
  connection: Connection,
  ownerKeypair: Keypair,
  wsolAddress: PublicKey,
) {
  const owner = ownerKeypair.publicKey
  const transaction = new Transaction().add(
    SplToken.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      wsolAddress,
      owner,
      owner,
      []
    )
  )
  await sendTx(connection, transaction, [ownerKeypair,])
}

async function sendTx(connection: Connection, transaction: Transaction, signers: Array<Signer>) {
  let txRetry = 0
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash('processed')
  ).blockhash;

  transaction.sign(...signers);
  const rawTransaction = transaction.serialize();

  while (++txRetry <= 3) {
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    })

    await new Promise(resolve => setTimeout(resolve, 1000 * 6))
    const ret = await connection.getSignatureStatus(txid, { searchTransactionHistory: true })
    try {
      //@ts-ignore
      if (ret.value && ret.value.err == null) {
        console.log(`${txid}: status(success), retries(${txRetry})`)
        break
      } else {
        console.log(txRetry, 'failed', ret)
      }
    } catch (e) {
      console.log(txRetry, 'failed', ret)
    }
  }
}

export async function getAmountOut(connection: Connection, amount: number, poolId: PublicKey, baseToQuote: Boolean = true): Promise<number> {
  const poolKeys = await fetchPoolKeys(connection, poolId);
  const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })

  const amountIn = new TokenAmount(new Token(baseToQuote ? poolKeys.baseMint : poolKeys.quoteMint,
    baseToQuote ? poolInfo.baseDecimals : poolInfo.quoteDecimals), amount, false);
  console.log(`mintIn: ${amountIn.token.mint.toBase58()}`)
  const currencyOut = new Token(baseToQuote ? poolKeys.quoteMint : poolKeys.baseMint,
    baseToQuote ? poolInfo.quoteDecimals : poolInfo.baseDecimals);
  console.log(`mintOut: ${currencyOut.mint.toBase58()}`)

  // 5% slippage
  const slippage = new Percent(10, 100)

  const {
    amountOut,
    minAmountOut,
    currentPrice,
    executionPrice,
    priceImpact,
    fee,
  } = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, })

  return Number(amountOut.toFixed());
}

export async function swap(connection: Connection, amount: number, poolId: PublicKey, ownerKeypair: Keypair, baseToQuote: Boolean = true) {
  console.log('swap start')

  const owner = ownerKeypair.publicKey
  const poolKeys = await fetchPoolKeys(connection, poolId);
  const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })

  // real amount = 1000000 / 10**poolInfo.baseDecimals
  const amountIn = new TokenAmount(new Token(baseToQuote ? poolKeys.baseMint : poolKeys.quoteMint,
    baseToQuote ? poolInfo.baseDecimals : poolInfo.quoteDecimals), amount, false);
  const currencyOut = new Token(baseToQuote ? poolKeys.quoteMint : poolKeys.baseMint,
    baseToQuote ? poolInfo.quoteDecimals : poolInfo.baseDecimals);

  // 5% slippage
  const slippage = new Percent(5, 100)

  const {
    amountOut,
    minAmountOut,
    currentPrice,
    executionPrice,
    priceImpact,
    fee,
  } = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, })


  // @ts-ignore
  // console.log(amountOut.toFixed(), minAmountOut.toFixed(), currentPrice.toFixed(), executionPrice.toFixed(), priceImpact.toFixed(), fee.toFixed())
  console.log(`swap: ${poolKeys.id.toBase58()}, amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice.toFixed()}`,)

  // const minAmountOut = new TokenAmount(new Token(poolKeys.quoteMint, poolInfo.quoteDecimals), 1000000)

  let tokenAccounts = await getTokenAccountsByOwner(connection, owner);

  console.log(`!!! ${JSON.stringify({
    poolKeys,
    userKeys: {
      tokenAccounts,
      owner,
    },
    amountIn,
    amountOut: minAmountOut,
    fixedSide: "in"
  }, null, 2)}`);

  const { transaction, signers } = await Liquidity.makeSwapTransaction({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts,
      owner,
    },
    amountIn,
    amountOut: minAmountOut,
    fixedSide: "in"
  })

  await sendTx(connection, transaction, [ownerKeypair, ...signers])
  console.log('swap end')
}

export async function addLiquidity(connection: Connection, poolId: PublicKey, ownerKeypair: Keypair) {
  console.log('addLiquidity start')

  const owner = ownerKeypair.publicKey
  const poolKeys = await fetchPoolKeys(connection, poolId);
  const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })

  // real amount = 1000000 / 10**poolInfo.baseDecimals
  const amount = new TokenAmount(new Token(poolKeys.baseMint, poolInfo.baseDecimals), 0.1, false)
  const anotherCurrency = new Currency(poolInfo.quoteDecimals)

  // 5% slippage
  const slippage = new Percent(5, 100)

  const {
    anotherAmount,
    maxAnotherAmount
  } = Liquidity.computeAnotherAmount({ poolKeys, poolInfo, amount, anotherCurrency, slippage, })

  console.log(`addLiquidity: ${poolKeys.id.toBase58()}, base amount: ${amount.toFixed()}, quote amount: ${anotherAmount.toFixed()}`,)

  const amountInB = new TokenAmount(new Token(poolKeys.quoteMint, poolInfo.quoteDecimals), maxAnotherAmount.toFixed(), false)
  let tokenAccounts = await getTokenAccountsByOwner(connection, owner);
  const { transaction, signers } = await Liquidity.makeAddLiquidityTransaction({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts,
      owner,
    },
    amountInA: amount,
    amountInB,
    fixedSide: 'a'
  })

  await sendTx(connection, transaction, [ownerKeypair, ...signers])

  console.log('addLiquidity end')
}

export async function removeLiquidity(connection: Connection, poolId: PublicKey, ownerKeypair: Keypair) {
  console.log('removeLiquidity start')
  const owner = ownerKeypair.publicKey
  const poolKeys = await fetchPoolKeys(connection, poolId);
  const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })
  let tokenAccounts = await getTokenAccountsByOwner(connection, owner);
  const lpToken = tokenAccounts.find((t) => t.accountInfo.mint.toBase58() === poolKeys.lpMint.toBase58())

  if (lpToken) {
    const ratio = parseFloat(lpToken.accountInfo.amount.toString()) / parseFloat(poolInfo.lpSupply.toString())
    console.log(`base amount: ${poolInfo.baseReserve.toNumber() * ratio / 10 ** poolInfo.baseDecimals}, quote amount: ${poolInfo.quoteReserve.toNumber() * ratio / 10 ** poolInfo.quoteDecimals} `)

    const amountIn = new TokenAmount(new Token(poolKeys.lpMint, poolInfo.lpDecimals), lpToken.accountInfo.amount.toNumber())
    const { transaction, signers } = await Liquidity.makeRemoveLiquidityTransaction({
      connection,
      poolKeys,
      userKeys: {
        tokenAccounts,
        owner,
      },
      amountIn,
    })

    await sendTx(connection, transaction, [ownerKeypair, ...signers])
  }
  console.log('removeLiquidity end')
}

export async function routeSwap(connection: Connection, fromPoolKeys: LiquidityPoolKeys, toPoolKeys: LiquidityPoolKeys, ownerKeypair: Keypair, tokenAccounts: TokenAccount[]) {
  console.log('route swap start')

  const owner = ownerKeypair.publicKey
  const fromPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys: fromPoolKeys })
  const toPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys: toPoolKeys })
  const amountIn = new TokenAmount(new Token(fromPoolKeys.baseMint, fromPoolInfo.baseDecimals), 1, false)
  const currencyOut = new Token(toPoolKeys.quoteMint, toPoolInfo.quoteDecimals)
  // 5% slippage
  const slippage = new Percent(5, 100)

  const { amountOut, minAmountOut, executionPrice, priceImpact, fee } = Route.computeAmountOut({
    fromPoolKeys,
    toPoolKeys,
    fromPoolInfo,
    toPoolInfo,
    amountIn,
    currencyOut,
    slippage,
  });

  // @ts-ignore
  console.log(`route swap: ${fromPoolKeys.id.toBase58()}, amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice!.toFixed()}`,)

  const { setupTransaction, swapTransaction } =
    await Route.makeSwapTransaction({
      connection,
      fromPoolKeys,
      toPoolKeys,
      userKeys: {
        tokenAccounts,
        owner,
      },
      amountIn,
      amountOut,
      fixedSide: "in",
    });

  if (setupTransaction) {
    await sendTx(connection, setupTransaction.transaction, [ownerKeypair, ...setupTransaction.signers])
  }

  if (swapTransaction) {
    await sendTx(connection, swapTransaction.transaction, [ownerKeypair, ...swapTransaction.signers])
  }
  console.log('route swap end')
}

export async function tradeSwap(connection: Connection, tokenInMint: PublicKey, tokenOutMint: PublicKey, amount: number, ownerKeypair: Keypair) {
  console.log('trade swap start')
  let relatedPoolKeys = await getRouteRelated(connection, tokenInMint, tokenOutMint);
  const owner = ownerKeypair.publicKey
  const amountIn = new TokenAmount(new Token(tokenInMint, 6), amount, false)
  const currencyOut = new Token(tokenOutMint, 6)
  // 5% slippage
  const slippage = new Percent(5, 100)
  const pools = await Promise.all(relatedPoolKeys.map(async (poolKeys) => {
    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys })
    return {
      poolKeys,
      poolInfo
    }
  }))

  const { amountOut, minAmountOut, executionPrice, currentPrice, priceImpact, routes, routeType, fee } = Trade.getBestAmountOut({
    pools,
    currencyOut,
    amountIn,
    slippage
  })
  console.log(`trade swap: amountIn: ${amountIn.toFixed()}, amountOut: ${amountOut.toFixed()}, executionPrice: ${executionPrice!.toFixed()}, ${routeType}`,)

  let tokenAccounts = await getTokenAccountsByOwner(connection, ownerKeypair.publicKey);
  const { setupTransaction, tradeTransaction } = await Trade.makeTradeTransaction({
    connection,
    routes,
    routeType,
    userKeys: {
      tokenAccounts,
      owner
    },
    amountIn,
    amountOut,
    fixedSide: 'in',
  })

  if (setupTransaction) {
    await sendTx(connection, setupTransaction.transaction, [ownerKeypair, ...setupTransaction.signers])
  }

  if (tradeTransaction) {
    await sendTx(connection, tradeTransaction.transaction, [ownerKeypair, ...tradeTransaction.signers])
  }

  console.log('trade swap end')
}

export async function getLiquidityInfo(connection: Connection, poolId: PublicKey, dexProgramId: PublicKey) {
  const info = await connection.getAccountInfo(poolId);
  if (info === null) return null
  const state = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);

  const baseTokenAmount = await connection.getTokenAccountBalance(state.baseVault);
  const quoteTokenAmount = await connection.getTokenAccountBalance(state.quoteVault);
  const openOrders = await OpenOrders.load(connection, state.openOrders, dexProgramId);

  const baseDecimal = 10 ** state.baseDecimal.toNumber()
  const quoteDecimal = 10 ** state.quoteDecimal.toNumber()

  const openOrdersTotalBase = openOrders.baseTokenTotal.toNumber() / baseDecimal
  const openOrdersTotalQuote = openOrders.quoteTokenTotal.toNumber() / quoteDecimal

  const basePnl = state.baseNeedTakePnl.toNumber() / baseDecimal
  const quotePnl = state.quoteNeedTakePnl.toNumber() / quoteDecimal

  // @ts-ignore
  const base = baseTokenAmount.value?.uiAmount + openOrdersTotalBase - basePnl

  // @ts-ignore
  const quote = quoteTokenAmount.value?.uiAmount + openOrdersTotalQuote - quotePnl

  const lpSupply = parseFloat(state.lpReserve.toString())
  const priceInQuote = quote / base

  return {
    base,
    quote,
    lpSupply,
    baseVaultKey: state.baseVault,
    quoteVaultKey: state.quoteVault,
    baseVaultBalance: baseTokenAmount.value.uiAmount,
    quoteVaultBalance: quoteTokenAmount.value.uiAmount,
    openOrdersKey: state.openOrders,
    openOrdersTotalBase,
    openOrdersTotalQuote,
    basePnl,
    quotePnl,
    priceInQuote
  }
}