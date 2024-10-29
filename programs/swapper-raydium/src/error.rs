use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("There are not enough remaining accounts to make a Raydium swap.")]
    NotEnoughRemainingAccounts,
}
