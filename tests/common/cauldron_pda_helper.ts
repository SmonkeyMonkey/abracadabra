import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getConstantValue } from "./common";

const cauldronIdl = require("../../target/idl/cauldron.json");

export async function getCauldronAddress(cauldron: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('cauldron')),
        cauldron.toBytes()],
        program
    );
}

export async function getCauldronUserBalanceAddress(depositer: PublicKey, cauldron: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('userbalance')),
        cauldron.toBytes(),
        depositer.toBytes()],
        program
    );
}

export async function getCauldronVaultAddress(mint: PublicKey, cauldron: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('cauldrontotalvault')),
        cauldron.toBytes(),
        mint.toBytes()],
        program
    );
}

export async function getCauldronTotalAddress(cauldron: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('cauldrontotal')),    
        cauldron.toBytes()],
        program
    );
}

export async function getCauldronAuthorityAddress(cauldron: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('cauldron')),
        cauldron.toBytes()],
        program
    );
}

export async function getCauldronLiquidatorAccountAddress(liquidator: PublicKey, cauldron: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('liquidatoraccount')),            
        cauldron.toBytes(),
        liquidator.toBytes()],
        program
    );
}