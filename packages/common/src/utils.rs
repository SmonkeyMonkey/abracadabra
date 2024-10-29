use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey, Result};
// use solana_program::hash::hash;
// use solana_program::instruction::{AccountMeta, Instruction};

use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::instruction::{AccountMeta,Instruction};

use crate::constants::DISCRIMINATOR_BYTES;

pub fn sighash(namespace: &str, name: &str) -> [u8; 8] {
    let preimage = format!("{}:{}", namespace, name);

    let mut sighash = [0u8; 8];
    sighash.copy_from_slice(&hash(preimage.as_bytes()).to_bytes()[..8]);
    sighash
}

pub fn invoke_signed_instruction(
    namespace: &str,
    name: &str,
    args: Vec<Vec<u8>>,
    program_id: Pubkey,
    accounts_meta: Vec<AccountMeta>,
    accounts_info: &Vec<AccountInfo>,
    signer: &[&[&[u8]]],
) -> Result<()> {
    let mut data: Vec<u8> = sighash(namespace, name).to_vec();
    let mut args = args;
    args.iter_mut().for_each(|arg| data.append(arg));

    let ix = Instruction {
        program_id,
        accounts: accounts_meta,
        data,
    };

    anchor_lang::solana_program::program::invoke_signed(&ix, accounts_info, signer)?;
    Ok(())
}

// Returns the position of right side byte which needs for implementing serializing/deserializing account.
// Param account_size: the size of account which want to serialize/deserialize
// Param is_discriminator_included: true - account size includes first 8 discriminator bytes, false - not includes.
pub fn calculate_end_byte_to_serialize(
    account_size: usize,
    is_discriminator_included: bool,
) -> usize {
    if is_discriminator_included {
        return account_size as usize;
    } else {
        return account_size as usize + DISCRIMINATOR_BYTES;
    }
}