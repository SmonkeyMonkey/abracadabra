use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey, Result};
use common::utils::invoke_signed_instruction;

use crate::package::errors::ErrorCode;

/// Common function for invoke instuction from program.
/// After exited, the owner can perform ANY call. This is to rescue any funds that didn't
/// get released during exit or got earned afterwards due to vesting or airdrops, etc.
///
/// Arguments:
///
/// * `remaining_accounts` - The maximum balance of the underlying token that is allowed to be in BentoBox.
/// * `name`               - Accounts that should be passed to the program.
/// * `args`               - Arguments for instruction.
/// * `program`            - Pubkey of the program that executes this instruction.
/// * `signer`             - Program pda signature.
pub fn base_after_exit(
    accounts: Vec<AccountInfo>,
    name: String,
    args: Vec<Vec<u8>>,
    program: Pubkey,
    signer: &[&[&[u8]]],
) -> Result<()> {
    if accounts.is_empty() {
        return Err(error!(ErrorCode::EmptyAccountsListForAfterExit));
    }

    let mut accounts_meta: Vec<AccountMeta> = vec![];

    for counter in 0..accounts.len() {
        accounts_meta.push(AccountMeta {
            pubkey: accounts[counter].key(),
            is_signer: accounts[counter].is_signer,
            is_writable: accounts[counter].is_writable,
        });
    }

    invoke_signed_instruction(
        "global",
        &name,
        args,
        program,
        accounts_meta,
        &accounts,
        signer,
    )?;
    Ok(())
}
