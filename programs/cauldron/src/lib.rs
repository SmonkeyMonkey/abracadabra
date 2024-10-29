use anchor_lang::prelude::*;

pub mod context;
pub mod error;
pub mod event;
pub mod state;
pub mod utils;

use crate::{context::*, error::ErrorCode, event::*, state::*, utils::*};
use anchor_spl::token::{self};
use spl_token::instruction::AuthorityType;

use common::{errors::ErrorCode as CommonErrorCode, rebase::Rebase};

use bentobox::{cpi::accounts::CreateApproveMasterContract, state::AmountShareOut};

declare_id!("FCWEJMXfDpMZQvBPCwkZWBt3XftojoFSiqFzkWAv8rvd");

#[program]

pub mod cauldron {

    use super::*;

    /// Initialize cauldron function.
    pub fn initialize(
        ctx: Context<Initialize>,
        interest_per_second: u64,
        collaterization_rate: u64,
        collaterization_rate_precision: u64,
        liquidation_multiplier: u64,
        liquidation_multiplier_precision: u64,
        distribution_part: u64,
        distribution_precision: u64,
        stale_after_slots_elapsed: u64,
        fee_to: Pubkey,
        borrow_opening_fee: u64,
        borrow_opening_fee_precision: u64,
        one_percent_rate: u64,
        complete_liquidation_duration: u64,
    ) -> Result<()> {
        let cauldron_account = &mut ctx.accounts.cauldron_account;
        let switchboard_data_feed = &ctx.accounts.switchboard_data_feed;
        cauldron_account.constants.stale_after_slots_elapsed = stale_after_slots_elapsed;
        cauldron_account.authority = ctx.accounts.authority.key();

        cauldron_account.accrue_info.interest_per_second = interest_per_second;
        cauldron_account.constants.collaterization_rate = collaterization_rate;
        cauldron_account.constants.collaterization_rate_precision = collaterization_rate_precision;
        cauldron_account.constants.liquidation_multiplier = liquidation_multiplier;
        cauldron_account.constants.liquidation_multiplier_precision =
            liquidation_multiplier_precision;

        cauldron_account.constants.distribution_part = distribution_part;
        cauldron_account.constants.distribution_precision = distribution_precision;
        cauldron_account.constants.borrow_opening_fee = borrow_opening_fee;
        cauldron_account.constants.borrow_opening_fee_precision = borrow_opening_fee_precision;

        cauldron_account.constants.complete_liquidation_duration = complete_liquidation_duration;

        cauldron_account.borrow_limit.total = u64::MAX;
        cauldron_account.borrow_limit.borrow_part_per_address = u64::MAX;

        cauldron_account.fee_to = fee_to;
        cauldron_account.constants.one_percent_rate = one_percent_rate;
        cauldron_account.magic_internet_money = ctx.accounts.magic_internet_money.key();
        cauldron_account.collateral = ctx.accounts.collateral.key();
        validate_switchboard_data_feed(&switchboard_data_feed.to_account_info())?;
        cauldron_account.switchboard_data_feed = switchboard_data_feed.key();

        cauldron_account.bentobox = ctx.accounts.bentobox_account.key();
        cauldron_account.bentobox_program = ctx
            .accounts
            .bentobox_account
            .to_account_info()
            .owner
            .clone();

        Ok(())
    }

    /// Create user balance accounts (user collateral and user borrow part).
    /// Arguments:
    ///
    /// * `user` - User for which we want to create user_balance account.
    pub fn create_user_balance(_ctx: Context<CreateUserBalance>, _user: Pubkey) -> Result<()> {
        Ok(())
    }

    /// Creating token account for Cauldron.
    pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
        let (vault_authority_address, _) = Pubkey::find_program_address(
            &[
                CAULDRON_SEED_PART,
                &ctx.accounts.cauldron_account.key().as_ref(),
            ],
            ctx.program_id,
        );

        token::set_authority(
            ctx.accounts.create_change_authority_context(),
            AuthorityType::AccountOwner,
            Some(vault_authority_address),
        )?;
        Ok(())
    }

    /// Creating account for storing total amounts for Cauldron.
    pub fn create_total(_ctx: Context<CreateTotal>) -> Result<()> {
        Ok(())
    }

    // Accrues the interest on the borrowed tokens and handles the accumulation of fees.
    pub fn accrue(ctx: Context<Accrue>) -> Result<()> {
        let accrue_info = &mut ctx.accounts.cauldron_account.accrue_info;
        let total_data = &mut ctx.accounts.total_data.load_mut()?;
        utils::accrue_internal(accrue_info, total_data)?;

        Ok(())
    }

    /// Get data from switchboard oracle.
    pub fn switchboard_price(ctx: Context<SwitchboardPrice>) -> Result<f64> {
        let switchboard_data_feed = &ctx.accounts.switchboard_data_feed;

        validate_switchboard_data_feed(&switchboard_data_feed.to_account_info())?;
        let price = get_switchboard_price(
            &switchboard_data_feed,
            &Clock::get()?,
            &ctx.accounts
                .cauldron_account
                .constants
                .stale_after_slots_elapsed,
        )?;

        emit!(LogSwitchboardPrice {
            mantissa: price.mantissa,
            scale: price.scale,
        });

        Ok(price.try_into()?)
    }

    /// Repays a loan.
    ///
    /// Arguments:
    ///
    /// * `part` - The amount to repay. See `userBorrowPart`.
    /// * `skim` - True if the amount should be skimmed from the deposit balance of msg.sender.
    ///            False if tokens from msg.sender in `bentoBox` should be transferred.
    /// * `to` - Address of the user this payment should go..
    /// return amount The total amount repayed.
    pub fn repay<'info>(
        ctx: Context<'_, '_, '_, 'info, Repay<'info>>,
        to: Pubkey,
        skim: bool,
        part: u64,
    ) -> Result<i64> {
        let accrue_info = &mut ctx.accounts.cauldron_account.accrue_info;
        let total_data = &mut ctx.accounts.total_data.load_mut()?;

        utils::accrue_internal(accrue_info, total_data)?;

        let bentobox_authority = ctx.remaining_accounts[0].clone();

        let from_key: AccountInfo;
        if skim {
            from_key = bentobox_authority;
        } else {
            from_key = ctx.accounts.authority.to_account_info();
        };

        let amount = utils::repay(
            part,
            total_data,
            ctx.accounts.from_bentobox_balance.to_account_info(),
            from_key.clone(),
            ctx.accounts.magic_internet_money_mint.to_account_info(),
            ctx.accounts.bentobox_total_data.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &mut ctx.accounts.user_balance,
            &ctx.accounts.cauldron_account,
            ctx.accounts.cauldron_bentobox_balance.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            &[
                ctx.accounts.master_contract_whitelisted.to_account_info(),
                ctx.accounts.master_contract_approved.to_account_info(),
                ctx.accounts.cauldron_account.to_account_info(),
            ],
        )?;

        emit!(LogRepay {
            from: from_key.key(),
            to: to,
            part: part,
        });

        Ok(amount)
    }

    /// Check if switchboard price is valid.
    ///
    /// Arguments:
    /// * `min_rate` - minimum allowed price rate.
    /// * `max_rate` - maximum allowed price rate
    pub fn is_valid_price(
        ctx: Context<SwitchboardPrice>,
        min_rate: f64,
        max_rate: f64,
    ) -> Result<bool> {
        let switchboard_data_feed = &ctx.accounts.switchboard_data_feed;

        validate_switchboard_data_feed(&switchboard_data_feed.to_account_info())?;
        let price: f64 = get_switchboard_price(
            &switchboard_data_feed,
            &Clock::get()?,
            &ctx.accounts
                .cauldron_account
                .constants
                .stale_after_slots_elapsed,
        )?
        .try_into()?;

        Ok(price <= max_rate && price >= min_rate)
    }

    /// User borrows `amount` and transfers it to `to` on bentobox.
    pub fn borrow<'info>(
        ctx: Context<'_, '_, '_, 'info, Borrow<'info>>,
        to: Pubkey,
        amount: u64,
    ) -> Result<(u64, u64)> {
        
        {
            let total_data = &mut ctx.accounts.total_data.load_mut()?;
            utils::accrue_internal(&mut ctx.accounts.cauldron_account.accrue_info, total_data)?;
        }

        let (part, share) = utils::borrow_internal(to, amount, ctx.accounts)?;

        let price_decimal = get_switchboard_price(
            &ctx.accounts.switchboard_data_feed,
            &Clock::get()?,
            &ctx.accounts
                .cauldron_account
                .constants
                .stale_after_slots_elapsed,
        )?;
        utils::solvent(
            &ctx.accounts.user_balance,
            &price_decimal,
            &*ctx.accounts.total_data.load()?,
            &ctx.accounts.magic_internet_money_mint.to_account_info(),
            &ctx.accounts.bentobox_total_data.to_account_info(),
            &ctx.accounts.bentobox_account.to_account_info(),
            &ctx.accounts.bentobox_program.to_account_info(),
            &ctx.accounts.cauldron_account,
        )?;

        Ok((part, share))
    }

    /// Adds collateral from sender to the account user_balance.
    ///
    /// Arguments:
    ///
    /// * `to`    - The receiver of the tokens.
    /// * `share` - The amount of shares to add for `to`.
    /// * `skim`  - True if the amount should be skimmed from the deposit balance sender.
    ///            False if tokens from msg.sender in `bentoBox` should be transferred.
    pub fn add_collateral<'info>(
        ctx: Context<'_, '_, '_, 'info, AddCollateral<'info>>,
        to: Pubkey,
        share: u64,
        skim: bool,
    ) -> Result<()> {
        let user_balance = &mut ctx.accounts.user_balance;
        user_balance.collateral_share = user_balance
            .collateral_share
            .checked_add(share)
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        let total_data = &mut ctx.accounts.total_data.load_mut()?;

        let old_total_collateral_share = total_data.collateral_share;
        total_data.collateral_share = total_data
            .collateral_share
            .checked_add(share)
            .ok_or(CommonErrorCode::WrongIntegerAddition)?;

        // add tokens
        if skim {
            require!(
                share
                    <= ctx
                        .accounts
                        .cauldron_bentobox_balance
                        .amount
                        .checked_sub(old_total_collateral_share)
                        .ok_or(CommonErrorCode::WrongIntegerSubtraction)?,
                ErrorCode::SkimTooMuch
            );
        } else {
            let cauldron_account = &ctx.accounts.cauldron_account;
            let cauldron_key = cauldron_account.key();
            let (_, _bump) = Pubkey::find_program_address(
                &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
                &ctx.program_id,
            );
            let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

            // count of remaining accounts
            let remaining_accounts = ctx.remaining_accounts;

            require!(
                remaining_accounts.len() == ADD_COLLATERAL_REMAINING_ACCOUNTS_COUNT,
                ErrorCode::IncorrectRemainingAccounts
            );

            // check collateral
            let collateral = &remaining_accounts[0];

            require!(
                cauldron_account.collateral == collateral.key(),
                ErrorCode::InvalidCollateral
            );

            // check bentobox_program
            let bentobox_program = &remaining_accounts[2];

            require!(
                cauldron_account.bentobox_program == bentobox_program.key(),
                ErrorCode::InvalidBentoboxProgramAccount
            );

            // check bentobox_account
            let bentobox_account = &remaining_accounts[3];

            require!(
                cauldron_account.bentobox == bentobox_account.key(),
                ErrorCode::InvalidBentoboxAccount
            );

            create_bentobox_transfer_context(
                share,
                ctx.accounts.authority.key(),
                remaining_accounts[1].clone(),
                ctx.accounts.cauldron_authority.key(),
                ctx.accounts.cauldron_bentobox_balance.to_account_info(),
                collateral.to_account_info(),
                bentobox_account.to_account_info(),
                ctx.accounts.cauldron_authority.to_account_info(),
                bentobox_program.to_account_info(),
                &[&authority_seeds[..]],
                &[
                    remaining_accounts[4].clone(),
                    remaining_accounts[5].clone(),
                    ctx.accounts.cauldron_account.to_account_info(),
                ],
            )?;
        }
        let from = if skim {
            ctx.accounts.cauldron_account.bentobox
        } else {
            ctx.accounts.authority.key()
        };

        emit!(LogAddCollateral { from, to, share });
        Ok(())
    }

    ///  Removes `share` amount of collateral and transfers it to `to`.
    ///
    /// Arguments:
    ///
    /// * `to`    - The receiver of the shares.
    /// * `share` - The amount of shares to remove.
    pub fn remove_collateral<'info>(
        ctx: Context<RemoveCollateral>,
        to: Pubkey,
        share: u64,
    ) -> Result<()> {
        {
            let accrue_info = &mut ctx.accounts.cauldron_account.accrue_info;

            let total_data = &mut ctx.accounts.total_data.load_mut()?;
            utils::accrue_internal(accrue_info, total_data)?;

            utils::remove_collateral(
                share,
                &mut ctx.accounts.user_balance,
                total_data,
                ctx.accounts.collateral.to_account_info(),
                ctx.accounts.cauldron_account.to_account_info(),
                ctx.accounts.cauldron_bentobox_balance.to_account_info(),
                to,
                ctx.accounts.to_bentobox_balance.to_account_info(),
                ctx.accounts.bentobox_account.to_account_info(),
                ctx.accounts.bentobox_program.to_account_info(),
                ctx.accounts.cauldron_authority.to_account_info(),
                &[
                    ctx.accounts.master_contract_approved.to_account_info(),
                    ctx.accounts.master_contract_whitelisted.to_account_info(),
                    ctx.accounts.cauldron_account.to_account_info(),
                ],
            )?;
        }

        let price_decimal = get_switchboard_price(
            &ctx.accounts.switchboard_data_feed,
            &Clock::get()?,
            &ctx.accounts
                .cauldron_account
                .constants
                .stale_after_slots_elapsed,
        )?;

        utils::solvent(
            &ctx.accounts.user_balance,
            &price_decimal,
            &*ctx.accounts.total_data.load()?,
            &ctx.accounts.collateral.to_account_info(),
            &ctx.accounts.bentobox_total_data.to_account_info(),
            &ctx.accounts.bentobox_account.to_account_info(),
            &ctx.accounts.bentobox_program.to_account_info(),
            &ctx.accounts.cauldron_account,
        )?;

        Ok(())
    }

    /// Create master contract approval account for cauldron_authority. Needed to save cauldron funds on bentobox.
    pub fn create_cauldron_approval_account(
        ctx: Context<CreateCauldronApprovalAccount>,
    ) -> Result<()> {
        let mut cauldron_authority = &mut ctx.accounts.cauldron_authority.to_account_info();
        cauldron_authority.is_signer = true;

        let cpi_accounts = CreateApproveMasterContract {
            master_contract_approved: ctx.accounts.master_contract_approved.to_account_info(),
            master_contract_whitelisted: ctx.accounts.master_contract_whitelisted.to_account_info(),
            master_contract_program: ctx.accounts.cauldron_program.to_account_info(),
            master_contract_account: ctx.accounts.cauldron_account.to_account_info(),
            authority: cauldron_authority.clone(),
            payer: ctx.accounts.authority.to_account_info(),
            bentobox_account: ctx.accounts.bentobox_account.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };

        let cauldron_key = ctx.accounts.cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];
        Ok(bentobox::cpi::create_master_contract_approval(
            CpiContext::new(
                ctx.accounts.bentobox_program.to_account_info(),
                cpi_accounts,
            )
            .with_signer(&[&authority_seeds[..]]),
            true,
        )?)
    }

    ///  Depositing into `BentoBox`
    ///
    /// Arguments:
    ///
    /// * `to`     - Which account to push the tokens.
    /// * `amount` - Token amount in native representation to deposit.
    /// * `share`  - Token amount represented in shares to deposit. Takes precedence over `amount`.

    pub fn bento_deposit<'info>(
        ctx: Context<BentoDeposit>,
        to: Pubkey,
        amount: u64,
        share: u64,
    ) -> Result<AmountShareOut> {
        let cauldron_account = &ctx.accounts.cauldron_account;

        validate_whitelisted_account(
            &ctx.accounts.master_contract_whitelisted,
            &cauldron_account.to_account_info(),
        )?;

        let cauldron_key = cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        Ok(utils::bento_deposit(
            to,
            amount,
            share,
            ctx.accounts.from_vault.to_account_info(),
            ctx.accounts.bentobox_vault.to_account_info(),
            ctx.accounts.bentobox_to_balance.to_account_info(),
            ctx.accounts.bentobox_total_data.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.bentobox_strategy_data.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            vec![
                ctx.accounts.master_contract_whitelisted.to_account_info(),
                ctx.accounts.master_contract_approved.to_account_info(),
                cauldron_account.to_account_info(),
            ],
            &[&authority_seeds[..]],
        )?)
    }

    ///  Withdrawing from `BentoBox`
    ///
    /// Arguments:
    ///
    /// * `amount` - Token amount in native representation to withdraw.
    /// * `share` - Token amount represented in shares to withdraw. Takes precedence over `amount`.

    pub fn bento_withdraw<'info>(
        ctx: Context<BentoWithdraw>,
        amount: u64,
        share: u64,
    ) -> Result<AmountShareOut> {
        let cauldron_account = &ctx.accounts.cauldron_account;
        validate_whitelisted_account(
            &ctx.accounts.master_contract_whitelisted,
            &cauldron_account.to_account_info(),
        )?;

        let cauldron_key = cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        Ok(utils::bento_withdraw(
            ctx.accounts.authority.key(),
            amount,
            share,
            ctx.accounts.to_vault.to_account_info(),
            ctx.accounts.bentobox_vault.to_account_info(),
            ctx.accounts.bentobox_from_balance.to_account_info(),
            ctx.accounts.bentobox_total_data.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.bentobox_vault_authority.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            vec![
                ctx.accounts.master_contract_whitelisted.to_account_info(),
                ctx.accounts.master_contract_approved.to_account_info(),
                cauldron_account.to_account_info(),
            ],
            &[&authority_seeds[..]],
        )?)
    }

    ///  Bentobox transfer
    ///
    /// Arguments:
    /// * `from`  - Which user to pull the tokens.
    /// * `to`    - Which user to push the tokens.
    /// * `share` - The amount of token in shares.
    pub fn bento_transfer<'info>(
        ctx: Context<BentoTransfer>,
        from: Pubkey,
        to: Pubkey,
        share: u64,
    ) -> Result<()> {
        let cauldron_key = ctx.accounts.cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        create_bentobox_transfer_context(
            share,
            from,
            ctx.accounts.from_bentobox_balance.to_account_info(),
            to,
            ctx.accounts.to_bentobox_balance.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &[&authority_seeds[..]],
            &vec![
                ctx.accounts.master_contract_whitelisted.to_account_info(),
                ctx.accounts.master_contract_approved.to_account_info(),
                ctx.accounts.cauldron_account.to_account_info(),
            ],
        )?;

        Ok(())
    }

    ///  Delegate authority to cauldron or all of their token balance by the account owner.
    pub fn approve_to_cauldron<'info>(ctx: Context<ApproveToCauldron>) -> Result<()> {
        token::approve(ctx.accounts.create_approve_context(), u64::MAX)?;
        Ok(())
    }

    /// Sets the beneficiary of interest accrued. ONLY for cauldron account authority.
    ///
    /// Arguments:
    ///
    /// * `new_fee_to` - The address of the receiver.
    pub fn set_fee_to<'info>(ctx: Context<SetFeeTo>, new_fee_to: Pubkey) -> Result<()> {
        let cauldron_account = &mut ctx.accounts.cauldron_account;
        cauldron_account.fee_to = new_fee_to;
        emit!(LogFeeTo { new_fee_to });
        Ok(())
    }

    /// Withdraws the fees accumulated.
    pub fn withdraw_fees<'info>(ctx: Context<WithdrawFees>) -> Result<()> {
        let cauldron_account = ctx.accounts.cauldron_account.clone();

        let accrue_info = &mut ctx.accounts.cauldron_account.accrue_info;
        let total_data = &mut ctx.accounts.total_data.load_mut()?;
        utils::accrue_internal(accrue_info, total_data)?;

        let fee_to = cauldron_account.fee_to;
        let fees_earned = accrue_info.fees_earned;

        let share: u64 = bentobox::cpi::to_share(
            create_conversion_context(
                ctx.accounts.bentobox_program.to_account_info(),
                ctx.accounts.magic_internet_money.to_account_info(),
                ctx.accounts.bentobox_total_data.to_account_info(),
                ctx.accounts.bentobox_account.to_account_info(),
            ),
            fees_earned.try_into().unwrap(),
            false,
        )?
        .get();

        let cauldron_key = cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        create_bentobox_transfer_context(
            share,
            ctx.accounts.cauldron_authority.key(),
            ctx.accounts.cauldron_bentobox_balance.to_account_info(),
            fee_to,
            ctx.accounts.fee_to_bentobox_balance.to_account_info(),
            ctx.accounts.magic_internet_money.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &[&authority_seeds[..]],
            &[],
        )?;

        accrue_info.fees_earned = 0;

        emit!(LogWithdrawFees {
            fee_to,
            fees_earned_fraction: fees_earned
        });
        Ok(())
    }

    ///  Reduces the supply of MIM. ONLY for cauldron account authority.
    ///
    /// Arguments:
    ///
    /// * `amount` - amount to reduce supply by
    pub fn reduce_supply<'info>(ctx: Context<ReduceSupply>, amount: u64) -> Result<AmountShareOut> {
        let cauldron_account = &ctx.accounts.cauldron_account;

        let cauldron_key = cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        let reduce_amount: u64;

        if amount > ctx.accounts.cauldron_bentobox_balance.amount {
            reduce_amount = ctx.accounts.cauldron_bentobox_balance.amount;
        } else {
            reduce_amount = amount;
        }

        let amount_share_out = utils::bento_withdraw(
            ctx.accounts.cauldron_authority.key(),
            reduce_amount,
            0,
            ctx.accounts.cauldron_owner_vault.to_account_info(),
            ctx.accounts.bentobox_vault.to_account_info(),
            ctx.accounts.cauldron_bentobox_balance.to_account_info(),
            ctx.accounts.bentobox_total_data.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.bentobox_vault_authority.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            vec![],
            &[&authority_seeds[..]],
        )?;

        ctx.accounts.cauldron_bentobox_balance.reload()?;

        emit!(LogReduceSuply {
            reduce_amount: reduce_amount,
            amount_left: ctx.accounts.cauldron_bentobox_balance.amount,
        });

        Ok(amount_share_out)

    }

    /// Allows to change the borrow limit. ONLY for cauldron account authority.
    ///
    /// Arguments:
    ///
    /// * `new_borrow_limit` - new borrow limit.
    /// * `per_address_part` - new borrow limit per address.
    pub fn change_borrow_limit<'info>(
        ctx: Context<ChangeBorrowLimit>,
        new_borrow_limit: u64,
        per_address_part: u64,
    ) -> Result<()> {
        let cauldron_account = &mut ctx.accounts.cauldron_account;
        cauldron_account.borrow_limit = BorrowCap {
            total: new_borrow_limit,
            borrow_part_per_address: per_address_part,
        };
        emit!(LogChangeBorrowLimit {
            new_borrow_limit,
            per_address_part
        });
        Ok(())
    }

    /// Allows to change the interest rate. ONLY for cauldron account authority.
    ///
    /// Arguments:
    ///
    /// * `new_interest_rate` - new interest rate.
    pub fn change_interest_rate<'info>(
        ctx: Context<ChangeInterestRate>,
        new_interest_rate: u64,
    ) -> Result<()> {
        let cauldron_account = &mut ctx.accounts.cauldron_account;

        let old_interest_rate = cauldron_account.accrue_info.interest_per_second;

        require!(
            new_interest_rate < old_interest_rate + old_interest_rate * 3 / 4
                || new_interest_rate <= cauldron_account.constants.one_percent_rate,
            ErrorCode::NotValidInterestRate
        );

        require!(
            cauldron_account.last_interest_update.clone() + THREE_DAYS
                < Clock::get().unwrap().unix_timestamp as u64,
            ErrorCode::TooSoonToUpdateInterestRate
        );


        cauldron_account.last_interest_update = Clock::get()?.unix_timestamp as u64;

        emit!(LogInterestChange {
            old_interest_rate,
            new_interest_rate
        });
        cauldron_account.accrue_info.interest_per_second = new_interest_rate;

        Ok(())
    }

    /// Get repay in share through bentobox
    ///
    /// Arguments:
    ///
    /// * `base_amount` - amount in base.
    pub fn get_repay_share<'info>(ctx: Context<GetRepayShare>, base_amount: u64) -> Result<u64> {
        let elastic =
            Rebase::from(ctx.accounts.total_data.load()?.borrow).to_elastic(base_amount, true)?;

        Ok(bentobox::cpi::to_share(
            create_conversion_context(
                ctx.accounts.bentobox_program.to_account_info(),
                ctx.accounts.magic_internet_money.to_account_info(),
                ctx.accounts.bentobox_total_data.to_account_info(),
                ctx.accounts.bentobox_account.to_account_info(),
            ),
            elastic,
            true,
        )?
        .get())
    }

    /// Allows to change the interest rate.
    ///
    /// Arguments:
    ///
    /// * `amount` - elastic amount
    pub fn get_repay_part<'info>(ctx: Context<GetRepayPart>, amount: u64) -> Result<u64> {
        Rebase::from(ctx.accounts.total_data.load()?.borrow).to_base(amount, false)
    }

    pub fn liquidate<'info>(
        ctx: Context<'_, '_, '_, 'info, Liquidate<'info>>,
        _user: Pubkey,
        max_borrow_part: u64,
        to: Pubkey,
    ) -> Result<()> {
        let cauldron_key = ctx.accounts.cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        let (borrow_amount, mut borrow_share, collateral_share) = utils::liquidate_internal(
            max_borrow_part,
            &ctx.accounts.switchboard_data_feed,
            &mut ctx.accounts.cauldron_account,
            ctx.accounts.total_data.clone(),
            &ctx.accounts.collateral.to_account_info(),
            ctx.accounts.magic_internet_money_mint.to_account_info(),
            ctx.accounts.bentobox_collateral_total_data.clone(),
            ctx.accounts.bentobox_mim_total_data.clone(),
            &ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &mut ctx.accounts.user_balance,
        )?;

        create_bentobox_transfer_context(
            collateral_share,
            ctx.accounts.cauldron_authority.key(),
            ctx.accounts
                .cauldron_collateral_bentobox_balance
                .to_account_info(),
            to,
            ctx.accounts
                .authority_collateral_bentobox_balance
                .to_account_info(),
            ctx.accounts.collateral.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &[&authority_seeds[..]],
            &[],
        )?;

        borrow_share = bentobox::cpi::to_share(
            create_conversion_context(
                ctx.accounts.bentobox_program.to_account_info(),
                ctx.accounts.magic_internet_money_mint.to_account_info(),
                ctx.accounts.bentobox_mim_total_data.to_account_info(),
                ctx.accounts.bentobox_account.to_account_info(),
            ),
            borrow_amount,
            true,
        )?
        .get();

        create_bentobox_transfer_context(
            borrow_share,
            ctx.accounts.authority.key(),
            ctx.accounts
                .authority_mim_bentobox_balance
                .to_account_info(),
            ctx.accounts.cauldron_authority.key(),
            ctx.accounts.cauldron_mim_bentobox_balance.to_account_info(),
            ctx.accounts.magic_internet_money_mint.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &[&authority_seeds[..]],
            &[
                ctx.accounts.master_contract_whitelisted.to_account_info(),
                ctx.accounts.master_contract_approved.to_account_info(),
                ctx.accounts.cauldron_account.to_account_info(),
            ],
        )?;
        Ok(())
    }

    /// 1 of 3 instruction for liquidate position with swappper.
    pub fn begin_liquidate<'info>(
        ctx: Context<'_, '_, '_, 'info, BeginLiquidate<'info>>,
        _user: Pubkey,
        max_borrow_part: u64,
    ) -> Result<()> {
        let (borrow_amount, borrow_share, collateral_share) = utils::liquidate_internal(
            max_borrow_part,
            &ctx.accounts.switchboard_data_feed,
            &mut ctx.accounts.cauldron_account,
            ctx.accounts.total_data.clone(),
            &ctx.accounts.collateral.to_account_info(),
            ctx.accounts.magic_internet_money_mint.to_account_info(),
            ctx.accounts.bentobox_collateral_total_data.clone(),
            ctx.accounts.bentobox_mim_total_data.clone(),
            &ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &mut ctx.accounts.user_balance,
        )?;

        let cauldron_key = ctx.accounts.cauldron_account.key();
        let constants = ctx.accounts.cauldron_account.constants.clone();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        let amount_share_out: AmountShareOut = utils::bento_withdraw(
            ctx.accounts.cauldron_authority.key(),
            0,
            collateral_share,
            ctx.accounts.cauldron_source_vault.to_account_info(),
            ctx.accounts.bentobox_collateral_vault.to_account_info(),
            ctx.accounts
                .cauldron_collateral_bentobox_balance
                .to_account_info(),
            ctx.accounts
                .bentobox_collateral_total_data
                .to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.bentobox_vault_authority.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            vec![],
            &[&authority_seeds[..]],
        )?;

        let liquidator_account = &mut ctx.accounts.liquidator_account;
        liquidator_account.origin_liquidator = ctx.accounts.authority.key();
        liquidator_account.collateral_share = amount_share_out.amount_out;
        liquidator_account.borrow_amount = borrow_amount;
        liquidator_account.borrow_share = borrow_share;
        liquidator_account.timestamp =
            Clock::get()?.unix_timestamp as u64 + constants.complete_liquidation_duration;

        Ok(())
    }

    /// Allows swap collateral to MIM.
    /// 2 of 3 instruction for liquidate position with swappper.
    pub fn liquidate_swap<'info>(
        ctx: Context<'_, '_, '_, 'info, LiquidateSwap<'info>>,
    ) -> Result<()> {
        let liquidator_account = &ctx.accounts.liquidator_account;

        require!(
            liquidator_account.origin_liquidator == ctx.accounts.authority.key()
                || liquidator_account.timestamp < Clock::get()?.unix_timestamp as u64,
            ErrorCode::TooSoon
        );

        let cauldron_account = &ctx.accounts.cauldron_account;

        let cauldron_key = cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        let mut cauldron_destination_vault = ctx.accounts.cauldron_destination_vault.clone();
        let mim_vault_amount = cauldron_destination_vault.amount;

        //
        let swapper_program = ctx.accounts.swapper_program.to_account_info();

        match swapper_program.key {
            key if key == &swapper_orca::id() => {
            swapper_orca::cpi::swap(
                ctx.accounts
                            .create_orca_swap_ctx()?
                            .with_signer(&[&authority_seeds[..]])
                            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
                liquidator_account.collateral_share,
                liquidator_account.borrow_share)?;
            },
            key if key == &swapper_raydium::id() => {
            swapper_raydium::cpi::swap(
                ctx.accounts
                            .create_raydium_swap_ctx()?
                            .with_signer(&[&authority_seeds[..]])
                            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
                            liquidator_account.collateral_share,
                            liquidator_account.borrow_share)?;
            },
            _ => {
                return Err(ErrorCode::InvalidSwapper.into());
            }
        };

        cauldron_destination_vault.reload()?;

        let real_amount = cauldron_destination_vault.amount - mim_vault_amount;

        require!(
            liquidator_account.borrow_share < real_amount,
            ErrorCode::InvalidSwapper
        );

        let liquidator_account = &mut ctx.accounts.liquidator_account;
        liquidator_account.origin_liquidator = ctx.accounts.authority.key();
        liquidator_account.timestamp = liquidator_account.timestamp
            + ctx
                .accounts
                .cauldron_account
                .constants
                .complete_liquidation_duration;
        liquidator_account.real_amount = real_amount;

        Ok(())
    }

    /// 3 of 3 instruction for liquidate position with swappper.
    pub fn complete_liquidate(ctx: Context<CompleteLiquidate>) -> Result<()> {
        let liquidator_account = ctx.accounts.liquidator_account.clone();

        require!(
            liquidator_account.origin_liquidator == ctx.accounts.authority.key()
                || liquidator_account.timestamp < Clock::get()?.unix_timestamp as u64,
            ErrorCode::TooSoon
        );

        let cauldron_account = &ctx.accounts.cauldron_account;

        let cauldron_key = cauldron_account.key();
        let (_, _bump) = Pubkey::find_program_address(
            &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
            &ctx.program_id,
        );
        let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

        utils::bento_deposit(
            ctx.accounts.cauldron_authority.key(),
            liquidator_account.real_amount,
            0,
            ctx.accounts.cauldron_mim_vault.to_account_info(),
            ctx.accounts.bentobox_mim_vault.to_account_info(),
            ctx.accounts.cauldron_mim_bentobox_balance.to_account_info(),
            ctx.accounts.bentobox_mim_total_data.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.magic_internet_money_mint.to_account_info(),
            ctx.accounts.mim_strategy_data.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            vec![],
            &[&authority_seeds[..]],
        )?;

        ctx.accounts.bentobox_mim_vault.reload()?;
        ctx.accounts.cauldron_mim_vault.reload()?;

        let borrow_share = bentobox::cpi::to_share(
            create_conversion_context(
                ctx.accounts.bentobox_program.to_account_info(),
                ctx.accounts.magic_internet_money_mint.to_account_info(),
                ctx.accounts.bentobox_mim_total_data.to_account_info(),
                ctx.accounts.bentobox_account.to_account_info(),
            ),
            liquidator_account.borrow_amount,
            true,
        )?
        .get();

        create_bentobox_transfer_context(
            liquidator_account.real_amount - borrow_share,
            ctx.accounts.cauldron_authority.key(),
            ctx.accounts.cauldron_mim_bentobox_balance.to_account_info(),
            ctx.accounts.authority.key(),
            ctx.accounts
                .authority_mim_bentobox_balance
                .to_account_info(),
            ctx.accounts.magic_internet_money_mint.to_account_info(),
            ctx.accounts.bentobox_account.to_account_info(),
            ctx.accounts.cauldron_authority.to_account_info(),
            ctx.accounts.bentobox_program.to_account_info(),
            &[&authority_seeds[..]],
            &[],
        )?;

        Ok(())
    }

    /// Allows to change switchboard data feed. ONLY for cauldron account authority.
    pub fn update_switchboard_data_feed<'info>(
        ctx: Context<UpdateSwitchboardDataFeed>,
    ) -> Result<()> {
        let switchboard_data_feed = &ctx.accounts.switchboard_data_feed;
        let cauldron_account = &mut ctx.accounts.cauldron_account;
        validate_switchboard_data_feed(&switchboard_data_feed)?;

        cauldron_account.switchboard_data_feed = switchboard_data_feed.key();

        Ok(())
    }
}
