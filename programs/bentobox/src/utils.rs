use crate::{error::ErrorCode, event::*, state::*};
use anchor_lang::context::CpiContext;
use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::Result;
use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey};
use anchor_lang::{Accounts, ToAccountInfos};

use anchor_lang::solana_program::instruction::AccountMeta;

use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use common::constants::{CAULDRON_SEED_PART, DISCRIMINATOR_BYTES};
use common::utils::calculate_end_byte_to_serialize;

// use solana_program::instruction::AccountMeta;

use std::collections::BTreeMap;
use std::convert::TryInto;

// use bentobox_package::state::{BaseHarvest, BaseSkim, BaseWithdraw};
// use bentobox_package::{base_harvest, base_skim, base_withdraw};
// use crate::{base_harvest,base_skim,base_withdraw};
use common::errors::ErrorCode as CommonErrorCode;

use crate::state::{BaseStrategyInfo,ResultAmount};

pub fn flash_loan<'info>(
    ctx: CpiContext<'_, '_, '_, 'info, SPLFlashLoan<'info>>,
    amount: u64,
) -> Result<()> {
    // Write logic to form AccountMeta for all receiver accounts and
    // push into receiver_accounts,

    let ix = spl_token_lending::instruction::flash_loan(
        *ctx.accounts.lending_program.key,
        amount,
        *ctx.accounts.source_liquidity.key,
        *ctx.accounts.destination_liquidity.key, // needs to be owned by transfer_authority
        *ctx.accounts.reserve.key,
        *ctx.accounts.flash_loan_fee_receiver.key,
        *ctx.accounts.host_fee_receiver.key,
        *ctx.accounts.lending_market.key,
        *ctx.accounts.flash_loan_receiver.key,
        vec![account_info_to_meta(
            ctx.accounts.transfer_authority.clone(),
            true,
            false,
        )],
    );

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &ToAccountInfos::to_account_infos(&ctx),
        ctx.signer_seeds,
    )?;

    Ok(())
}

/// Accounts expected by this instruction:
///
///   0. `[writable]` Source liquidity token account.
///                     Minted by reserve liquidity mint.
///                     Must match the reserve liquidity supply.
///   1. `[writable]` Destination liquidity token account.
///                     Minted by reserve liquidity mint.
///   2. `[writable]` Reserve account.
///   3. `[writable]` Flash loan fee receiver account.
///                     Must match the reserve liquidity fee receiver.
///   4. `[writable]` Host fee receiver.
///   5. `[]` Lending market account.
///   6. `[]` Derived lending market authority.
///   7. `[]` Token program id.
///   8. `[]` Flash loan receiver program id.
///             Must implement an instruction that has tag of 0 and a signature of `(amount: u64)`
///             This instruction must return the amount to the source liquidity account.
///   .. `[any]` Additional accounts expected by the receiving program's `ReceiveFlashLoan` instruction.
///
///   The flash loan receiver program that is to be invoked should contain an instruction with
///   tag `0` and accept the total amount (including fee) that needs to be returned back after
///   its execution has completed.
///
///   Flash loan receiver should have an instruction with the following signature:
///
///   0. `[writable]` Source liquidity (matching the destination from above).
///   1. `[writable]` Destination liquidity (matching the source from above).
///   2. `[]` Token program id
///   .. `[any]` Additional accounts provided to the lending program's `FlashLoan` instruction above.
///   ReceiveFlashLoan {
///       // Amount that must be repaid by the receiver program
///       amount: u64
///   }
#[derive(Accounts)]
pub struct SPLFlashLoan<'info> {
    // Lending program
    /// CHECK:
    pub lending_program: AccountInfo<'info>,
    // Source liquidity token account
    /// CHECK:
    pub source_liquidity: AccountInfo<'info>,
    // Destination liquidity token account - same mint as source liquidity
    /// CHECK:
    pub destination_liquidity: AccountInfo<'info>, // must be owned by transfer authority
    // Reserve account
    /// CHECK:
    pub reserve: AccountInfo<'info>,
    // Flash loan fee receiver account
    /// CHECK:
    pub flash_loan_fee_receiver: AccountInfo<'info>,
    // Host fee receiver
    /// CHECK:
    pub host_fee_receiver: AccountInfo<'info>,
    // Lending market account
    /// CHECK:
    pub lending_market: AccountInfo<'info>,
    // Derived lending market authority - PDA
    /// CHECK:
    pub derived_lending_market_authority: AccountInfo<'info>,
    // Token program ID
    /// CHECK:
    pub token_program_id: AccountInfo<'info>,
    // Flash loan program receiver ID
    /// CHECK:
    pub flash_loan_receiver: AccountInfo<'info>,

    // ADD ANY ADDITIONAL ACCOUNTS THAT MAY BE EXPECTED BY THE
    // RECEIVER'S FLASHLOAN INSTRUCTION

    // transfer_authority
    /// CHECK:
    pub transfer_authority: AccountInfo<'info>,
}

// Helper function to convert AccountInfo to AccountMeta
pub fn account_info_to_meta<'info>(
    acct: AccountInfo<'info>,
    is_signer: bool,
    is_writable: bool,
) -> AccountMeta {
    AccountMeta {
        pubkey: *acct.key,
        is_signer: is_signer,
        is_writable: is_writable,
    }
}

/// Modifier to check if the `authority` is allowed to use funds belonging to the `from_owner` address.
///
/// # Examples
///
/// ```
/// use bentobox::utils::allowed;
///
/// allowed(from_owner, authority, bentobox_account, remaining_accounts, bentobox_program_id)?;
/// ```
///
/// # Errors
///
/// This function will return an error if authority is master contract, but no `remaining_accounts` were set.
/// If master contract was not whitelisted or approved by user.
pub fn allowed<'info>(
    from_owner: &Pubkey,
    authority: &Pubkey,
    bentobox_account: &Pubkey,
    remaining_accounts: &[AccountInfo<'info>],
    bentobox_program_id: &Pubkey,
) -> Result<()> {
    let (_bentobox_address, _) = Pubkey::find_program_address(
        &[BENTOBOX_SEED_PART, bentobox_account.as_ref()],
        bentobox_program_id,
    );

    if from_owner != authority && authority != &_bentobox_address {
        require!(
            !remaining_accounts.is_empty(),
            ErrorCode::AllowedRemainingAccountsAreEmpty
        );

        require!(
            remaining_accounts.len() == REMAINING_ACCOUNTS_COUNT_FOR_ALLOWED,
            ErrorCode::InvalidRemainingAccountsCount
        );

        let whitelisted_account =
            &match Account::<MasterContractWhitelisted>::try_from(&remaining_accounts[0]) {
                Ok(account) => account,
                _ => return Err(error!(ErrorCode::MasterContractWhitelistedAccountInvalid)),
            };

        let approved_account =
            &match Account::<MasterContractApproved>::try_from(&remaining_accounts[1]) {
                Ok(account) => account,
                _ => return Err(error!(ErrorCode::MasterContractApprovedAccountInvalid)),
            };

        let master_contract_account = &remaining_accounts[2];

        require!(
            master_contract_account.key() == whitelisted_account.master_contract_account,
            ErrorCode::InvalidCauldronAccount
        );

        let (expected_authority_address, _) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, &master_contract_account.key().as_ref()],
            master_contract_account.owner,
        );

        require!(
            expected_authority_address == authority.key(),
            ErrorCode::CauldronSignMismatch
        );

        let (expected_approved_account_address, _bump) = Pubkey::find_program_address(
            &[
                APPROVED_MASTER_CONTRACT_PART.as_ref(),
                bentobox_account.key().as_ref(),
                whitelisted_account.master_contract_account.as_ref(),
                from_owner.as_ref(),
            ],
            &bentobox_program_id,
        );

        require!(
            approved_account.master_contract_whitelisted == whitelisted_account.key()
                && expected_approved_account_address == approved_account.key()
                && approved_account.approved != false,
                ErrorCode::MasterContractNotApproved
        );
    }
    Ok(())
}

pub fn create_contract_approval_internal<'info>(
    approved: bool,
    master_contract_approved: &mut Box<Account<'info, MasterContractApproved>>,
    master_contract_whitelisted_key: Pubkey,
) -> Result<()> {
    let master_contract_approved = master_contract_approved;
    master_contract_approved.master_contract_whitelisted = master_contract_whitelisted_key;
    master_contract_approved.approved = approved;

    Ok(())
}

/// Helper function for harvest.
pub fn harvest_internal<'info>(
    balance: bool,
    max_change_amount: u64,
    strategy_program: &UncheckedAccount<'info>,
    bentobox_program: &UncheckedAccount<'info>,
    bentobox_account: &Box<Account<'info, BentoBox>>,
    strategy_account: &UncheckedAccount<'info>,
    strategy_vault: &mut Box<Account<'info, TokenAccount>>,
    total_data: &mut Total,
    bentobox_vault: &mut Box<Account<'info, TokenAccount>>,
    strategy_data: &mut Box<Account<'info, StrategyData>>,
    bentobox_authority: &mut UncheckedAccount<'info>,
    strategy_authority: &mut UncheckedAccount<'info>,
    token_program: &Program<'info, Token>,
    base_strategy_info: &UncheckedAccount<'info>,
    cpi_result_account: &mut UncheckedAccount<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    bump: u8,
) -> Result<()> {
    let bentobox_key = bentobox_account.key();
    let bentobox_program_key = bentobox_program.key();

    let authority_seeds = &[BENTOBOX_SEED_PART, bentobox_key.as_ref(), &[bump]];
    let bentobox_pda_signer = &[&authority_seeds[..]];

    let mut bentobox_authority_acc = bentobox_authority.to_account_info();
    bentobox_authority_acc.is_signer = true;
    let bentobox_authority = Signer::try_from(&bentobox_authority_acc)?;

    let mut harvest_accounts = BaseHarvest {
        strategy_program: strategy_program.clone(),
        bentobox_program: bentobox_program.clone(),
        bentobox_account: UncheckedAccount::try_from(bentobox_account.to_account_info()),
        authority: bentobox_authority.clone(),
        cpi_result_account: cpi_result_account.clone(),
        strategy_vault: strategy_vault.clone(),
        bentobox_vault: bentobox_vault.clone(),
        strategy_account: strategy_account.clone(),
        token_program: token_program.clone(),
        strategy_authority: strategy_authority.clone(),
        base_strategy_info: base_strategy_info.clone(),
    };

    let harvest_ctx = Context::new(
        &bentobox_program_key,
        &mut harvest_accounts,
        &remaining_accounts,
        BTreeMap::new(),
    );

    let balance_change: i64 = base_harvest(
        harvest_ctx,
        strategy_data.balance,
        bentobox_pda_signer,
        total_data.amount.elastic,
    )?;

    strategy_vault.reload()?;
    bentobox_vault.reload()?;

    if balance_change == 0 && !balance {
        return Ok(());
    }

    if balance_change > 0 {
        let add = balance_change as u64;
        total_data.amount.elastic = total_data
            .amount
            .elastic
            .checked_add(add.into())
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        emit!(LogStrategyProfit {
            token: bentobox_vault.mint,
            amount: add,
        });
    } else if balance_change < 0 {
        // balanceChange could overflow if it's max negative int128.
        // But tokens with balances that large are not supported by the BentoBox.
        let sub = -balance_change as u64;
        total_data.amount.elastic = total_data
            .amount
            .elastic
            .checked_sub(sub.into())
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;
        strategy_data.balance = strategy_data
            .balance
            .checked_sub(sub)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;
        emit!(LogStrategyLoss {
            token: bentobox_vault.mint,
            amount: sub,
        });
    }

    if balance {
        let target_balance = match total_data
            .amount
            .elastic
            .checked_mul(strategy_data.target_percentage.into())
        {
            Some(value) => value / 100,
            None => return Err(error!(CommonErrorCode::WrongIntegerMultiplication)),
        };
        let strategy_data_balance: u128 = strategy_data.balance.into();

        if strategy_data_balance < target_balance {
            let mut amount_out = target_balance
                .checked_sub(strategy_data.balance.into())
                .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

            if max_change_amount != 0 && amount_out > max_change_amount.into() {
                amount_out = max_change_amount.into();
            }
            // transfer to strategy
            let transfer_ctx = CpiContext::new(
                token_program.to_account_info(),
                Transfer {
                    from: bentobox_vault.to_account_info(),
                    to: strategy_vault.to_account_info(),
                    authority: bentobox_authority.to_account_info(),
                },
            )
            .with_signer(bentobox_pda_signer);

            let amount_out_converted: u64 = amount_out
                .try_into()
                .map_err(|_| CommonErrorCode::TryIntoConversionError)?;

            token::transfer(transfer_ctx, amount_out_converted)?;
            // end transfer

            strategy_data.balance = strategy_data
                .balance
                .checked_add(amount_out_converted)
                .ok_or(CommonErrorCode::WrongIntegerAddition)?;

            //skim
            let mut skim_accounts = BaseSkim {
                strategy_program: strategy_program.clone(),
                bentobox_program: bentobox_program.clone(),
                bentobox_account: UncheckedAccount::try_from(bentobox_account.to_account_info()),
                strategy_vault: strategy_vault.clone(),
                strategy_account: strategy_account.clone(),
                strategy_authority: strategy_authority.clone(),
                base_strategy_info: base_strategy_info.clone(),
                token_program: token_program.clone(),
                authority: bentobox_authority,
            };

            base_skim(
                Context::new(
                    &bentobox_program_key,
                    &mut skim_accounts,
                    &remaining_accounts,
                    BTreeMap::new(),
                ),
                amount_out_converted,
                bentobox_pda_signer,
            )?;

            emit!(LogStrategyInvest {
                token: bentobox_vault.mint,
                amount: amount_out_converted,
            });
        } else if strategy_data_balance > target_balance {
            let mut amount_in = strategy_data_balance
                .checked_sub(target_balance)
                .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

            if max_change_amount != 0 && amount_in > max_change_amount.into() {
                amount_in = max_change_amount.into();
            }
            // withdraw
            let mut withdraw_accounts = BaseWithdraw {
                strategy_program: strategy_program.clone(),
                bentobox_program: bentobox_program.clone(),
                bentobox_account: UncheckedAccount::try_from(bentobox_account.to_account_info()),
                strategy_vault: strategy_vault.clone(),
                bentobox_vault: bentobox_vault.clone(),
                strategy_account: strategy_account.clone(),
                token_program: token_program.clone(),
                strategy_authority: strategy_authority.clone(),
                base_strategy_info: base_strategy_info.clone(),
                authority: bentobox_authority,
            };

            let amount_in_converted: u64 = amount_in
                .try_into()
                .map_err(|_| CommonErrorCode::TryIntoConversionError)?;

            let actual_amount_in = base_withdraw(
                Context::new(
                    &bentobox_program_key,
                    &mut withdraw_accounts,
                    &remaining_accounts,
                    BTreeMap::new(),
                ),
                amount_in_converted,
                bentobox_pda_signer,
            )?;

            strategy_data.balance = strategy_data
                .balance
                .checked_sub(actual_amount_in)
                .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

            emit!(LogStrategyDivest {
                token: bentobox_vault.mint,
                amount: amount_in_converted,
            });
        }
    }

    Ok(())
}


/// Helper function checks if the strategy is active. (For harvest and withdraw.)
///
/// Arguments:
///
/// * `base_strategy_info` - An account is owned by the strategy which holds all common strategy info.
pub fn is_strategy_active(base_strategy_info: &BaseStrategyInfo) -> Result<()> {
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
    strategy_mock::cpi::skim(cpi_ctx, amount)?;
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
        strategy_mock::cpi::harvest(harvest_cpi_ctx, balance)?;

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
                strategy_mock::cpi::transfer(transfer_cpi_ctx, contract_balance)?;
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
                strategy_mock::cpi::transfer(transfer_cpi_ctx, diff as u64)?;
                strategy_mock::cpi::skim(skim_cpi_ctx, -amount as u64)?;
            } else {
                // we made a loss but we have some tokens we can reinvest
                strategy_mock::cpi::skim(skim_cpi_ctx, contract_balance)?;
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
    strategy_mock::cpi::withdraw(
        ctx.accounts
            .create_withdraw_context()
            .with_signer(signer)
            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        amount,
    )?;
    ctx.accounts.strategy_vault.reload()?;

    let actual_amount = ctx.accounts.strategy_vault.amount;
    strategy_mock::cpi::transfer(
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
    strategy_mock::cpi::exit(cpi_ctx)?;
    ctx.accounts.strategy_vault.reload()?;
    let actual_balance = ctx.accounts.strategy_vault.amount;
    
    let amount_added = (actual_balance - balance) as i64;
    let transfer_cpi_ctx = ctx.accounts.create_transfer_context().with_signer(signer);
    strategy_mock::cpi::transfer(transfer_cpi_ctx, actual_balance)?;
    
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
        strategy_mock::cpi::harvest_rewards(harvest_rewards_cpi_ctx)?;
    }

    let safe_harvest_cpi_ctx = ctx
        .accounts
        .create_safe_harvest_context()
        .with_signer(signer)
        .with_remaining_accounts(ctx.remaining_accounts.to_vec());
    strategy_mock::cpi::safe_harvest(safe_harvest_cpi_ctx, max_balance)?;
    Ok(())
}
