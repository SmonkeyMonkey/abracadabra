use anchor_lang::{prelude::*, Result};
use anchor_spl::token::{Token, TokenAccount};

use common::errors::ErrorCode as CommonErrorCode;
pub mod swapper_interface {
    use super::*;

    // pub fn get_amount_in<'a>(
    //     ctx: CpiContext<'_, '_, '_, 'a, GetAmountIn<'a>>,
    //     amount_out: u64,
    // ) -> Result<()> {
    //     swapper::get_amount_in(ctx, amount_out)
    // }

    // pub fn get_amount_out<'a>(
    //     ctx: CpiContext<'_, '_, '_, 'a, GetAmountOut<'a>>,
    //     amount_in: u64,
    // ) -> Result<()> {
    //     swapper::get_amount_out(ctx, amount_in)
    // }

    // pub fn swap<'a>(
    //     ctx: CpiContext<'_, '_, '_, 'a, Swap<'a>>,
    //     amount_in: u64,
    //     minimum_amount_out: u64,
    // ) -> Result<()> {
    //     swapper::swap(ctx, amount_in, minimum_amount_out)
    // }
}

/// Accounts for a get_amount_in instruction.
#[derive(Accounts, Clone)]
pub struct GetAmountIn<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
}

/// Accounts for a get_amount_out instruction.
#[derive(Accounts, Clone)]
pub struct GetAmountOut<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
}

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

//** Swapper implementation: override the following functions: */
// #[interface]
pub trait Swapper<'info> {
    fn get_amount_in<'a>(
        ctx: Context<'_, '_, '_, 'a, GetAmountIn<'a>>,
        amount_out: u64,
    ) -> Result<()>;
    fn get_amount_out<'a>(
        ctx: Context<'_, '_, '_, 'a, GetAmountOut<'a>>,
        amount_int: u64,
    ) -> Result<()>;

    fn swap<'a>(
        ctx: Context<'_, '_, '_, 'a, Swap<'a>>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()>;
    //** End swapper implementation */
}
