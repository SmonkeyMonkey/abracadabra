import {
  Connection, Keypair, SystemProgram, PublicKey, ComputeBudgetProgram,
  Transaction, Signer, sendAndConfirmTransaction, TransactionInstruction, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  AccountLayout,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID, u64
} from '@solana/spl-token';
import {
  LENDING_PROGRAM_ID,
} from './src';

import * as anchor from '@coral-xyz/anchor';
import * as fs from 'fs';

import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';

const COMPUTE_UNITS_DEFAULT = 200_000;
//new restriction of max 2 sol
const MAX_SOL_AIRDROP = LAMPORTS_PER_SOL * 2;

export function toSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function toLamports(sol: number): number {
  return sol * LAMPORTS_PER_SOL;
}

export function wrapInTx(
  instruction: TransactionInstruction,
  computeUnits = 600_000
): Transaction {
  const tx = new Transaction();
  if (computeUnits != COMPUTE_UNITS_DEFAULT) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits,
      })
      // ComputeBudgetProgram.requestUnits({
      //   units: computeUnits,
      //   additionalFee: 0,
      // })
    );
  }

  return tx.add(instruction);
}

export class Assignable {
  constructor(properties) {
    Object.keys(properties).map((key) => {
      this[key] = properties[key];
    });
  }
}

export function getAnchorProvider(cluster?: string): anchor.AnchorProvider {
  let _cluster = cluster != undefined ? cluster : process.env.TESTS_CLUSTER;

  if (_cluster == undefined) {
    _cluster = "devnet"
  }

  switch (_cluster) {
    case "localnet":
      return getLocalnetProvider();
    case "devnet":
    default:
      return getDevnetProvider();
  }
  return
}
  
function getLocalnetProvider(): anchor.AnchorProvider {
  const url = "http://localhost:8899";
  return anchor.AnchorProvider.local(url)
}

function getDevnetProvider(): anchor.AnchorProvider {
  const url = 'https://api.devnet.solana.com';
  const connection = new Connection(url,
    anchor.AnchorProvider.defaultOptions().preflightCommitment
  );
  const wallet = getWallet("tests/wallets/devnet.json");
  return new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions())
}

export function getWallet(walletFile: string | null): NodeWallet {
  if (walletFile === null) {
    return new NodeWallet(Keypair.generate())
  }

  let secretKeyStr = fs.readFileSync(walletFile, 'utf8');
  return new NodeWallet(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKeyStr))));
}

export async function getConnection(url: string): Promise<Connection> {
  let connection = new Connection(url, 'recent');
  const version = await connection.getVersion();
  console.log('connection to cluster established:', url, version);
  return connection;
}

export function assert(condition: boolean, message?: string) {
  if (!condition) {
    console.log(Error().stack + ':main.ts');
    throw message || 'Assertion failed';
  }
}

export async function newAccountWithLamports(
  connection: Connection,
  lamports: number = 1000000,
): Promise<Keypair> {
  const account = new Keypair();
  await requestAirdrop(connection, LAMPORTS_PER_SOL * 2, account);
  return account;
}

export function sleep(ms: number, cluster?: string): Promise<void> {
  if (cluster == undefined) {
    cluster = "devnet"
  }
  return new Promise(resolve => setTimeout(resolve, cluster == "localnet" ? 0 : ms));
}
export async function batchAirdrop(connection: Connection, accounts: Keypair[]) {
  for (let i = 0; i < accounts.length; i++) {
    await requestAirdrop(connection, LAMPORTS_PER_SOL * 2, accounts[i])
  }
}

export async function requestAirdropSol(connection: Connection, sol: number, account: Keypair) {
  return requestAirdrop(connection, sol * LAMPORTS_PER_SOL, account);
}

export async function requestAirdrop(connection: Connection, lamports: number, account: Keypair) {
  let cluster = connection.rpcEndpoint == "http://localhost:8899" ? "localnet" : "devnet"
  let lamportsChunks = [];
  for (; lamports > MAX_SOL_AIRDROP; lamports -= MAX_SOL_AIRDROP) {
    lamportsChunks.push(MAX_SOL_AIRDROP);
  }
  lamportsChunks.push(lamports);

  for (let i = 0; i < lamportsChunks.length; ++i) {
    let _lemportsChunk = lamportsChunks[i];
    let airdropSignature = await connection.requestAirdrop(account.publicKey, _lemportsChunk);
    await sleep(5000, cluster);
    
    const latestBlockHash = await connection.getLatestBlockhash('processed');
    try {
      if (connection.isBlockhashValid(latestBlockHash.blockhash)) {
      console.log("blockhash not expired")
    }
    }catch {
      throw new Error('blockhash expired')
    }


    await sleep(5000, cluster);
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });
    await sleep(1000, cluster);

    const ret = await connection.getSignatureStatus(airdropSignature, { searchTransactionHistory: true });
    try {
      if (ret.value && ret.value.err == null) {
        console.log(`Airdrop for ${toSol(_lemportsChunk)} SOL was successful.`);
      } else {
        throw new Error(`Airdrop of ${toSol(_lemportsChunk)} SOL failed`);
      }
    } catch (e) {
      throw new Error(`Airdrop of ${toSol(_lemportsChunk)} SOL failed`);
    }
  }
}

export async function pause(ms: number) {
  //weird semantics - but needed to work inside jest
  //taken from https://stackoverflow.com/questions/46077176/jest-settimeout-not-pausing-test
  await new Promise(response => setTimeout(() => {
    response(0)
  }, ms)
  );
}

export async function prepareAndSendTx(instructions: TransactionInstruction[], signers: Signer[], connection: Connection) {
  const tx = new Transaction().add(...instructions);
  const sig = await sendAndConfirmTransaction(connection, tx, signers);
  console.log(sig);
}

export async function createMintAccount(connection: Connection, payer: Signer, mintAuthority: PublicKey, decimals: number): Promise<Token> {
  return Token.createMint(
    connection,
    payer,
    mintAuthority,
    null,
    decimals,
    TOKEN_PROGRAM_ID,
  );
}

export async function createAndFundUserAccount(user: PublicKey, accountAuthority: Keypair, mint: Token, mintAmount: number): Promise<PublicKey> {
  const tokenUserPk = await mint.createAccount(user);
  await mint.mintTo(tokenUserPk, accountAuthority.publicKey, [accountAuthority], mintAmount);
  return tokenUserPk;
}

export async function generateCreateTokenAccIx(fromPubkey: PublicKey, newAccountPubkey: PublicKey, connection: Connection): Promise<TransactionInstruction> {
  return SystemProgram.createAccount({
    programId: TOKEN_PROGRAM_ID,
    fromPubkey,
    newAccountPubkey,
    space: AccountLayout.span,
    lamports: await connection.getMinimumBalanceForRentExemption(AccountLayout.span),
  });
}

export async function generateCreateTokenMintIx(fromPubkey: PublicKey, newAccountPubkey: PublicKey, connection: Connection): Promise<TransactionInstruction> {
  return SystemProgram.createAccount({
    programId: TOKEN_PROGRAM_ID,
    fromPubkey,
    newAccountPubkey,
    space: MintLayout.span,
    lamports: await connection.getMinimumBalanceForRentExemption(MintLayout.span),
  });
}

export async function generateCreateStateAccIx(fromPubkey: PublicKey, newAccountPubkey: PublicKey, space: number, connection: Connection): Promise<TransactionInstruction> {
  return SystemProgram.createAccount({
    programId: LENDING_PROGRAM_ID,
    fromPubkey,
    newAccountPubkey,
    space,
    lamports: await connection.getMinimumBalanceForRentExemption(space),
  });
}

export function getConstantValue(idl: any, constantName: string): any {
  const value = idl.constants.find(
    (constant: { name: string; }): boolean => {
      return constant.name === constantName;
    }).value;

  if (value != undefined) {
    if (!value.includes('\"')) {
      return value;
    }
    return value.substring(value.indexOf("\"") + 1, value.lastIndexOf("\""))
  }
  else {
    return null
  };
}

export async function getErrorInfo(idl: any, errorName: string): Promise<{ errorMsg: string, errorCode: number }> {
  const error = idl.errors.find(
    (error: { name: string; }): boolean => {
      return error.name === errorName;
    });

  return error != undefined ? { errorMsg: error.msg, errorCode: error.code } : null;
}

export function getLastReturnLog(confirmedTransaction: anchor.web3.TransactionResponse): [string, string, Buffer] {
  const prefix = "Program return: ";
  let log = confirmedTransaction.meta.logMessages.reverse().find((log) =>
    log.startsWith(prefix)
  );
  log = log.slice(prefix.length);
  const [key, data] = log.split(" ", 2);
  const buffer = Buffer.from(data, "base64");
  return [key, data, buffer];
};

export type Instruction = {
  instructions: TransactionInstruction[];
  cleanupInstructions: TransactionInstruction[];
  signers: Signer[];
};

export const createApprovalInstruction = (
  ownerAddress: PublicKey,
  approveAmount: u64,
  tokenUserAddress: PublicKey,
  userTransferAuthority?: Keypair
): { userTransferAuthority: Keypair } & Instruction => {
  userTransferAuthority = userTransferAuthority || new Keypair();

  const approvalInstruction = Token.createApproveInstruction(
    TOKEN_PROGRAM_ID,
    tokenUserAddress,
    userTransferAuthority.publicKey,
    ownerAddress,
    [],
    approveAmount
  );

  const revokeInstruction = Token.createRevokeInstruction(
    TOKEN_PROGRAM_ID,
    tokenUserAddress,
    ownerAddress,
    []
  );

  return {
    userTransferAuthority: userTransferAuthority,
    instructions: [approvalInstruction],
    cleanupInstructions: [revokeInstruction],
    signers: [userTransferAuthority],
  };
};