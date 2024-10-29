use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid bentobox account.")]
    InvalidBentoBoxAccount,
    #[msg("There are not enough remaining accounts to make a Orca swap.")]
    NotEnoughRemainingAccounts,
    #[msg("Invalid pool host fee account.")]
    InvalidPoolHostFeeAccount,
}
