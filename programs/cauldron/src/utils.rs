use crate::{error::ErrorCode, event::*, id, state::*, Borrow};
use anchor_lang::prelude::*;
use common::big_number::U256;
use common::errors::ErrorCode as CommonErrorCode;
use common::rebase::Rebase;

use bentobox::{
    self,
    cpi::accounts::{Conversion, Deposit, TransferInternal, Withdraw},
    state::{AmountShareOut, MasterContractWhitelisted, Total as BentoBoxTotal},
};


use switchboard_solana::{decimal::SwitchboardDecimal, AggregatorAccountData};

/// Checks if the user is solvent in the closed liquidation case at the end of the function body.
pub fn solvent<'info>(
    user_balance: &UserBalance,
    price_decimal: &SwitchboardDecimal,
    total_data: &Total,
    mint: &AccountInfo<'info>,
    bentobox_total_data: &AccountInfo<'info>,
    bentobox_account: &AccountInfo<'info>,
    bentobox_program: &AccountInfo<'info>,
    cauldron_account: &Box<Account<'info, Cauldron>>,
) -> Result<()> {
    let is_solvent = is_solvent(
        user_balance,
        price_decimal,
        total_data,
        mint,
        bentobox_total_data,
        bentobox_account,
        bentobox_program,
        cauldron_account,
    )?;

    if is_solvent {
        return Ok(());
    }

    return Err(error!(ErrorCode::UserInsolventError));
}

/// Concrete implementation of `is_solvent`.
/// Checks if the user is solvent in the closed liquidation case at the end of the function body.
pub fn is_solvent<'info>(
    user_balance: &UserBalance,
    price_decimal: &SwitchboardDecimal,
    total_data: &Total,
    mint: &AccountInfo<'info>,
    bentobox_total_data: &AccountInfo<'info>,
    bentobox_account: &AccountInfo<'info>,
    bentobox_program: &AccountInfo<'info>,
    cauldron_account: &Box<Account<'info, Cauldron>>,
) -> Result<bool> {
    // accrue must have already been called!
    let borrow_part = user_balance.borrow_part;

    if borrow_part == 0 {
        return Ok(true);
    }
    let collateral_share = user_balance.collateral_share;

    if collateral_share == 0 {
        return Ok(false);
    }

    let precision: u64 = 10;

    let share: U256 = U256::from(collateral_share)
        .checked_mul(U256::from(
            precision.pow(price_decimal.scale)
                / cauldron_account.constants.collaterization_rate_precision,
        ))
        .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
        .checked_mul(cauldron_account.constants.collaterization_rate.into())
        .ok_or(CommonErrorCode::WrongIntegerMultiplication)?;

    let amount: u64 = bentobox::cpi::to_amount(
        create_conversion_context(
            bentobox_program.clone(),
            mint.clone(),
            bentobox_total_data.clone(),
            bentobox_account.clone(),
        ),
        share.try_to_u64()?,
        false,
    )?
    .get();

    // Moved exchangeRate here instead of dividing the other side to preserve more precision
    let borrow: U256 = U256::from(borrow_part)
        .checked_mul(total_data.borrow.elastic.into())
        .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
        .checked_mul(price_decimal.mantissa.into())
        .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
        .checked_div(total_data.borrow.base.into())
        .ok_or(CommonErrorCode::WrongIntegerDivision)?;

    Ok(U256::from(amount) >= borrow)
}

pub fn create_conversion_context<'a, 'b, 'c, 'info>(
    bentobox_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    bentobox_total_data: AccountInfo<'info>,
    bentobox_account: AccountInfo<'info>,
) -> CpiContext<'a, 'b, 'c, 'info, Conversion<'info>> {
    let conversion_accounts = Conversion {
        mint,
        bentobox_account,
        total_data: bentobox_total_data,
    };

    CpiContext::new(bentobox_program, conversion_accounts)
}

/// validates switchboard AccountInfo
pub fn validate_switchboard_data_feed(switchboard_data_feed: &AccountInfo) -> Result<()> {
    #[cfg(feature = "localnet")]
    return Ok(());

    #[cfg(not(feature = "localnet"))]
    {
        if switchboard_data_feed.key == &Pubkey::default() {
            return Err(ErrorCode::InvalidSwitchboardDataFeedAccount.into());
        }

        // #[cfg(feature = "mainnet-beta")]
        // if switchboard_data_feed.owner != &switchboard_v2::SWITCHBOARD_V2_MAINNET {
        //     return Err(ErrorCode::InvalidSwitchboardProgram.into());
        // }

        // #[cfg(feature = "devnet")]
        // if switchboard_data_feed.owner != &switchboard_v2::SWITCHBOARD_V2_DEVNET {
        //     return Err(ErrorCode::InvalidSwitchboardProgram.into());
        // }
        if *switchboard_data_feed.owner != switchboard_solana::SWITCHBOARD_PROGRAM_ID {
            return Err(ErrorCode::InvalidSwitchboardProgram.into())
        }
        Ok(())
    }
}

pub fn  get_switchboard_price(
    switchboard_data_feed: &AccountInfo,
    clock: &Clock,
    stale_after_slots_elapsed: &u64,
) -> Result<SwitchboardDecimal> {
    #[cfg(feature = "localnet")]
    return Ok(SwitchboardDecimal::new(12500500000, 9));

    #[cfg(not(feature = "localnet"))]
    {
        // #[cfg(feature = "mainnet-beta")]
        // if switchboard_data_feed.owner != &switchboard_v2::SWITCHBOARD_V2_MAINNET {
        //     return Err(ErrorCode::InvalidSwitchboardProgram.into());
        // }

        // #[cfg(feature = "devnet")]
        // if switchboard_data_feed.owner != &switchboard_v2::SWITCHBOARD_V2_DEVNET {
        //     return Err(ErrorCode::InvalidSwitchboardProgram.into());
        // 
        if *switchboard_data_feed.to_account_info().owner != switchboard_solana::SWITCHBOARD_PROGRAM_ID {
            return Err(ErrorCode::InvalidSwitchboardProgram.into())
        }
        let loader:AccountLoader<AggregatorAccountData> = AccountLoader::try_from(&switchboard_data_feed)?;
        let feed = loader.load()?;
        
        let slots_elapsed = clock
            .slot
            .checked_sub(feed.latest_confirmed_round.round_open_slot)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

        require!(
            &slots_elapsed < stale_after_slots_elapsed,
            ErrorCode::StaleSwitchboardDataFeedResult
        );

        let price_decimal = feed.get_result()?;

        require!(
            price_decimal.mantissa >= 0,
            ErrorCode::InvalidSwitchboardDataFeedAccount
        );

        Ok(price_decimal)
    }
}

pub fn accrue_internal(accrue_info: &mut AccrueInfo, total_data: &mut Total) -> Result<()> {
    // Number of seconds since accrue was called
    let block_timestamp = Clock::get().unwrap().unix_timestamp as u64;
    let elapsed_time = block_timestamp - accrue_info.last_accrued;
    if elapsed_time == 0 {
        return Ok(());
    }
    accrue_info.last_accrued = block_timestamp;

    let mut total_borrow = total_data.borrow;
    if total_borrow.base == 0 {
        return Ok(());
    }

    let base: u64 = 10;

    // Accrue interest
    let extra_amount: U256 = U256::from(total_borrow.elastic)
        .checked_mul(accrue_info.interest_per_second.into())
        .ok_or(error!(CommonErrorCode::WrongIntegerMultiplication))?
        .checked_mul(elapsed_time.into())
        .ok_or(error!(CommonErrorCode::WrongIntegerMultiplication))?
        .checked_div(U256::from(base.pow(18)))
        .ok_or(error!(CommonErrorCode::WrongIntegerDivision))?;

    total_borrow.elastic = total_borrow
        .elastic
        .checked_add(extra_amount.try_to_u128()?)
        .ok_or(error!(CommonErrorCode::WrongIntegerAddition))?;
    total_data.borrow = total_borrow;

    accrue_info.fees_earned = accrue_info
        .fees_earned
        .checked_add(extra_amount.try_to_u128()?)
        .ok_or(error!(CommonErrorCode::WrongIntegerAddition))?;

    emit!(LogAccrue {
        extra_amount: extra_amount.try_to_u128()?
    });

    return Ok(());
}

pub fn borrow_internal<'info>(
    to: Pubkey,
    amount: u64,
    borrow_accounts: &mut Borrow<'info>,
) -> Result<(u64, u64)> {
    let cauldron = &mut borrow_accounts.cauldron_account;
    let fee_amount = amount
        .checked_mul(cauldron.constants.borrow_opening_fee)
        .ok_or(error!(CommonErrorCode::WrongIntegerMultiplication))?
        .checked_div(cauldron.constants.borrow_opening_fee_precision)
        .ok_or(error!(CommonErrorCode::WrongIntegerDivision))?;

    let total_data = &mut borrow_accounts.total_data.load_mut()?;
    let mut rebase: Rebase = total_data.borrow.into();
    let (total_borrow, part): (Rebase, u64) = rebase.add_e(
        amount
            .checked_add(fee_amount)
            .ok_or(error!(CommonErrorCode::WrongIntegerAddition))?,
        true,
    )?;

    total_data.borrow = CauldronRebase::from(total_borrow);

    require!(
        total_data.borrow.elastic <= cauldron.borrow_limit.total.into(),
        ErrorCode::BorrowLimitReached
    );

    let accrue_info = &cauldron.accrue_info;

    cauldron.accrue_info.fees_earned = accrue_info
        .fees_earned
        .checked_add(fee_amount.into())
        .ok_or(error!(CommonErrorCode::WrongIntegerAddition))?;

    let user_balance = &mut borrow_accounts.user_balance;
    let new_borrow_part = user_balance
        .borrow_part
        .checked_add(part)
        .ok_or(error!(CommonErrorCode::WrongIntegerAddition))?;

    require!(
        new_borrow_part <= cauldron.borrow_limit.borrow_part_per_address,
        ErrorCode::BorrowLimitReached
    );

    user_balance.borrow_part = new_borrow_part;

    let cauldron_key = &cauldron.key();

    let cpi_conversion_ctx = borrow_accounts.create_conversion_context();

    // As long as there are tokens on this contract you can 'mint'... this enables limiting borrows
    let share = bentobox::cpi::to_share(cpi_conversion_ctx, amount, false)?.get();

    let (_, _bump) =
        Pubkey::find_program_address(&[CAULDRON_SEED_PART, cauldron_key.as_ref()], &id());
    let signer_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];
    let signer = &[&signer_seeds[..]];

    let authority = &mut borrow_accounts.from.to_account_info();
    authority.is_signer = true;

    create_bentobox_transfer_context(
        share,
        borrow_accounts.from.key(),
        borrow_accounts.cauldron_bentobox_balance.to_account_info(),
        to,
        borrow_accounts.to_bentobox_balance.to_account_info(),
        borrow_accounts.magic_internet_money_mint.to_account_info(),
        borrow_accounts.bentobox_account.to_account_info(),
        authority.clone(),
        borrow_accounts.bentobox_program.to_account_info(),
        signer,
        &[],
    )?;

    Ok((part, share))
}

pub fn repay<'info>(
    part: u64,
    total_data: &mut Total,
    from_bentobox_balance: AccountInfo<'info>,
    from_key: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    bentobox_total_data: AccountInfo<'info>,
    bentobox_account: AccountInfo<'info>,
    bentobox_program: AccountInfo<'info>,
    user_balance: &mut Box<Account<'info, UserBalance>>,
    cauldron_account: &Box<Account<'info, Cauldron>>,
    cauldron_bentobox_balance: AccountInfo<'info>,
    cauldron_authority: AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<i64> {
    let mut rebase: Rebase = total_data.borrow.into();
    let (rebase_result, amount) = rebase.sub_e(part, true)?;

    total_data.borrow = CauldronRebase::from(rebase_result);
    user_balance.borrow_part = user_balance
        .borrow_part
        .checked_sub(part)
        .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

    let share = bentobox::cpi::to_share(
        create_conversion_context(
            bentobox_program.to_account_info(),
            mint.to_account_info(),
            bentobox_total_data.to_account_info(),
            bentobox_account.to_account_info(),
        ),
        part,
        false,
    )?;

    let cauldron_key = cauldron_account.key();
    let (_, _bump) = Pubkey::find_program_address(
        &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
        &cauldron_account.to_account_info().owner,
    );
    let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

    create_bentobox_transfer_context(
        share.get(),
        from_key.key(),
        from_bentobox_balance,
        cauldron_authority.key(),
        cauldron_bentobox_balance.to_account_info(),
        mint.to_account_info(),
        bentobox_account.to_account_info(),
        cauldron_authority,
        bentobox_program,
        &[&authority_seeds[..]],
        remaining_accounts,
    )?;

    Ok(amount as i64)
}

pub fn remove_collateral<'info>(
    share: u64,
    user_balance: &mut Box<Account<'info, UserBalance>>,
    total_data: &mut Total,
    collateral: AccountInfo<'info>,
    cauldron_account: AccountInfo<'info>,
    cauldron_bentobox_balance: AccountInfo<'info>,
    to: Pubkey,
    to_bentobox_balance: AccountInfo<'info>,
    bentobox_account: AccountInfo<'info>,
    bentobox_program: AccountInfo<'info>,
    cauldron_authority: AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    user_balance.collateral_share = user_balance
        .collateral_share
        .checked_sub(share)
        .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

    total_data.collateral_share = total_data
        .collateral_share
        .checked_sub(share)
        .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

    emit!(LogRemoveCollateral {
        to: to.key(),
        share
    });

    let cauldron_key = cauldron_account.key();
    let (_, _bump) = Pubkey::find_program_address(
        &[CAULDRON_SEED_PART, cauldron_key.as_ref()],
        &cauldron_account.owner,
    );
    let authority_seeds = &[CAULDRON_SEED_PART, cauldron_key.as_ref(), &[_bump]];

    create_bentobox_transfer_context(
        share,
        cauldron_authority.key(),
        cauldron_bentobox_balance,
        to,
        to_bentobox_balance,
        collateral,
        bentobox_account,
        cauldron_authority,
        bentobox_program,
        &[&authority_seeds[..]],
        remaining_accounts,
    )?;
    Ok(())
}

/// Helper function to create  Bentobox Transfer cpi context.
pub fn create_bentobox_transfer_context<'info>(
    share: u64,
    from: Pubkey,
    balance_from: AccountInfo<'info>,
    to: Pubkey,
    balance_to: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    bentobox_account: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    bentobox_program: AccountInfo<'info>,
    signer: &[&[&[u8]]],
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    let mut authority = authority.clone();
    authority.is_signer = true;

    let transfer_cpi_accounts = TransferInternal {
        balance_from,
        balance_to,
        mint,
        bentobox_account,
        authority,
    };

    bentobox::cpi::transfer(
        CpiContext::new(bentobox_program, transfer_cpi_accounts)
            .with_signer(signer)
            .with_remaining_accounts(remaining_accounts.to_vec()),
        from,
        to,
        share,
    )
}

/// Helper function for withdrawing into BentoBox.
pub fn bento_withdraw<'info>(
    from: Pubkey,
    amount: u64,
    share: u64,
    to_vault: AccountInfo<'info>,
    bentobox_vault: AccountInfo<'info>,
    bentobox_from_balance: AccountInfo<'info>,
    bentobox_total_data: AccountInfo<'info>,
    bentobox_account: AccountInfo<'info>,
    bentobox_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    bentobox_vault_authority: AccountInfo<'info>,

    authority: AccountInfo<'info>,
    remaining_accounts: Vec<AccountInfo<'info>>,
    signer: &[&[&[u8]]],
) -> Result<AmountShareOut> {
    let mut authority = authority.clone();
    authority.is_signer = true;

    let withdraw_cpi_accounts = Withdraw {
        bentobox_vault,
        to: to_vault,
        balance: bentobox_from_balance,
        total_data: bentobox_total_data,
        bentobox_account,
        vault_authority: bentobox_vault_authority,
        token_program,
        authority,
    };

    Ok(bentobox::cpi::withdraw(
        CpiContext::new(bentobox_program, withdraw_cpi_accounts)
            .with_signer(signer)
            .with_remaining_accounts(remaining_accounts),
        from,
        amount,
        share,
    )?
    .get())
}

/// Helper function for deposit to BentoBox.
pub fn bento_deposit<'info>(
    to: Pubkey,
    amount: u64,
    share: u64,
    from: AccountInfo<'info>,
    bentobox_vault: AccountInfo<'info>,
    bentobox_to_balance: AccountInfo<'info>,
    bentobox_total_data: AccountInfo<'info>,
    bentobox_account: AccountInfo<'info>,
    bentobox_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    strategy_data: AccountInfo<'info>,

    authority: AccountInfo<'info>,
    remaining_accounts: Vec<AccountInfo<'info>>,
    signer: &[&[&[u8]]],
) -> Result<AmountShareOut> {
    let mut authority = authority.clone();
    authority.is_signer = true;

    let deposit_cpi_accounts = Deposit {
        from,
        bentobox_vault,
        balance: bentobox_to_balance,
        total_data: bentobox_total_data,
        bentobox_account,
        token_program,
        strategy_data,
        mint,
        authority,
    };

    Ok(bentobox::cpi::deposit(
        CpiContext::new(bentobox_program, deposit_cpi_accounts)
            .with_signer(signer)
            .with_remaining_accounts(remaining_accounts),
        to,
        amount,
        share,
    )?
    .get())
}

/// Helper function for validate whitelisted account which provides to call deposit, withdraw and transfer from cauldron contract.
pub fn validate_whitelisted_account(
    master_contract_whitelisted: &AccountInfo,
    cauldron_account: &AccountInfo,
) -> Result<()> {
    let whitelisted_account =
        &match Account::<MasterContractWhitelisted>::try_from(master_contract_whitelisted) {
            Ok(account) => account,
            _ => return Err(error!(ErrorCode::MasterContractWhitelistedAccountInvalid)),
        };

    //check whitelisted account address
    require!(
        whitelisted_account.master_contract_account == cauldron_account.key(),
        ErrorCode::IncompatibleMasterContractWhitelistedAccount
    );

    Ok(())
}

pub fn liquidate_internal<'info>(
    max_borrow_part: u64,
    // switchboard_data_feed: &AccountLoader<'info,AggregatorAccountData>,
    switchboard_data_feed: &AccountInfo<'info>,
    cauldron_account: &mut Account<'info, Cauldron>,
    total_data: AccountLoader<'info, Total>,
    collateral: &AccountInfo<'info>,
    magic_internet_money_mint: AccountInfo<'info>,
    bentobox_collateral_total_data: AccountLoader<'info, BentoBoxTotal>,
    bentobox_mim_total_data: AccountLoader<'info, BentoBoxTotal>,
    bentobox_account: &AccountInfo<'info>,
    bentobox_program: AccountInfo<'info>,
    user_balance: &mut Account<'info, UserBalance>,
) -> Result<(u64, u64, u64)> {
    // borrow_amount , borrow_share, collateral_share
    let price_decimal = get_switchboard_price(
        &switchboard_data_feed,
        &Clock::get()?,
        &cauldron_account.constants.stale_after_slots_elapsed,
    )?;
    {
        let accrue_info = &mut cauldron_account.accrue_info;
        let total_data = &mut total_data.load_mut()?;
        accrue_internal(accrue_info, total_data)?;
    }

    let mut borrow_part: u64 = 0;
    let mut borrow_amount: u64 = 0;
    let mut collateral_share: u64 = 0;

    let mut total_data = total_data.load_mut()?;

    let is_solvent = is_solvent(
        &user_balance,
        &price_decimal,
        &total_data,
        &collateral,
        &bentobox_collateral_total_data.to_account_info(),
        &bentobox_account,
        &bentobox_program,
        &Box::new(cauldron_account.clone()),
    )?;

    if !is_solvent {
        let available_borrow_part = user_balance.borrow_part;
        borrow_part = if max_borrow_part > available_borrow_part {
            available_borrow_part
        } else {
            max_borrow_part
        };

        user_balance.borrow_part = available_borrow_part
            .checked_sub(borrow_part)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;

        let precision: u64 = 10;

        let total_data_borrow_rebase: Rebase = total_data.borrow.into();
        borrow_amount = total_data_borrow_rebase.to_elastic(borrow_part, false)?;
        let bentobox_total_data = bentobox_collateral_total_data.load()?;
        let bentobox_total_amount_rebase: Rebase = bentobox_total_data.amount.into();
        let elastic = U256::from(borrow_amount)
            .checked_mul(U256::from(
                cauldron_account.constants.liquidation_multiplier,
            ))
            .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
            .checked_mul(U256::from(price_decimal.mantissa))
            .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
            .checked_div(
                U256::from(cauldron_account.constants.liquidation_multiplier_precision)
                    * U256::from(precision.pow(price_decimal.scale)),
            )
            .ok_or(CommonErrorCode::WrongIntegerDivision)?
            .try_to_u64()?;
        collateral_share = bentobox_total_amount_rebase.to_base(elastic, false)?;
        user_balance.collateral_share = user_balance
            .collateral_share
            .checked_sub(collateral_share)
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;
    }

    if borrow_amount == 0 {
        return Err(error!(ErrorCode::UserIsSolvent));
    }

    let borrow = CauldronRebase {
        base: total_data
            .borrow
            .base
            .checked_sub(u128::from(borrow_part))
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?,
        elastic: total_data
            .borrow
            .elastic
            .checked_sub(u128::from(borrow_amount))
            .ok_or(CommonErrorCode::WrongIntegerSubtraction)?,
    };
    total_data.borrow = borrow;

    let new_collateral_share = total_data
        .collateral_share
        .checked_sub(collateral_share)
        .ok_or(CommonErrorCode::WrongIntegerSubtraction)?;
    total_data.collateral_share = new_collateral_share;

    let constants = cauldron_account.constants.clone();

    // Apply a percentual fee share to sSpell holders

    let distribution_amount: u64 = ((U256::from(borrow_amount)
        .checked_mul(U256::from(constants.liquidation_multiplier))
        .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
        / U256::from(constants.liquidation_multiplier_precision))
    .checked_sub(U256::from(borrow_amount))
    .ok_or(CommonErrorCode::WrongIntegerSubtraction)?
    .checked_mul(U256::from(constants.distribution_part))
    .ok_or(CommonErrorCode::WrongIntegerMultiplication)?
        / U256::from(constants.distribution_precision))
    .try_to_u64()?;

    borrow_amount = borrow_amount
        .checked_add(distribution_amount)
        .ok_or(CommonErrorCode::WrongIntegerAddition)?;

    cauldron_account.accrue_info.fees_earned = cauldron_account
        .accrue_info
        .fees_earned
        .checked_add(distribution_amount.into())
        .ok_or(CommonErrorCode::WrongIntegerAddition)?;

    // As long as there are tokens on this contract you can 'mint'... this enables limiting borrows
    let borrow_share = bentobox::cpi::to_share(
        create_conversion_context(
            bentobox_program,
            magic_internet_money_mint,
            bentobox_mim_total_data.to_account_info(),
            bentobox_account.to_account_info(),
        ),
        borrow_amount,
        true,
    )?
    .get();

    Ok((borrow_amount, borrow_share, collateral_share))
}
