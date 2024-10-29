use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid token source account or token source program account.")]
    InvalidTokenSourceOwner,
    #[msg("Invalid token destination account or token destination program account.")]
    InvalidTokenDestinationOwner,
}
