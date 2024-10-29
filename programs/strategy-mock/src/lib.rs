use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as TokenTransfer};
use common::constants::STRATEGY_SEED_PART;
use spl_token::instruction::AuthorityType;

use common::constants::DISCRIMINATOR_BYTES;
use common::errors::ErrorCode as CommonErrorCode;
use common::utils::calculate_end_byte_to_serialize;

pub mod context;
pub mod error;
pub mod event;
pub mod state;
pub mod package;

use crate::context::*;
use crate::error::ErrorCode;
use crate::event::*;
use crate::state::*;

use crate::package::state::base_after_exit;
use crate::package::errors::ErrorCode as StrategyErrorCode;


declare_id!("BNGV7QCu6kUBK8rQqgzQsqHvEjignzyAJAkdQRA4gLn8");

#[program]
pub mod strategy_mock {
    use super::*;


    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let strategy_account = &mut ctx.accounts.strategy_account;
        let authority_key = ctx.accounts.authority.key();
        //set strategy mock authority
        strategy_account.authority = authority_key;
        //set bentobox authority
        strategy_account.base_strategy_info = ctx.accounts.base_strategy_info.key();
        //set bentobox
        strategy_account.bentobox_account = ctx.accounts.bentobox_account.key();
        //set bentobox program id
        strategy_account.bentobox_program = ctx.accounts.bentobox_program.key();
        //set mock_pool pubkey
        strategy_account.mock_pool = ctx.accounts.pool_vault.key();

        let base_strategy_info = &mut ctx.accounts.base_strategy_info;

        // set strategy_token
        base_strategy_info.strategy_token = ctx.accounts.mint.key();

        //set payer account as executor
        let payer_executor_info = &mut ctx.accounts.executor_info;
        payer_executor_info.is_executor = true;
        payer_executor_info.user = authority_key;

        let (_, bump) = Pubkey::find_program_address(
            &[STRATEGY_SEED_PART, strategy_account.key().as_ref()],
            &ctx.program_id,
        );
        strategy_account.strategy_authority_bump = bump;

        token::set_authority(
            ctx.accounts.create_change_authority_context(),
            AuthorityType::AccountOwner,
            Some(ctx.accounts.strategy_authority.key()),
        )?;

        //approve tokens
        token::approve(ctx.accounts.create_approve_context(), u64::MAX)?;

        Ok(())
    }

    pub fn after_exit(ctx: Context<AfterExit>, name: String, args: Vec<Vec<u8>>) -> Result<()> {
        let strategy_key = ctx.accounts.strategy_account.key();
        let (_, bump) = Pubkey::find_program_address(
            &[STRATEGY_SEED_PART, strategy_key.as_ref()],
            &ctx.program_id,
        );
        let seeds = &[STRATEGY_SEED_PART, strategy_key.as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        base_after_exit(
            ctx.remaining_accounts.to_vec(),
            name,
            args,
            ctx.program_id.clone(),
            signer,
        )?;
        Ok(())
    }

    pub fn set_strategy_executor(
        ctx: Context<SetStrategyExecutor>,
        executor: Pubkey,
        value: bool,
    ) -> Result<()> {
        let executor_info = &mut ctx.accounts.executor_info;
        executor_info.is_executor = value;
        emit!(LogSetStrategyExecutor { executor, value });

        Ok(())
    }

        pub fn skim<'info>(ctx: Context<'_, '_, '_, 'info, Skim<'info>>, amount: u64) -> Result<()> {
            require!(
                ctx.remaining_accounts.len() >= SKIM_REMAINING_ACCOUNTS_COUNT,
                ErrorCode::InvalidRemainingAccounts
            );
        
            check_basis_accounts(
                &ctx.accounts.strategy_account.clone(),
                &ctx.accounts.base_strategy_info.clone(),
                &ctx.accounts.strategy_vault.clone(),
                &ctx.accounts.bentobox_account.clone(),
                &ctx.remaining_accounts[0].clone(),
            )?;
            
            let pool_vault = &mut Account::<TokenAccount>::try_from(&ctx.remaining_accounts[0])
                .ok()
                .ok_or(CommonErrorCode::WrongConvertionFromAccountInfoToTokenAccount)?;
        
            transfer_internal(
                &mut ctx.accounts.strategy_vault,
                pool_vault,
                &ctx.accounts.strategy_authority.to_account_info(),
                &ctx.accounts.token_program,
                &ctx.accounts.strategy_account,
                amount,
            )?;
        
            Ok(())
        }

        // remaining [0] - pool vault
        pub fn harvest<'info>(ctx: Context<'_, '_, '_, 'info, Harvest<'info>>, balance: u64) -> Result<()> {
            require!(
                ctx.remaining_accounts.len() >= HARVEST_REMAINING_ACCOUNTS_COUNT,
                ErrorCode::InvalidRemainingAccounts
            );

            check_basis_accounts(
                &ctx.accounts.strategy_account.clone(),
                &ctx.accounts.base_strategy_info.clone(),
                &ctx.accounts.strategy_vault.clone(),
                &ctx.accounts.bentobox_account.clone(),
                &ctx.remaining_accounts[0].clone(),
            )?;

            let mut var = ctx.accounts.cpi_result_account.try_borrow_mut_data()?;
            let result_account_size_to_serialize =
                calculate_end_byte_to_serialize(ResultAmount::SIZE, true);

            let mut result_bytes = &var[DISCRIMINATOR_BYTES..result_account_size_to_serialize];
            let mut result_decoded = ResultAmount::deserialize(&mut result_bytes)?;
            result_decoded.amount = 0;

            let pool_vault = &mut Account::<TokenAccount>::try_from(&ctx.remaining_accounts[0])
                .ok()
                .ok_or(CommonErrorCode::WrongConvertionFromAccountInfoToTokenAccount)?;

            let pool_vault_amount: i64 = pool_vault.amount as i64;
            result_decoded.amount = match pool_vault_amount.checked_sub(balance as i64) {
                Some(value) => value as i64,
                None => return Err(CommonErrorCode::WrongIntegerSubtraction.into()),
            };

            let result_bytes = &mut var[DISCRIMINATOR_BYTES..result_account_size_to_serialize];
            let mut cursor = std::io::Cursor::new(result_bytes);
            result_decoded.serialize(&mut cursor)?;

            if result_decoded.amount > 0 {
                transfer_internal(
                    pool_vault,
                    &mut ctx.accounts.strategy_vault,
                    &ctx.accounts.strategy_authority,
                    &ctx.accounts.token_program,
                    &ctx.accounts.strategy_account,
                    result_decoded.amount as u64,
                )?;
            }
            Ok(())
        }

        // remaining [0] - pool vault
        pub fn withdraw<'info>(ctx: Context<'_, '_, '_, 'info, Withdraw<'info>>, amount: u64) -> Result<()> {
            require!(
                ctx.remaining_accounts.len() >= WITHDRAW_REMAINING_ACCOUNTS_COUNT,
                ErrorCode::InvalidRemainingAccounts
            );

            check_basis_accounts(
                &ctx.accounts.strategy_account.clone(),
                &ctx.accounts.base_strategy_info.clone(),
                &ctx.accounts.strategy_vault.clone(),
                &ctx.accounts.bentobox_account.clone(),
                &ctx.remaining_accounts[0].clone(),
            )?;

            let pool_vault = &mut Account::<TokenAccount>::try_from(&ctx.remaining_accounts[0])
                .ok()
                .ok_or(CommonErrorCode::WrongConvertionFromAccountInfoToTokenAccount)?;

            // transfer from pool
            transfer_internal(
                pool_vault,
                &mut ctx.accounts.strategy_vault,
                &ctx.accounts.strategy_authority,
                &ctx.accounts.token_program,
                &ctx.accounts.strategy_account,
                amount,
            )?;

            Ok(())
        }

        // remaining [0] - pool vault
        pub fn exit<'info>(ctx: Context<'_, '_, '_, 'info, Exit<'info>>) -> Result<()> {
            require!(
                ctx.remaining_accounts.len() >= EXIT_REMAINING_ACCOUNTS_COUNT,
                ErrorCode::InvalidRemainingAccounts
            );

            check_basis_accounts(
                &ctx.accounts.strategy_account.clone(),
                &ctx.accounts.base_strategy_info.clone(),
                &ctx.accounts.strategy_vault.clone(),
                &ctx.accounts.bentobox_account.clone(),
                &ctx.remaining_accounts[0].clone(),
            )?;

            // set exited to true
            let mut base_strategy_info_data =
                ctx.accounts.base_strategy_info.try_borrow_mut_data()?;

            let base_strategy_account_size_to_serialize =
                calculate_end_byte_to_serialize(BaseStrategyInfo::SIZE, true);

            let mut base_strategy_info_bytes = &base_strategy_info_data
                [DISCRIMINATOR_BYTES..base_strategy_account_size_to_serialize];
            let mut base_strategy_info_decoded =
                BaseStrategyInfo::deserialize(&mut base_strategy_info_bytes)?;
            base_strategy_info_decoded.exited = true;

            let base_strategy_info_bytes = &mut base_strategy_info_data
                [DISCRIMINATOR_BYTES..base_strategy_account_size_to_serialize];
            let mut cursor = std::io::Cursor::new(base_strategy_info_bytes);
            base_strategy_info_decoded.serialize(&mut cursor)?;

            let pool_vault = &mut Account::<TokenAccount>::try_from(&ctx.remaining_accounts[0])
                .ok()
                .ok_or(CommonErrorCode::WrongConvertionFromAccountInfoToTokenAccount)?;

            // transfer from pool
            let amount = pool_vault.amount;
            transfer_internal(
                pool_vault,
                &mut ctx.accounts.strategy_vault,
                &ctx.accounts.strategy_authority,
                &ctx.accounts.token_program,
                &ctx.accounts.strategy_account,
                amount,
            )?;

            Ok(())
        }

        pub fn harvest_rewards<'info>(ctx: Context<'_, '_, '_, 'info, HarvestRewards<'info>>) -> Result<()> {
            check_basis_accounts(
                &ctx.accounts.strategy_account.clone(),
                &ctx.accounts.base_strategy_info.clone(),
                &ctx.accounts.strategy_vault.clone(),
                &ctx.accounts.bentobox_account.clone(),
                &ctx.remaining_accounts[0].clone(),
            )?;

            Ok(())
        }


        pub fn safe_harvest<'info>(
            ctx: Context<'_, '_, '_, 'info, SafeHarvest<'info>>,
            max_balance: u64,
        ) -> Result<()> {
            check_basis_accounts(
                &ctx.accounts.strategy_account.clone(),
                &ctx.accounts.base_strategy_info.clone(),
                &ctx.accounts.strategy_vault.clone(),
                &ctx.accounts.bentobox_account.clone(),
                &ctx.remaining_accounts[0].clone(),
            )?;

            let base_strategy_info = &mut ctx.accounts.base_strategy_info;
            let info = &mut match Account::<BaseStrategyInfo>::try_from(base_strategy_info) {
                Ok(account) => account,
                _ => {
                    return Err(
                        StrategyErrorCode::WrongConvertionFromAccountInfoToBaseStrategyInfo.into(),
                    )
                }
            };

            if max_balance > 0 {
                info.max_bentobox_balance = max_balance;
                let mut var = base_strategy_info.try_borrow_mut_data()?;
                let dst: &mut [u8] = &mut var;
                let mut cursor = std::io::Cursor::new(dst);
                info.try_serialize(&mut cursor)?;
            }
            Ok(())
        }

        pub fn transfer<'info>(ctx: Context<'_, '_, '_, 'info, Transfer<'info>>, amount: u64) -> Result<()> {
            transfer_internal(
                &mut ctx.accounts.strategy_vault.clone(),
                &mut ctx.accounts.bentobox_vault.clone(),
                &ctx.accounts.strategy_authority.clone(),
                &ctx.accounts.token_program.clone(),
                &ctx.accounts.strategy_account.clone(),
                amount,
            )?;
            Ok(())
        }
    // }
}

fn transfer_internal<'info>(
    from_vault: &mut Account<'info, TokenAccount>,
    to_vault: &mut Account<'info, TokenAccount>,
    from_authority: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    strategy_account: &UncheckedAccount<'info>,
    amount: u64,
) -> Result<()> {
    let strategy_key = strategy_account.key();
    
    let strategy_mock_account = &match Account::<StrategyMock>::try_from(strategy_account) {
        Ok(account) => account,
        _ => {
            return Err(StrategyErrorCode::WrongConvertionFromAccountInfoToBaseStrategyInfo.into())
        }
    };
    let authority_seeds = &[
        STRATEGY_SEED_PART,
        strategy_key.as_ref(),
        &[strategy_mock_account.strategy_authority_bump],
    ];

    token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            TokenTransfer {
                from: from_vault.to_account_info(),
                to: to_vault.to_account_info(),
                authority: from_authority.clone(),
            },
        )
        .with_signer(&[&authority_seeds[..]]),
        amount,
    )
}
