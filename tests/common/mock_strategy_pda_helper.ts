
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getConstantValue } from "./common";

const strategyMockIdl = require("../../target/idl/strategy_mock.json");

export async function getStrategyAddress(strategy: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('strategy')),
        strategy.toBytes()],
        program
    );
}

export async function getStrategyVaultAddress(mint: PublicKey, strategy: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('strategyvaultkey')),
        strategy.toBytes(),
        mint.toBytes()],
        program
    );
}

export async function getStrategyExecutorInfoAddress(strategy: PublicKey, user: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('executorinfo')),
        strategy.toBytes(),
        user.toBytes()],
        program
    );
}