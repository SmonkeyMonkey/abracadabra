use anchor_lang::{prelude::*, solana_program::program::invoke};

use anchor_spl::token::TokenAccount;
use swapper_package::swapper_interface::Swap;

use crate::error::ErrorCode;
use common::errors::ErrorCode as CommonErrorCode;

#[constant]
pub const SWAP_REMAINING_ACCOUNTS_COUNT: usize = 9;

pub fn swap_orca<'info>(
    ctx: &Context<'_, '_, '_, 'info, Swap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    let remaining_accounts = ctx.remaining_accounts;
    require!(
        remaining_accounts.len() >= SWAP_REMAINING_ACCOUNTS_COUNT,
        ErrorCode::NotEnoughRemainingAccounts
    );

    let token_swap = remaining_accounts[0].clone();
    let swap_authority = remaining_accounts[1].clone();
    let pool_source_account = remaining_accounts[2].clone();
    let pool_destination_account = remaining_accounts[3].clone();
    let pool_token_mint = remaining_accounts[4].clone();
    let pool_fee_account = remaining_accounts[5].clone();
    let pool_host_fee_account = remaining_accounts[6].clone();
    let source_mint = remaining_accounts[7].clone();
    let destination_mint = remaining_accounts[8].clone();
    let source_token_account = ctx.accounts.source_token_account.to_account_info();
    let destination_token_account = ctx.accounts.destination_token_account.to_account_info();

    let cauldron_authority = ctx.accounts.authority.to_account_info();

    let pool_host_fee_token_account =
        &mut Account::<TokenAccount>::try_from(&pool_host_fee_account)
            .ok()
            .ok_or(CommonErrorCode::WrongConvertionFromAccountInfoToTokenAccount)?;

    // check host fee account
    require!(
        pool_host_fee_token_account.owner == cauldron_authority.key(),
        ErrorCode::InvalidPoolHostFeeAccount
    );

    let ix = spl_token_swap::instruction::swap(
        &ctx.accounts.swap_program.key(),
        &ctx.accounts.token_program.key(),
        &token_swap.key(),
        &swap_authority.key(),
        &cauldron_authority.key(),
        &source_token_account.key(),
        &pool_source_account.key(),
        &pool_destination_account.key(),
        &destination_token_account.key(),
        &pool_token_mint.key(),
        &pool_fee_account.key(),
        Some(&pool_host_fee_account.key()),
        spl_token_swap::instruction::Swap {
            amount_in,
            minimum_amount_out,
        },
    )?;

    invoke(
        &ix,
        &[
            token_swap,
            swap_authority,
            cauldron_authority,
            source_token_account.to_account_info(),
            pool_source_account.to_account_info(),
            pool_destination_account.to_account_info(),
            destination_token_account.to_account_info(),
            pool_token_mint.to_account_info(),
            pool_fee_account.to_account_info(),
            source_mint.to_account_info(),
            destination_mint.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            pool_host_fee_account.to_account_info(),
        ],
    )?;

    Ok(())
}
