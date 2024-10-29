// use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey};
// use anchor_spl::token::{Token, TokenAccount};

// use strategy_package::strategy_interface::{
//     Exit, Harvest, HarvestRewards, SafeHarvest, Skim, Transfer, Withdraw,
// };

// use common::errors::ErrorCode as CommonErrorCode;
// use common::constants::*;
// moved into programs/bentobox/state.rs
// #[derive(Accounts)]
// pub struct BaseSkim<'info> {
//     /// Strategy program account.
//     /// CHECK: account checked in CPI.
//     pub strategy_program: UncheckedAccount<'info>,
//     /// Bentobox program account.
//     /// CHECK: account checked in CPI.
//     pub bentobox_program: UncheckedAccount<'info>,
//     /// Bentobox account.
//     /// CHECK: account checked in CPI.
//     pub bentobox_account: UncheckedAccount<'info>,
//     /// Strategy token account.
//     #[account(mut)]
//     pub strategy_vault: Box<Account<'info, TokenAccount>>,
//     /// Strategy account.
//     /// CHECK: account checked in CPI.
//     pub strategy_account: UncheckedAccount<'info>,
//     /// Strategy token authority account.
//     /// CHECK: account checked in CPI.
//     pub strategy_authority: UncheckedAccount<'info>,
//     /// Account which holds all base info for strategy.
//     /// CHECK: account checked in CPI.
//     pub base_strategy_info: UncheckedAccount<'info>,
//     /// Token program account.
//     pub token_program: Program<'info, Token>,
//     /// Bentobox token authority pda account.
//     #[account(mut)]
//     pub authority: Signer<'info>,
// }

// impl<'info> BaseSkim<'info> {
//     /// Helper function to create `Skim` cpi context.
//     pub fn create_skim_context(&self) -> CpiContext<'_, '_, '_, 'info, Skim<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Skim {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             strategy_account: self.strategy_account.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             base_strategy_info: self.base_strategy_info.clone(),
//             token_program: self.token_program.clone(),
//             authority: self.authority.clone(),
//         })
//     }
// }
// #[derive(Accounts)]
// pub struct BaseHarvest<'info> {
//     /// Strategy program account.
//     /// CHECK: using for check signer's seeds.
//     pub strategy_program: UncheckedAccount<'info>,
//     /// Bentobox program account.
//     /// CHECK: using for check signer's seeds.
//     pub bentobox_program: UncheckedAccount<'info>,
//     /// Bentobox account.
//     /// CHECK: account checked in CPI.
//     pub bentobox_account: UncheckedAccount<'info>,
//     /// Strategy account.
//     /// CHECK: account checked in CPI.
//     pub strategy_account: UncheckedAccount<'info>,
//     /// Account which holds all base info for strategy.
//     /// CHECK: on owner and on rent_exempt enforce.
//     #[account(rent_exempt = enforce,
//               constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
//     pub base_strategy_info: UncheckedAccount<'info>,
//     /// Bentobox token account.
//     #[account(mut)]
//     pub bentobox_vault: Box<Account<'info, TokenAccount>>,
//     /// Strategy token account.
//     #[account(mut, 
//               seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
//                        strategy_account.key().as_ref(),
//                        bentobox_vault.mint.as_ref()],
//               bump,
//               seeds::program = strategy_program.key(),
//               constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,
//               constraint = strategy_vault.mint == bentobox_vault.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
//     pub strategy_vault: Box<Account<'info, TokenAccount>>,
//     /// Bentobox token authority pda account.
//     #[account(mut, 
//               seeds = [BENTOBOX_SEED_PART.as_ref(), bentobox_account.key().as_ref()], 
//               bump, 
//               seeds::program = bentobox_program.key())]
//     pub authority: Signer<'info>,
//     /// Strategy  token authority pda account.
//     /// CHECK: account checked in CPI.
//     #[account(mut)]
//     pub strategy_authority: UncheckedAccount<'info>,
//     /// Token program account.
//     pub token_program: Program<'info, Token>,
//     /// Account for storing result from strategy harvest implementation.
//     /// CHECK: on owner and on rent_exempt enforce.
//     #[account(mut, 
//               rent_exempt = enforce,
//               constraint = cpi_result_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
//     pub cpi_result_account: UncheckedAccount<'info>,
// }

// impl<'info> BaseHarvest<'info> {
//     /// Helper function to create `Harvest` cpi context.
//     pub fn create_harvest_context(&self) -> CpiContext<'_, '_, '_, 'info, Harvest<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Harvest {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_account: self.strategy_account.clone(),
//             authority: self.authority.clone(),
//             cpi_result_account: self.cpi_result_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             token_program: self.token_program.clone(),
//             base_strategy_info: self.base_strategy_info.clone(),
//         })
//     }

//     /// Helper function to create `Transfer` cpi context.
//     pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Transfer {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             bentobox_vault: self.bentobox_vault.clone(),
//             strategy_account: self.strategy_account.clone(),
//             authority: self.authority.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             token_program: self.token_program.clone(),
//         })
//     }

//     /// Helper function to create `Skim` cpi context.
//     pub fn create_skim_context(&self) -> CpiContext<'_, '_, '_, 'info, Skim<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Skim {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             strategy_account: self.strategy_account.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             base_strategy_info: self.base_strategy_info.clone(),
//             token_program: self.token_program.clone(),
//             authority: self.authority.clone(),
//         })
//     }
// }

// #[derive(Accounts)]
// pub struct BaseWithdraw<'info> {
//     /// Strategy program account.
//     /// CHECK: using for check signer's seeds.
//     pub strategy_program: UncheckedAccount<'info>,
//     /// Bentobox program account.
//     /// CHECK: using for check signer's seeds.
//     pub bentobox_program: UncheckedAccount<'info>,
//     /// Bentobox account.
//     /// CHECK: account checked in CPI.
//     pub bentobox_account: UncheckedAccount<'info>,
//     /// Strategy account.
//     /// CHECK: account checked in CPI.
//     pub strategy_account: UncheckedAccount<'info>,
//     /// Account which holds all base info for strategy.
//     /// CHECK: on owner and on rent_exempt enforce.
//     #[account(rent_exempt = enforce,
//               constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
//     pub base_strategy_info: UncheckedAccount<'info>,
//     /// Bentobox token account.
//     #[account(mut)]
//     pub bentobox_vault: Box<Account<'info, TokenAccount>>,
//     /// Strategy token account.
//     #[account(mut, 
//               seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
//                        strategy_account.key().as_ref(),
//                        bentobox_vault.mint.as_ref()],
//               bump,
//               seeds::program = strategy_program.key(),
//               constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,
//               constraint = strategy_vault.mint == bentobox_vault.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
//     pub strategy_vault: Box<Account<'info, TokenAccount>>,
//     /// Token program account.
//     pub token_program: Program<'info, Token>,
//     /// Strategy token authority pda account.
//     /// CHECK: account checked in CPI.
//     #[account(mut)]
//     pub strategy_authority: UncheckedAccount<'info>,
//     /// Bentobox token authority pda account.
//     #[account(mut, 
//               seeds = [BENTOBOX_SEED_PART.as_ref(), 
//                        bentobox_account.key().as_ref()],
//               bump, 
//               seeds::program = bentobox_program.key())]
//     pub authority: Signer<'info>,
// }

// impl<'info> BaseWithdraw<'info> {
//     /// Helper function to create `Withdraw` cpi context.
//     pub fn create_withdraw_context(&self) -> CpiContext<'_, '_, '_, 'info, Withdraw<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Withdraw {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_account: self.strategy_account.clone(),
//             base_strategy_info: self.base_strategy_info.clone(),
//             authority: self.authority.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             token_program: self.token_program.clone(),
//         })
//     }

//     /// Helper function to create `Transfer` cpi context.
//     pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Transfer {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             bentobox_vault: self.bentobox_vault.clone(),
//             strategy_account: self.strategy_account.clone(),
//             authority: self.authority.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             token_program: self.token_program.clone(),
//         })
//     }
// }
// #[derive(Accounts)]
// pub struct BaseExit<'info> {
//     /// Strategy program account.
//     /// CHECK: using for check signer's seeds.
//     pub strategy_program: UncheckedAccount<'info>,
//     /// Bentobox program account.
//     /// CHECK: using for check signer's seeds.
//     pub bentobox_program: UncheckedAccount<'info>,
//     /// Bentobox account.
//     /// CHECK: account checked in CPI.
//     pub bentobox_account: UncheckedAccount<'info>,
//     /// Strategy account.
//     /// CHECK: account checked in CPI.
//     pub strategy_account: UncheckedAccount<'info>,
//     /// Bentobox token account.
//     #[account(mut)]
//     pub bentobox_vault: Box<Account<'info, TokenAccount>>,
//     /// Strategy token account.
//     #[account(mut, 
//               seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
//                        strategy_account.key().as_ref(),
//                        bentobox_vault.mint.as_ref()],
//               bump,
//               seeds::program = strategy_program.key(),
//               constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,
//               constraint = strategy_vault.mint == bentobox_vault.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
//     pub strategy_vault: Box<Account<'info, TokenAccount>>,
//     /// Token program account.
//     pub token_program: Program<'info, Token>,
//     /// Account which holds all base info for strategy.
//     /// CHECK: account checked in CPI.
//     #[account(mut)]
//     pub base_strategy_info: UncheckedAccount<'info>,
//     /// Bentobox token authority pda account.
//     #[account(mut, 
//               seeds = [BENTOBOX_SEED_PART.as_ref(), 
//                        bentobox_account.key().as_ref()],
//               bump, 
//               seeds::program = bentobox_program.key())]
//     pub authority: Signer<'info>,
//     /// Strategy token authority pda account.
//     /// CHECK: account checked in CPI.
//     #[account(mut)]
//     pub strategy_authority: UncheckedAccount<'info>,
// }

// impl<'info> BaseExit<'info> {
//     /// Helper function to create `Exit` cpi context.
//     pub fn create_exit_context(&self) -> CpiContext<'_, '_, '_, 'info, Exit<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Exit {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             authority: self.authority.clone(),
//             base_strategy_info: self.base_strategy_info.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             token_program: self.token_program.clone(),
//             strategy_account: self.strategy_account.clone(),
//         })
//     }

//     /// Helper function to create `Transfer` cpi context.
//     pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), Transfer {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             bentobox_vault: self.bentobox_vault.clone(),
//             strategy_account: self.strategy_account.clone(),
//             authority: self.authority.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             token_program: self.token_program.clone(),
//         })
//     }
// }
// #[derive(Accounts)]
// pub struct BaseSafeHarvest<'info> {
//     /// Strategy program account.
//     /// CHECK: using for check signer's seeds
//     #[account(mut)]
//     pub strategy_program: UncheckedAccount<'info>,
//     /// Bentobox program account.
//     /// CHECK: using for check signer's seeds
//     pub bentobox_program: UncheckedAccount<'info>,
//     /// Bentobox account.
//     /// CHECK: account checked in CPI.
//     pub bentobox_account: UncheckedAccount<'info>,
//     /// Account which holds all base info for strategy.
//     /// CHECK: account checked in CPI.
//     pub base_strategy_info: UncheckedAccount<'info>,
//     /// Strategy account used by Bentobox.
//     /// CHECK: account checked in CPI.
//     pub strategy_account: UncheckedAccount<'info>,
//     /// Strategy token account.
//     #[account(mut)]
//     pub strategy_vault: Box<Account<'info, TokenAccount>>,
//     /// Bentobox token authority pda account.
//     #[account(mut, 
//               seeds = [BENTOBOX_SEED_PART.as_ref(),
//               bentobox_account.key().as_ref()],
//               bump,
//               seeds::program = bentobox_program.key())]
//     pub authority: Signer<'info>,
//     /// Strategy token authority pda account.
//     /// CHECK: account checked in CPI.
//     #[account(mut)]
//     pub strategy_authority: UncheckedAccount<'info>,
// }

// impl<'info> BaseSafeHarvest<'info> {
//     /// Helper function to create `HarvestRewards` cpi context.
//     pub fn create_harvest_rewards_context(&self) -> CpiContext<'_, '_, '_, 'info, HarvestRewards<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), HarvestRewards {
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             strategy_account: self.strategy_account.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             base_strategy_info: self.base_strategy_info.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//             authority: self.authority.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//         })
//     }
//     /// Helper function to create `SafeHarvest` cpi context.
//     pub fn create_safe_harvest_context(&self) -> CpiContext<'_, '_, '_, 'info, SafeHarvest<'info>> {
//         CpiContext::new(self.strategy_program.to_account_info(), SafeHarvest {
//             base_strategy_info: self.base_strategy_info.clone(),
//             bentobox_account: self.bentobox_account.clone(),
//             strategy_program: self.strategy_program.clone(),
//             bentobox_program: self.bentobox_program.clone(),
//             strategy_account: self.strategy_account.clone(),
//             strategy_vault: self.strategy_vault.clone(),
//             authority: self.authority.clone(),
//             strategy_authority: self.strategy_authority.clone(),
//         })
//     }
// }
