pub mod context;
pub mod error;
pub mod event;
pub mod state;
pub mod utils;

use crate::{context::*, error::ErrorCode, event::*, state::*, utils::*};
use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey, Result,solana_program::program_pack::Pack};
use anchor_spl::token::{self};
use spl_token::instruction::AuthorityType;
use std::collections::BTreeMap;

use spl_token_lending::state::Reserve;
use utils::flash_loan as spl_flash_loan;

use crate::utils::{base_exit, base_safe_harvest};

use common::errors::ErrorCode as CommonErrorCode;
use common::rebase::Rebase;

// #[cfg(feature = "mainnet-beta")]
declare_id!("DpJxHsyo8ndyjS1fHzfSRZr1vK3EbiGevNok81dGCvCd");

// #[cfg(not(feature = "mainnet-beta"))]
// declare_id!("DpJxHsyo8ndyjS1fHzfSRZr1vK3EbiGevNok81dGCvCd");

#[program]
pub mod bentobox {
    use super::*;

    /// Helper function to represent an `amount` of `token` in shares.
    ///
    /// Arguments:
    ///
    /// * `amount` - The `token` amount.
    /// * `roundUp` - If the result `share` should be rounded up.
    /// Return: The token amount represented in shares.
    pub fn to_share(ctx: Context<Conversion>, amount: u64, round_up: bool) -> Result<u64> {
        let total_data_amount: Rebase = ctx.accounts.total_data.load()?.amount.into();
        let data = total_data_amount.to_base(amount, round_up)?;

        emit!(ConversionData { data });
        Ok(data)
    }

    /// Helper function represent shares back into the `token` amount.
    ///
    /// Arguments:
    ///
    /// * `share` - The amount of shares.
    /// * `roundUp` - If the result should be rounded up.
    /// Return: The share amount back into native representation.
    pub fn to_amount(ctx: Context<Conversion>, share: u64, round_up: bool) -> Result<u64> {
        let total_data_amount: Rebase = ctx.accounts.total_data.load()?.amount.into();
        let data = total_data_amount.to_elastic(share, round_up)?;

        emit!(ConversionData { data });
        Ok(data)
    }
    /// Create bentobox function.
    pub fn create(
        ctx: Context<CreateBentoBox>,
        minimum_share_balance: u64,
        max_target_percentage: u64,
    ) -> Result<()> {
        let bentobox_account = &mut ctx.accounts.bentobox_account;
        bentobox_account.authority = ctx.accounts.authority.key();
        bentobox_account.strategy_delay = 0;
        bentobox_account.constants.minimum_share_balance = minimum_share_balance;
        bentobox_account.constants.max_target_percentage = max_target_percentage;
        Ok(())
    }

    /// Function for setting strategy delay.
    ///
    /// Arguments:
    ///
    /// * `delay` - Delay for strategy.
    pub fn set_strategy_delay(ctx: Context<SetStrategyDelay>, delay: u64) -> Result<()> {
        let bentobox_account = &mut ctx.accounts.bentobox_account;
        bentobox_account.strategy_delay = delay;
        Ok(())
    }

    /// Register Master Contract in BentoBox and creates special whitelisted account for it. It is possible to set whitelisted state here.
    ///
    /// Arguments:
    ///
    /// * `whitelisted` - True if Master Contract should be whitelisted, False othervise.
    pub fn create_master_contract_whitelist(
        ctx: Context<RegisterMasterContract>,
        whitelisted: bool,
    ) -> Result<()> {
        let master_contract_info = &mut ctx.accounts.master_contract_whitelisted;
        master_contract_info.master_contract_account = ctx.accounts.master_contract_account.key();
        master_contract_info.whitelisted = whitelisted;
        Ok(())
    }

    /// Setter instruction to change Master Contract whitelisted state.
    ///
    /// Arguments:
    ///
    /// * `whitelisted` - True if mastercontract should be whitelisted, False othervise.
    pub fn whitelist_master_contract(
        ctx: Context<WhitelistMasterContract>,
        whitelisted: bool,
    ) -> Result<()> {
        let master_contract_info = &mut ctx.accounts.master_contract_whitelisted;
        master_contract_info.whitelisted = whitelisted;
        Ok(())
    }

    /// Creates approval Master Contract account that stores user approval data.
    ///
    /// Arguments:
    ///
    /// * `approved` - If True approves access. If False revokes access.
    pub fn create_master_contract_approval(
        ctx: Context<CreateApproveMasterContract>,
        approved: bool,
    ) -> Result<()> {
        create_contract_approval_internal(
            approved,
            &mut ctx.accounts.master_contract_approved,
            ctx.accounts.master_contract_whitelisted.key(),
        )?;

        Ok(())
    }

    pub fn create_bentobox_authority_master_contract_approval(
        ctx: Context<CreateBentoboxAuthorityMasterContract>,
        approved: bool,
    ) -> Result<()> {
        create_contract_approval_internal(
            approved,
            &mut ctx.accounts.master_contract_approved,
            ctx.accounts.master_contract_whitelisted.key(),
        )?;

        Ok(())
    }

    /// Approves or revokes a Master Contract access to authority funds.
    ///
    /// Arguments:
    ///
    /// * `approved` - If True approves access. If False revokes access.
    pub fn set_master_contract_approval(
        ctx: Context<ApproveMasterContract>,
        approved: bool,
    ) -> Result<()> {
        let master_contract_approved = &mut ctx.accounts.master_contract_approved;
        master_contract_approved.approved = approved;
        Ok(())
    }

    /// Transfers ownership to `new_authority`. Either directly or claimable by the new pending owner.
    ///
    /// Arguments:
    ///
    /// * `new_authority` - Address of the new owner.
    /// * `direct` - True if `new_authority` should be set immediately. False if `newOwner` needs to use `claimOwnership`.
    /// * `renounce` - Allows the `new_authority` to be `address(0)` if `direct` and `renounce` is True. Has no effect otherwise.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
        direct: bool,
        renounce: bool,
    ) -> Result<()> {
        let bentobox_account = &mut ctx.accounts.bentobox_account;

        if direct {
            require!(
                new_authority != Pubkey::default() || renounce,
                ErrorCode::EmptyAuthorityAddress
            );

            emit!(LogAuthorityChanged {
                authority: bentobox_account.authority,
                new_authority,
            });
            bentobox_account.authority = new_authority;
            bentobox_account.pending_authority = None;
        } else {
            bentobox_account.pending_authority = Some(new_authority);
        }

        Ok(())
    }

    /// Needs to be called by `pending_authority` to claim ownership.
    pub fn claim_authority(ctx: Context<ClaimAuthority>) -> Result<()> {
        let bentobox_account = &mut ctx.accounts.bentobox_account;
        let pending_authority = bentobox_account
            .pending_authority
            .ok_or(ErrorCode::EmptyPendingAuthorityAddress)?;

        bentobox_account.authority = pending_authority;
        bentobox_account.pending_authority = None;

        emit!(LogAuthorityChanged {
            authority: bentobox_account.authority,
            new_authority: pending_authority,
        });
        Ok(())
    }

    /// Creating token account for storing total amount of token in Bentobox.
    pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
        let (vault_authority_address, _) = Pubkey::find_program_address(
            &[
                BENTOBOX_SEED_PART,
                &ctx.accounts.bentobox_account.key().as_ref(),
            ],
            ctx.program_id,
        );

        token::set_authority(
            ctx.accounts.create_change_authority_context(),
            AuthorityType::AccountOwner,
            Some(vault_authority_address),
        )?;

        // save total token account pubkey to total info
        let total_data = &mut ctx.accounts.total_data.load_init()?;
        total_data.token_account = ctx.accounts.bentobox_vault.key();
        total_data.mint_address = ctx.accounts.mint.key();

        Ok(())
    }

    /// Create balance function for deposit.
    ///
    /// Arguments:
    ///
    /// * `to` - address for which `Balance` account is created.
    pub fn create_balance(_ctx: Context<CreateBalance>, _to: Pubkey) -> Result<()> {
        Ok(())
    }

    /// Deposit an amount of token represented in either `amount` or `share`.
    ///
    /// Arguments:
    ///
    /// * `to`     - Which account to push the tokens.
    /// * `amount` - Token amount in native representation to deposit.
    /// * `share`  - Token amount represented in shares to deposit. Takes precedence over `amount`.
    pub fn deposit(
        ctx: Context<Deposit>,
        to: Pubkey,
        amount: u64,
        share: u64,
    ) -> Result<AmountShareOut> {
        allowed(
            &ctx.accounts.from.owner,
            &ctx.accounts.authority.key(),
            &ctx.accounts.bentobox_account.key(),
            &ctx.remaining_accounts,
            ctx.program_id,
        )?;

        let mut total_data = ctx.accounts.total_data.load_mut()?;

        require!(
            total_data.amount.elastic != 0
                || ctx.accounts.mint.supply > 0
                || ctx.accounts.mint.key() == spl_token::native_mint::ID,
            ErrorCode::BentoBoxNoTokens
        );

        let mut share_internal = share;
        let mut amount_internal = amount;

        let mut total_data_amount: Rebase = total_data.amount.into();

        if share_internal == 0 {
            share_internal = total_data_amount.to_base(amount_internal, false)?;

            let total_base = total_data
                .amount
                .base
                .checked_add(share_internal.into())
                .ok_or(CommonErrorCode::WrongIntegerAddition)?;

            if total_base
                < ctx
                    .accounts
                    .bentobox_account
                    .constants
                    .minimum_share_balance
                    .into()
            {
                return Ok(AmountShareOut {
                    amount_out: 0,
                    share_out: 0,
                });
            }
        } else {
            amount_internal = total_data_amount.to_elastic(share_internal, true)?;
        }

        let token_balance =
            token_balance_of(&ctx.accounts.bentobox_vault, &ctx.accounts.strategy_data)?;

        let skimmable_amount = token_balance
            .checked_sub(total_data_amount.elastic)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

        let amount_u128: u128 = amount.into();

        require!(
            ctx.accounts.bentobox_vault.key() != ctx.accounts.from.key()
                || amount_u128 <= skimmable_amount,
            ErrorCode::DepositSkimTooMuch
        );

        total_data_amount.base = total_data
            .amount
            .base
            .checked_add(share_internal.into())
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        total_data_amount.elastic = total_data
            .amount
            .elastic
            .checked_add(amount_internal.into())
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        total_data.amount = BentoboxRebase::from(total_data_amount);

        let balance = &mut ctx.accounts.balance;

        balance.amount = balance
            .amount
            .checked_add(share_internal)
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        emit!(LogDeposit {
            token: ctx.accounts.bentobox_vault.mint,
            from: ctx.accounts.from.owner,
            to,
            amount: amount_internal,
            share: share_internal
        });

        token::transfer(ctx.accounts.create_transfer_context(), amount_internal)?;

        Ok(AmountShareOut {
            amount_out: amount_internal,
            share_out: share_internal,
        })
    }

    /// Withdraws an amount of token from a user account.
    ///
    /// Arguments:
    ///
    /// * `from`   - Which user to pull the tokens.
    /// * `amount` - Amount of tokens. Either one of `amount` or `share` needs to be supplied.
    /// * `share`  - Like above, but `share` takes precedence over `amount`.
    pub fn withdraw(
        ctx: Context<Withdraw>,
        from: Pubkey,
        amount: u64,
        share: u64,
    ) -> Result<AmountShareOut> {
        allowed(
            &from,
            &ctx.accounts.authority.key(),
            &ctx.accounts.bentobox_account.key(),
            &ctx.remaining_accounts,
            ctx.program_id,
        )?;

        let mut share_internal = share;
        let mut amount_internal = amount;

        let mut total_data = ctx.accounts.total_data.load_mut()?;
        let total_data_amount: Rebase = total_data.amount.into();

        if share_internal == 0 {
            share_internal = total_data_amount.to_base(amount_internal, true)?;
        } else {
            amount_internal = total_data_amount.to_elastic(share_internal, false)?;
        }

        total_data.amount.elastic = total_data
            .amount
            .elastic
            .checked_sub(amount_internal.into())
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;
        total_data.amount.base = total_data
            .amount
            .base
            .checked_sub(share_internal.into())
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

        require!(
            total_data.amount.base
                >= ctx
                    .accounts
                    .bentobox_account
                    .constants
                    .minimum_share_balance
                    .into()
                || total_data.amount.base == 0,
            ErrorCode::WithdrawCannotEmpty
        );

        let balance = &mut ctx.accounts.balance;
        balance.amount = balance
            .amount
            .checked_sub(share_internal)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

        let bentobox_key = ctx.accounts.bentobox_account.key();

        let (_, _bump) = Pubkey::find_program_address(
            &[BENTOBOX_SEED_PART, bentobox_key.as_ref()],
            ctx.program_id,
        );

        let authority_seeds = &[BENTOBOX_SEED_PART, bentobox_key.as_ref(), &[_bump]];

        token::transfer(
            ctx.accounts
                .create_transfer_context()
                .with_signer(&[&authority_seeds[..]]),
            amount_internal,
        )?;

        emit!(LogWithdraw {
            token: ctx.accounts.bentobox_vault.mint,
            from,
            to: ctx.accounts.to.owner,
            amount: amount_internal,
            share: share_internal
        });
        Ok(AmountShareOut {
            amount_out: amount_internal,
            share_out: share_internal,
        })
    }

    /// Transfer shares from a user account to another one.
    ///
    /// Arguments:
    /// * `from`  - Which user to pull the tokens.
    /// * `to`    - Which user to push the tokens.
    /// * `share` - The amount of token in shares.
    pub fn transfer(
        ctx: Context<TransferInternal>,
        from: Pubkey,
        to: Pubkey,
        share: u64,
    ) -> Result<()> {
        allowed(
            &from,
            &ctx.accounts.authority.key(),
            &ctx.accounts.bentobox_account.key(),
            &ctx.remaining_accounts,
            ctx.program_id,
        )?;

        let balance_from = &mut ctx.accounts.balance_from;
        let balance_to = &mut ctx.accounts.balance_to;

        balance_from.amount = balance_from
            .amount
            .checked_sub(share)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

        balance_to.amount = balance_to
            .amount
            .checked_add(share)
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        emit!(LogTransfer {
            token: ctx.accounts.mint.key(),
            from,
            to,
            share
        });

        Ok(())
    }

    /// Flashloan ability.
    ///
    /// Arguments:
    ///
    /// * `amount` - The amount of the tokens to receive.
    pub fn flash_loan(ctx: Context<FlashLoan>, amount: u64) -> Result<()> {
        let (_, bump) = Pubkey::find_program_address(
            &[&ctx.accounts.flash_loan_receiver.key.as_ref()],
            &ctx.program_id,
        );
        let seeds = &[ctx.accounts.flash_loan_receiver.key.as_ref(), &[bump]];

        spl_flash_loan(ctx.accounts.create_flash_loan_cpi(&[&seeds[..]]), amount)?;

        let reserve = Reserve::unpack(&ctx.accounts.reserve.data.borrow())?;
        let (_fee, host_fee) = FlashLoan::flash_loan_fee(&reserve, amount)?;

        let mut total_data = ctx.accounts.total_data.load_mut()?;

        total_data.amount.elastic = total_data
            .amount
            .elastic
            .checked_add(host_fee.into())
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        ctx.accounts.host_fee_receiver.reload()?;

        let token_balance =
            token_balance_of(&ctx.accounts.host_fee_receiver, &ctx.accounts.strategy_data)?;

        require!(
            token_balance >= total_data.amount.elastic,
            ErrorCode::BentoBoxWrongAmount
        );

        emit!(LogFlashLoan {
            borrower: ctx.accounts.authority.key(),
            token: ctx.accounts.destination_liquidity.mint,
            amount,
            fee: host_fee,
            receiver: ctx.accounts.destination_liquidity.key()
        });
        Ok(())
    }

    /// Creating strategy data for token strategy.
    pub fn create_strategy_data(ctx: Context<CreateStrategyData>) -> Result<()> {
        let strategy_data = &mut ctx.accounts.strategy_data;
        strategy_data.strategy_start_date = 0;
        strategy_data.pending_strategy = Pubkey::default();
        strategy_data.active_strategy = Pubkey::default();

        Ok(())
    }

    /// Sets the target percentage of the strategy for token.
    /// Only the owner of this contract is allowed to change this.
    pub fn set_strategy_target_percentage(
        ctx: Context<SetStrategyTargetPercentage>,
        target_percentage: u64,
    ) -> Result<()> {
        require!(
            target_percentage
                <= ctx
                    .accounts
                    .bentobox_account
                    .constants
                    .max_target_percentage,
            ErrorCode::StrategyTargetPercentageTooHigh
        );

        let strategy_data = &mut ctx.accounts.strategy_data;
        strategy_data.target_percentage = target_percentage;

        emit!(LogStrategyTargetPercentage {
            token: ctx.accounts.mint.key(),
            target_percentage,
        });

        Ok(())
    }

    /// Sets the contract address of a new strategy for token.
    /// Must be called twice with the same arguments.
    /// A new strategy becomes pending first and can be activated once `STRATEGY_DELAY` is over.
    pub fn set_strategy<'info>(ctx: Context<'_, '_, '_, 'info, SetStrategy<'info>>) -> Result<()> {
        let mut base_exit_accounts = ctx.accounts.create_base_exit_accounts()?;

        let strategy_data = &mut ctx.accounts.strategy_data;
        
        if strategy_data.strategy_start_date == 0
            || strategy_data.pending_strategy != ctx.accounts.strategy_account.key()
        {
            strategy_data.pending_strategy = ctx.accounts.strategy_account.key();
            strategy_data.strategy_start_date =
                Clock::get()?.unix_timestamp as u64 + ctx.accounts.bentobox_account.strategy_delay;

            emit!(LogStrategyQueued {
                token: ctx.accounts.bentobox_vault.mint,
                new_strategy: ctx.accounts.strategy_account.key(),
            });
        } else {
            require!(
                strategy_data.strategy_start_date != 0
                    && strategy_data.strategy_start_date < Clock::get()?.unix_timestamp as u64,
                ErrorCode::TooEarlyStrategyStartData
            );

            if strategy_data.active_strategy != Pubkey::default() {
                let bentobox_key = ctx.accounts.bentobox_account.key();
                let (_vault_authority_address, _bump) = Pubkey::find_program_address(
                    &[BENTOBOX_SEED_PART, bentobox_key.as_ref()],
                    &ctx.program_id,
                );
                let authority_seeds = &[BENTOBOX_SEED_PART, bentobox_key.as_ref(), &[_bump]];

                let ctx_base_exit = Context::new(
                    ctx.program_id,
                    &mut base_exit_accounts,
                    &ctx.remaining_accounts,
                    BTreeMap::new(),
                );
                let balance_change: i64 = base_exit(
                    ctx_base_exit,
                    strategy_data.balance,
                    &[&authority_seeds[..]],
                )?;

                let mut total_data = ctx.accounts.total_data.load_mut()?;

                if balance_change > 0 {
                    let add = balance_change as u64;
                    total_data.amount.elastic = total_data
                        .amount
                        .elastic
                        .checked_add(add.into())
                        .ok_or(CommonErrorCode::WrongIntegerAddition)?;
                    emit!(LogStrategyProfit {
                        token: ctx.accounts.bentobox_vault.mint,
                        amount: add,
                    });
                } else {
                    let sub = -balance_change as u64;
                    total_data.amount.elastic = total_data
                        .amount
                        .elastic
                        .checked_sub(sub.into())
                        .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;
                    emit!(LogStrategyLoss {
                        token: ctx.accounts.bentobox_vault.mint,
                        amount: sub,
                    });
                }

                emit!(LogStrategyDivest {
                    token: ctx.accounts.bentobox_vault.mint,
                    amount: strategy_data.balance,
                });
            }

            strategy_data.active_strategy = strategy_data.pending_strategy;
            strategy_data.strategy_start_date = 0;
            strategy_data.balance = 0;
            strategy_data.pending_strategy = Pubkey::default();

            emit!(LogStrategySet {
                token: ctx.accounts.bentobox_vault.mint,
                new_strategy: ctx.accounts.strategy_program.key.clone(),
            });
        }

        Ok(())
    }

    /// The actual process of yield farming. Executes the strategy of token.
    /// Optionally does housekeeping if `balance` is true.
    /// `maxChangeAmount` is relevant for skimming or withdrawing if `balance` is true.
    /// Arguments:
    ///
    /// * `balance` - True if housekeeping should be done.
    /// * `maxChangeAmount` - The maximum amount for either pulling or pushing from/to the Strategy contract.
    pub fn harvest<'info>(
        ctx: Context<'_, '_, '_, 'info, Harvest<'info>>,
        balance: bool,
        max_change_amount: u64,
        bump: u8,
    ) -> Result<()> {
        let mut total_data = ctx.accounts.total_data.load_mut()?;
        utils::harvest_internal(
            balance,
            max_change_amount,
            &ctx.accounts.strategy_program,
            &ctx.accounts.bentobox_program,
            &ctx.accounts.bentobox_account,
            &ctx.accounts.strategy_account,
            &mut ctx.accounts.strategy_vault,
            &mut total_data,
            &mut ctx.accounts.bentobox_vault,
            &mut ctx.accounts.strategy_data,
            &mut ctx.accounts.bentobox_authority,
            &mut ctx.accounts.strategy_authority,
            &ctx.accounts.token_program,
            &ctx.accounts.base_strategy_info,
            &mut ctx.accounts.cpi_result_account,
            &ctx.remaining_accounts.to_vec(),
            bump,
        )?;

        Ok(())
    }

    /// Harvest profits while preventing a sandwich attack exploit.
    ///
    /// Arguments:
    ///
    /// * `max_balance` - The maximum balance of the underlying token that is allowed to be in BentoBox.
    /// * `rebalance` - Whether BentoBox should rebalance the strategy assets to acheive it's target allocation.
    /// * `max_change_amount` - When rebalancing - the maximum amount that will be deposited to or withdrawn from a strategy to BentoBox.
    /// * `harvest_rewards` - If we want to claim any accrued reward tokens.
    #[access_control(SafeHarvest::only_executors(&ctx))]
    pub fn safe_harvest<'info>(
        ctx: Context<'_, '_, '_, 'info, SafeHarvest<'info>>,
        max_balance: u64,
        rebalance: bool,
        max_change_amount: u64,
        harvest_rewards: bool,
        bump: u8,
    ) -> Result<()> {
        let bentobox_key = ctx.accounts.bentobox_account.key();

        let authority_seeds = &[BENTOBOX_SEED_PART, bentobox_key.as_ref(), &[bump]];
        let bentobox_pda_signer = &[&authority_seeds[..]];

        let mut bentobox_authority = ctx.accounts.bentobox_authority.to_account_info();
        bentobox_authority.is_signer = true;

        let mut base_safe_harvest_accounts = ctx.accounts.create_base_safe_harvest_accounts()?;

        let safe_harvest_ctx = Context::new(
            ctx.program_id,
            &mut base_safe_harvest_accounts,
            &ctx.remaining_accounts,
            BTreeMap::new(),
        );

        base_safe_harvest(
            safe_harvest_ctx,
            max_balance,
            harvest_rewards,
            bentobox_pda_signer,
        )?;

        ctx.accounts.strategy_vault.reload()?;

        let mut total_data = ctx.accounts.total_data.load_mut()?;

        utils::harvest_internal(
            rebalance,
            max_change_amount,
            &ctx.accounts.strategy_program,
            &ctx.accounts.bentobox_program,
            &ctx.accounts.bentobox_account,
            &ctx.accounts.strategy_account,
            &mut ctx.accounts.strategy_vault,
            &mut total_data,
            &mut ctx.accounts.bentobox_vault,
            &mut ctx.accounts.strategy_data,
            &mut ctx.accounts.bentobox_authority,
            &mut ctx.accounts.strategy_authority,
            &ctx.accounts.token_program,
            &ctx.accounts.base_strategy_info,
            &mut ctx.accounts.cpi_result_account,
            &ctx.remaining_accounts.to_vec(),
            bump,
        )?;

        Ok(())
    }
}
