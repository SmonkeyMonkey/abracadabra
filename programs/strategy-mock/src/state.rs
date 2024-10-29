use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_spl::token::TokenAccount;

use crate::package::errors::ErrorCode as StrategyErrorCode;
#[constant]
pub const STRATEGY_VAULT_SEED_PART: &[u8] = b"strategyvaultkey";

#[constant]
pub const STRATEGY_SEED_PART: &[u8] = b"strategy";

#[constant]
pub const EXECUTOR_INFO_SEED: &[u8] = b"executorinfo";

#[constant]
pub const SKIM_REMAINING_ACCOUNTS_COUNT: usize = 1;
#[constant]
pub const WITHDRAW_REMAINING_ACCOUNTS_COUNT: usize = 1;
#[constant]
pub const EXIT_REMAINING_ACCOUNTS_COUNT: usize = 1;
#[constant]
pub const HARVEST_REMAINING_ACCOUNTS_COUNT: usize = 1;

#[account]
#[derive(Default)]
pub struct StrategyMock {
    pub authority: Pubkey,
    pub base_strategy_info: Pubkey,
    pub bentobox_program: Pubkey,
    pub bentobox_account: Pubkey,
    pub mock_pool: Pubkey,
    pub strategy_authority_bump: u8,
}

impl StrategyMock {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 32 + 32 + 1;
}

#[account]
#[derive(Default)]
pub struct BaseStrategyInfo {
    pub strategy_token: Pubkey,
    pub exited: bool,
    pub max_bentobox_balance: u64,
}

impl BaseStrategyInfo {
    pub const SIZE: usize = 8 + 32 + 1 + 8;
}

#[account]
#[derive(Default)]
pub struct ResultAmount {
    pub amount: i64,
}

impl ResultAmount {
    pub const SIZE: usize = 8 + 8;
}

#[account]
#[derive(Default)]
pub struct ExecutorInfo {
    pub is_executor: bool,
    pub user: Pubkey,
}

impl ExecutorInfo {
    pub const SIZE: usize = 8 + 1 + 32;
}

pub fn check_basis_accounts<'info>(
    strategy_account: &AccountInfo<'info>,
    base_strategy_info: &AccountInfo<'info>,
    strategy_vault: &Box<Account<'info, TokenAccount>>,
    bentobox_account: &AccountInfo<'info>,
    pool_vault: &AccountInfo,
) -> Result<()> {
    let strategy_account = &match Account::<StrategyMock>::try_from(strategy_account) {
        Ok(account) => account,
        Err(_) => return Err(ErrorCode::WrongConvertionFromAccountInfoToStrategyMock.into()),
    };

    let info = &match Account::<BaseStrategyInfo>::try_from(base_strategy_info) {
        Ok(account) => account,
        _ => {
            return Err(StrategyErrorCode::WrongConvertionFromAccountInfoToBaseStrategyInfo.into())
        }
    };

    if strategy_account.base_strategy_info != info.key() {
        return Err(ErrorCode::InvalidBaseStrategyInfoAccount.into());
    }

    if strategy_account.bentobox_account != bentobox_account.key() {
        return Err(ErrorCode::InvalidBentoBoxAccount.into());
    }

    if strategy_account.mock_pool != pool_vault.key() {
        return Err(ErrorCode::InvalidPoolAccount.into());
    }

    if info.strategy_token != strategy_vault.mint {
        return Err(ErrorCode::InvalidStrategyVaultAccount.into());
    }
    Ok(())
}

