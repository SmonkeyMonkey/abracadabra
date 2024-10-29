use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use common::errors::ErrorCode as CommonErrorCode;

#[derive(Accounts, Clone)]
pub struct Swap<'info> {
    /// Base Account to swap INTO.Must be the SOURCE token. Cauldron_authority must be owner.
    #[account(mut,
              constraint = source_token_account.owner == authority.key() @ CommonErrorCode::InvalidTokenAccountOwner)]
    pub source_token_account: Box<Account<'info, TokenAccount>>,
    /// Base Account to swap FROM. Must be the DESTINATION token. Cauldron_authority must be owner.
    #[account(mut,
              constraint = destination_token_account.owner == authority.key() @ CommonErrorCode::InvalidTokenAccountOwner)]
    pub destination_token_account: Box<Account<'info, TokenAccount>>,
    /// Swap program account.
    /// CHECK:
    pub swap_program: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Signer account
    #[account(mut)]
    pub authority: Signer<'info>,
}
