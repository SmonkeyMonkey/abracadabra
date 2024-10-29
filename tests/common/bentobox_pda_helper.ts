
import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { getConstantValue } from "./common";
const crypto = require('crypto');

const bentoboxIdl = require("../../target/idl/bentobox.json");

export async function getBentoBoxAddress(bentobox: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('bentobox')),
        bentobox.toBytes()
    ],
        program
    );
}

export async function getBentoboxBalanceAddress(depositer: PublicKey, mint: PublicKey, bentobox: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        
        [Buffer.from(anchor.utils.bytes.utf8.encode('bentoboxtokenbalancekey')),
        bentobox.toBytes(),
        mint.toBytes(),
        depositer.toBytes()],
        program
    );
}

export async function getBentoboxTotalVaultAddress(mint: PublicKey, bentobox: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('bentoboxtotalvaultkey')),
        bentobox.toBytes(),
        mint.toBytes()
        ],
        program
    );
}

export async function getBentoboxTotalAddress(mint: PublicKey, bentobox: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('bentoboxtotalkey')),
        bentobox.toBytes(),
        mint.toBytes()
        ],
        program
    );
}

export async function getMasterContractWhitelistAddress(mastercontract_id: PublicKey, bentobox: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('whitelistedmastercontractkey')),
        bentobox.toBytes(),
        mastercontract_id.toBytes()],
        program
    );
}

export async function getMasterContractApprovedAddress(mastercontract_id: PublicKey, approver_user: PublicKey, bentobox: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('approvedmastercontractkey')),
        bentobox.toBytes(),
        mastercontract_id.toBytes(),
        approver_user.toBytes()],
        program
    );
}


export async function getBentoboxStrategyDataAddress(bentobox: PublicKey, mint: PublicKey, program: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode('bentoboxstrategydatakey')),
        bentobox.toBytes(),
        mint.toBytes()],
        program
    );
}