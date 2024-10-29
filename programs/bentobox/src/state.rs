use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey, Result};
use anchor_spl::token::{Token, TokenAccount};
use std::mem::size_of;

use common::{constants::STRATEGY_VAULT_SEED_PART, errors::ErrorCode};
use common::rebase::Rebase;

use common::errors::ErrorCode as CommonErrorCode;

use strategy_mock::cpi::accounts::{
    Exit, Harvest, HarvestRewards, SafeHarvest, Skim, Transfer, Withdraw,
};

#[constant]
pub const BENTOBOX_SEED_PART: &[u8] = b"bentobox";
#[constant]
pub const BALANCE_SEED_PART: &[u8] = b"bentoboxtokenbalancekey";
#[constant]
pub const TOTAL_KEY_SEED_PART: &[u8] = b"bentoboxtotalkey";
#[constant]
pub const TOTAL_VAULT_KEY_SEED_PART: &[u8] = b"bentoboxtotalvaultkey";
#[constant]
pub const STRATEGY_DATA_SEED_PART: &[u8] = b"bentoboxstrategydatakey";
#[constant]
pub const WHITELISTED_MASTER_CONTRACT_PART: &[u8] = b"whitelistedmastercontractkey";
#[constant]
pub const APPROVED_MASTER_CONTRACT_PART: &[u8] = b"approvedmastercontractkey";
#[constant]
pub const REMAINING_ACCOUNTS_COUNT_FOR_ALLOWED: usize = 3;

#[account]
#[derive(Default)]
pub struct BentoBox {
    /// Owner of BentoBox.
    pub authority: Pubkey,
    /// Pending owner of Bentobox. Using when transfers ownership of Bentobox is not direct.
    pub pending_authority: Option<Pubkey>,
    pub strategy_delay: u64,
    pub constants: Constants,
}

impl BentoBox {
    pub const SIZE: usize = 8 + 32 + size_of::<Option<Pubkey>>() + 8 + Constants::SIZE;
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct Constants {
    pub minimum_share_balance: u64, // To prevent the ratio going off
    pub max_target_percentage: u64,
}

impl Constants {
    pub const SIZE: usize = 8 + 8 + 8;
}

#[account]
#[derive(Default)]
pub struct MasterContractWhitelisted {
    pub master_contract_account: Pubkey,
    pub whitelisted: bool,
}

impl MasterContractWhitelisted {
    pub const SIZE: usize = 8 + // discriminator
    32 + // mastercontract_id
    1; // whitelisted
}

#[account]
#[derive(Default)]
pub struct MasterContractApproved {
    pub master_contract_whitelisted: Pubkey,
    pub approved: bool,
}

impl MasterContractApproved {
    pub const SIZE: usize = 8 + // discriminator
    32 + // master_contract_whitelisted
    1; // approved
}

#[account(zero_copy(unsafe))]
#[derive(Default)]
#[repr(packed)]
pub struct Total {
    /// Token public key.
    pub mint_address: Pubkey,
    /// Amount of tokens in Rebase format.
    pub amount: BentoboxRebase,
    /// Token account for this token on Bentobox.
    pub token_account: Pubkey,
}

impl Total {
    pub const SIZE: usize = 8 + 32 + 32 + 32;
}

#[account]
#[derive(Default)]
pub struct Balance {
    /// The amount of tokens on BentoBox in shares.
    pub amount: u64,
}

impl Balance {
    pub const SIZE: usize = 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AmountShareOut {
    pub amount_out: u64,
    pub share_out: u64,
}

#[account]
#[derive(Default)]
pub struct StrategyData {
    /// Time in miliseconds when strategy will start.
    pub strategy_start_date: u64,
    /// Target percentage of the strategy for `token`.
    pub target_percentage: u64,
    /// The balance of the strategy that BentoBox thinks is in there.
    pub balance: u64,
    pub pending_strategy: Pubkey,
    pub active_strategy: Pubkey,
}

impl StrategyData {
    pub const SIZE: usize = 8 + 8 + 8 + 8 + 32 + 32;
}

#[zero_copy(unsafe)]
#[derive(Default)]
pub struct BentoboxRebase {
    pub base: u128,
    pub elastic: u128,
}

impl From<Rebase> for BentoboxRebase {
    fn from(rebase: Rebase) -> BentoboxRebase {
        BentoboxRebase {
            base: rebase.base,
            elastic: rebase.elastic,
        }
    }
}
impl From<BentoboxRebase> for Rebase {
    fn from(bentobox_rebase: BentoboxRebase) -> Rebase {
        Rebase {
            base: bentobox_rebase.base,
            elastic: bentobox_rebase.elastic,
        }
    }
}

/// Calculates the total balance of `token` this contracts holds,
/// plus the total amount this contract thinks the strategy holds.
pub fn token_balance_of(
    bentobox_vault: &TokenAccount,
    strategy_data: &StrategyData,
) -> Result<u128> {
    Ok(bentobox_vault
        .amount
        .checked_add(strategy_data.balance)
        .ok_or(ErrorCode::WrongIntegerAddition)?
        .into())
}

#[derive(Accounts)]
pub struct BaseSkim<'info> {
    /// Strategy program account.
    /// CHECK: account checked in CPI.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: account checked in CPI.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: account checked in CPI.
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy account.
    /// CHECK: account checked in CPI.
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token authority account.
    /// CHECK: account checked in CPI.
    pub strategy_authority: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: account checked in CPI.
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Bentobox token authority pda account.
    #[account(mut)]
    pub authority: Signer<'info>,
}

impl<'info> BaseSkim<'info> {
    /// Helper function to create `Skim` cpi context.
    pub fn create_skim_context(&self) -> CpiContext<'_, '_, '_, 'info, Skim<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Skim {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            base_strategy_info: self.base_strategy_info.to_account_info(),
            token_program: self.token_program.to_account_info(),
            authority: self.authority.to_account_info(),
        })
    }
}

#[derive(Accounts)]
pub struct BaseHarvest<'info> {
    /// Strategy program account.
    /// CHECK: using for check signer's seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: account checked in CPI.
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: account checked in CPI.
    pub strategy_account: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Bentobox token account.
    #[account(mut)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token account.
    #[account(mut, 
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,
              constraint = strategy_vault.mint == bentobox_vault.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(), bentobox_account.key().as_ref()], 
              bump, 
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Strategy  token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Account for storing result from strategy harvest implementation.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(mut, 
              rent_exempt = enforce,
              constraint = cpi_result_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub cpi_result_account: UncheckedAccount<'info>,
}

impl<'info> BaseHarvest<'info> {
    /// Helper function to create `Harvest` cpi context.
    pub fn create_harvest_context(&self) -> CpiContext<'_, '_, '_, 'info, Harvest<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Harvest {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            authority: self.authority.to_account_info(),
            cpi_result_account: self.cpi_result_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            token_program: self.token_program.to_account_info(),
            base_strategy_info: self.base_strategy_info.to_account_info(),
        })
    }

    /// Helper function to create `Transfer` cpi context.
    pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Transfer {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            bentobox_vault: self.bentobox_vault.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            authority: self.authority.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            token_program: self.token_program.to_account_info(),
        })
    }

    /// Helper function to create `Skim` cpi context.
    pub fn create_skim_context(&self) -> CpiContext<'_, '_, '_, 'info, Skim<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Skim {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            base_strategy_info: self.base_strategy_info.to_account_info(),
            token_program: self.token_program.to_account_info(),
            authority: self.authority.to_account_info(),
        })
    }
}


#[derive(Accounts)]
pub struct BaseWithdraw<'info> {
    /// Strategy program account.
    /// CHECK: using for check signer's seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: account checked in CPI.
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: account checked in CPI.
    pub strategy_account: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Bentobox token account.
    #[account(mut)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token account.
    #[account(mut, 
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,
              constraint = strategy_vault.mint == bentobox_vault.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Strategy token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(), 
                       bentobox_account.key().as_ref()],
              bump, 
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
}

impl<'info> BaseWithdraw<'info> {
    /// Helper function to create `Withdraw` cpi context.
    pub fn create_withdraw_context(&self) -> CpiContext<'_, '_, '_, 'info, Withdraw<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Withdraw {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            base_strategy_info: self.base_strategy_info.to_account_info(),
            authority: self.authority.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            token_program: self.token_program.to_account_info(),
        })
    }

    /// Helper function to create `Transfer` cpi context.
    pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Transfer {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            bentobox_vault: self.bentobox_vault.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            authority: self.authority.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            token_program: self.token_program.to_account_info(),
        })
    }
}

#[derive(Accounts)]
pub struct BaseExit<'info> {
    /// Strategy program account.
    /// CHECK: using for check signer's seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: account checked in CPI.
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: account checked in CPI.
    pub strategy_account: UncheckedAccount<'info>,
    /// Bentobox token account.
    #[account(mut)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token account.
    #[account(mut, 
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,
              constraint = strategy_vault.mint == bentobox_vault.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Account which holds all base info for strategy.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(), 
                       bentobox_account.key().as_ref()],
              bump, 
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Strategy token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
}

impl<'info> BaseExit<'info> {
    /// Helper function to create `Exit` cpi context.
    pub fn create_exit_context(&self) -> CpiContext<'_, '_, '_, 'info, Exit<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Exit {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            authority: self.authority.to_account_info(),
            base_strategy_info: self.base_strategy_info.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            token_program: self.token_program.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
        })
    }

    /// Helper function to create `Transfer` cpi context.
    pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), Transfer {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            bentobox_vault: self.bentobox_vault.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            authority: self.authority.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            token_program: self.token_program.to_account_info(),
        })
    }
}

#[derive(Accounts)]
pub struct BaseSafeHarvest<'info> {
    /// Strategy program account.
    /// CHECK: using for check signer's seeds
    #[account(mut)]
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: account checked in CPI.
    pub bentobox_account: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: account checked in CPI.
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Strategy account used by Bentobox.
    /// CHECK: account checked in CPI.
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(),
              bentobox_account.key().as_ref()],
              bump,
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Strategy token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
}

impl<'info> BaseSafeHarvest<'info> {
    /// Helper function to create `HarvestRewards` cpi context.
    pub fn create_harvest_rewards_context(&self) -> CpiContext<'_, '_, '_, 'info, HarvestRewards<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), HarvestRewards {
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            base_strategy_info: self.base_strategy_info.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
            authority: self.authority.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
        })
    }
    /// Helper function to create `SafeHarvest` cpi context.
    pub fn create_safe_harvest_context(&self) -> CpiContext<'_, '_, '_, 'info, SafeHarvest<'info>> {
        CpiContext::new(self.strategy_program.to_account_info(), SafeHarvest {
            base_strategy_info: self.base_strategy_info.to_account_info(),
            bentobox_account: self.bentobox_account.to_account_info(),
            strategy_program: self.strategy_program.to_account_info(),
            bentobox_program: self.bentobox_program.to_account_info(),
            strategy_account: self.strategy_account.to_account_info(),
            strategy_vault: self.strategy_vault.to_account_info(),
            authority: self.authority.to_account_info(),
            strategy_authority: self.strategy_authority.to_account_info(),
        })
    }
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct BaseStrategyInfo {
    /// Token public key for which the strategy is built.
    pub strategy_token: Pubkey,
    /// After bentobox 'exits' the strategy harvest, skim and withdraw functions can no loner be called.
    /// Is `true` if this strategy has been exited.
    pub exited: bool,
    /// Slippage protection when calling harvest.
    pub max_bentobox_balance: u64,
}

impl BaseStrategyInfo {
    pub const SIZE: usize = 32 + 1 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ResultAmount {
    /// The amount of tokens on BentoBox in shares.
    pub amount: i64,
}

impl ResultAmount {
    pub const SIZE: usize = 8;
}