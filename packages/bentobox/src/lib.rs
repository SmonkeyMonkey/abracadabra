pub mod errors;
pub mod state;

use anchor_lang::{prelude::*, Result};

use common::constants::*;
use common::errors::ErrorCode as CommonErrorCode;
use common::utils::calculate_end_byte_to_serialize;

use strategy_package::state::{BaseStrategyInfo, ResultAmount};
use strategy_package::strategy_interface::{self, *};

use crate::errors::ErrorCode;
use crate::state::{BaseExit, BaseHarvest, BaseSafeHarvest, BaseSkim, BaseWithdraw};

/// Helper function checks if the strategy is active. (For harvest and withdraw.)
///
/// Arguments:
///
/// * `base_strategy_info` - An account is owned by the strategy which holds all common strategy info.
fn is_strategy_active(base_strategy_info: &BaseStrategyInfo) -> Result<()> {
    if base_strategy_info.exited {
        return Err(error!(ErrorCode::StrategyIsExited));
    }
    Ok(())
}

/// Call concrete strategy skim to invest tokens.
/// Base function for deposit strategy skim through Bentobox.
/// 
/// Arguments:
/// 
/// * `amount` - The amount of tokens to invest.
/// * `signer` - Bentobox pda signature.
/// Assume the amount of strategy token account is greater than the amount.
pub fn base_skim<'info>(
    ctx: Context<'_, '_, '_, 'info, BaseSkim<'info>>,
    amount: u64,
    signer: &[&[&[u8]]],
) -> Result<()> {
    let cpi_ctx = ctx
        .accounts
        .create_skim_context()
        .with_signer(signer)
        .with_remaining_accounts(ctx.remaining_accounts.to_vec());
    strategy_interface::cpi::skim(cpi_ctx, amount)?;
    Ok(())
}

/// Harvest any profits made converted to the token and pass them to the Bentobox.
/// Base strategy function for getting harvest from strategy through Bentobox.
///
/// Arguments:
///
/// * `balance`        - The amount of tokens the Bentobox thinks it has invested.
/// * `signer`         - Bentobox pda signature.
/// * `total_elastic`  - The total token amount of Bentobox.
///
/// Return: the delta (+profit or -loss) that occured in contrast to `balance`.
pub fn base_harvest<'info>(
    ctx: Context<'_, '_, '_, 'info, BaseHarvest<'info>>,
    balance: u64,
    signer: &[&[&[u8]]],
    total_elastic: u128,
) -> Result<i64> {
    let max_bentobox_balance: u64;
    // check if strategy is active
    {
        let base_strategy_info = ctx.accounts.base_strategy_info.clone();
        let data: &[u8] = &base_strategy_info.try_borrow_data()?;
        let mut base_strategy_bytes = &data
            [DISCRIMINATOR_BYTES..calculate_end_byte_to_serialize(BaseStrategyInfo::SIZE, false)];
        let base_strategy_info_decerialized =
            BaseStrategyInfo::deserialize(&mut base_strategy_bytes)?;

        is_strategy_active(&base_strategy_info_decerialized)?;
        max_bentobox_balance = base_strategy_info_decerialized.max_bentobox_balance;
    }

    if total_elastic <= max_bentobox_balance.into() && balance > 0 {
        let harvest_cpi_ctx = ctx
            .accounts
            .create_harvest_context()
            .with_signer(signer)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec());
        strategy_interface::cpi::harvest(harvest_cpi_ctx, balance)?;

        ctx.accounts.strategy_vault.reload()?;

        let var = ctx.accounts.cpi_result_account.try_borrow_data()?;
        let mut result_bytes =
            &var[DISCRIMINATOR_BYTES..calculate_end_byte_to_serialize(ResultAmount::SIZE, false)];
        let result_decoded = ResultAmount::deserialize(&mut result_bytes)?;

        let amount: i64 = result_decoded.amount;
        // Since harvesting of rewards is accounted for seperately we might also have
        //some underlying tokens in the contract that the _harvest call doesn't report.
        //E.g. reward tokens that have been sold into the underlying tokens which are now sitting in the contract.
        //Meaning the amount returned by the internal _harvest function isn't necessary the final profit/loss amount
        let contract_balance = ctx.accounts.strategy_vault.amount;

        let transfer_cpi_ctx = ctx.accounts.create_transfer_context().with_signer(signer);

        if amount >= 0 {
            // harvest reported a profit
            if contract_balance > 0 {
                strategy_interface::cpi::transfer(transfer_cpi_ctx, contract_balance)?;
            }

            return Ok(contract_balance as i64);
        } else if contract_balance > 0 {
            // harvest reported a loss but we have some tokens sitting in the contract

            let diff: i64 = amount
                .checked_add(contract_balance as i64)
                .ok_or(CommonErrorCode::WrongIntegerAddition)?;

            let skim_cpi_ctx = ctx
                .accounts
                .create_skim_context()
                .with_signer(signer)
                .with_remaining_accounts(ctx.remaining_accounts.to_vec());

            if diff > 0 {
                // we still made some profit
                // send the profit to BentoBox and reinvest the rest
                strategy_interface::cpi::transfer(transfer_cpi_ctx, diff as u64)?;
                strategy_interface::cpi::skim(skim_cpi_ctx, -amount as u64)?;
            } else {
                // we made a loss but we have some tokens we can reinvest
                strategy_interface::cpi::skim(skim_cpi_ctx, contract_balance)?;
            }
            return Ok(diff);
        } else {
            // we made a loss
            return Ok(amount);
        }
    }
    return Ok(0);
}

/// Base strategy function for withdraw tokens from strategy to Bentobox.
/// Withdraw tokens. The returned amount can differ from the requested amount due to rounding.
///
/// Arguments:
///
/// * `amount`         - The requested amount the Bentobox wants to withdraw.
/// * `signer`         - Bentobox pda signature.
///
/// Return: the real amount that is withdrawn. Can be a little different from the requested amount due to rounding.
/// The difference should NOT be used to report a loss. That's what harvest is for.
pub fn base_withdraw<'info>(
    ctx: Context<'_, '_, '_, 'info, BaseWithdraw<'info>>,
    amount: u64,
    signer: &[&[&[u8]]],
) -> Result<u64> {
    // check if strategy is active
    let base_strategy_info = ctx.accounts.base_strategy_info.clone();
    let data: &[u8] = &base_strategy_info.try_borrow_data()?;
    let mut base_strategy_bytes =
        &data[DISCRIMINATOR_BYTES..calculate_end_byte_to_serialize(BaseStrategyInfo::SIZE, false)];
    let base_strategy_info_decerialized = BaseStrategyInfo::deserialize(&mut base_strategy_bytes)?;

    is_strategy_active(&base_strategy_info_decerialized)?;

    //_withdraw
    strategy_interface::cpi::withdraw(
        ctx.accounts
            .create_withdraw_context()
            .with_signer(signer)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        amount,
    )?;
    ctx.accounts.strategy_vault.reload()?;

    let actual_amount = ctx.accounts.strategy_vault.amount;
    strategy_interface::cpi::transfer(
        ctx.accounts.create_transfer_context().with_signer(signer),
        actual_amount,
    )?;

    return Ok(actual_amount);
}

/// Base strategy function for withdraw all tokens from strategy and set state to exited.
/// Allow Bentobox to call strategy.exit() multiple times.
///
/// Arguments:
///
/// * `balance`        - The amount of tokens the Bentobox thinks it has invested.
/// * `signer`         - Bentobox pda signature.
///
/// Return: the delta (+profit or -loss) that occured in contrast to `balance`.
pub fn base_exit<'info>(
    ctx: Context<'_, '_, '_, 'info, BaseExit<'info>>,
    balance: u64,
    signer: &[&[&[u8]]],
) -> Result<i64> {
    let cpi_ctx = ctx
        .accounts
        .create_exit_context()
        .with_signer(signer)
        .with_remaining_accounts(ctx.remaining_accounts.to_vec());

        strategy_interface::cpi::exit(cpi_ctx)?;
    ctx.accounts.strategy_vault.reload()?;

    let actual_balance = ctx.accounts.strategy_vault.amount;
    let amount_added = (actual_balance - balance) as i64;
    let transfer_cpi_ctx = ctx.accounts.create_transfer_context().with_signer(signer);
    strategy_interface::cpi::transfer(transfer_cpi_ctx, actual_balance)?;

    return Ok(amount_added);
}

/// Harvest profits while preventing a sandwich attack exploit.
/// Base strategy function for getting revadds and do strategy harvest through Bentobox.
///
/// Arguments:
///
/// * `max_balance`       - The maximum balance of the underlying token that is allowed to be in BentoBox.
/// * `harvest_rewards`   - If we want to claim any accrued reward tokens.
/// * `signer`            - Bentobox pda signature.
pub fn base_safe_harvest<'info>(
    ctx: Context<'_, '_, '_, 'info, BaseSafeHarvest<'info>>,
    max_balance: u64,
    harvest_rewards: bool,
    signer: &[&[&[u8]]],
) -> Result<()> {
    if harvest_rewards {
        let harvest_rewards_cpi_ctx = ctx
            .accounts
            .create_harvest_rewards_context()
            .with_signer(signer)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec());
        strategy_interface::cpi::harvest_rewards(harvest_rewards_cpi_ctx)?;
    }

    let safe_harvest_cpi_ctx = ctx
        .accounts
        .create_safe_harvest_context()
        .with_signer(signer)
        .with_remaining_accounts(ctx.remaining_accounts.to_vec());
    strategy_interface::cpi::safe_harvest(safe_harvest_cpi_ctx, max_balance)?;
    Ok(())
}
