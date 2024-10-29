use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, SetAuthority, Approve, Token, TokenAccount};
use common::constants::{BENTOBOX_SEED_PART, TOTAL_VAULT_KEY_SEED_PART};

// use bentobox::state::BentoBox;

use crate::error::ErrorCode;
use crate::state::*;

use common::errors::ErrorCode as CommonErrorCode;

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Strategy token account.
    #[account(init,
        seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
        strategy_account.key().as_ref(),
                 mint.key().as_ref()],
        bump,
        payer = authority,
        token::mint = mint,
        token::authority = authority,
        )]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy account.
    #[account(init,
        payer = authority,
        space = StrategyMock::SIZE)]
    pub strategy_account: Box<Account<'info, StrategyMock>>,
    /// Account which holds all base info for strategy.
    #[account(init,
        payer = authority,
        space = BaseStrategyInfo::SIZE)]
    pub base_strategy_info: Box<Account<'info, BaseStrategyInfo>>,
    /// Token mint account.
    pub mint: Box<Account<'info, Mint>>,
    /// Bentobox account.
    // pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// CHECK: owner = bentobox program
    pub bentobox_account: UncheckedAccount<'info>,
    /// CHECK: account checked and saved if strategy account.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Payer account and future owner of strategy account.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Rent account.
    pub rent: Sysvar<'info, Rent>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Account for storing result from strategy harvest implementation. 
    #[account(init, payer = authority, space = ResultAmount::SIZE)]
    pub cpi_result_account: Box<Account<'info, ResultAmount>>,
    #[account(init,
        seeds = [EXECUTOR_INFO_SEED.as_ref(),
        strategy_account.key().as_ref(), 
        authority.key().as_ref()],bump,
        payer = authority,
        space = ExecutorInfo::SIZE)]
    /// Executor info account for strategy authority for storing info if if is executor or not.
    pub executor_info: Box<Account<'info, ExecutorInfo>>,
    /// Pool token account.
    #[account(mut, constraint = pool_vault.mint == mint.key() @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub pool_vault: Box<Account<'info, TokenAccount>>,
    /// Pool authority account.
    #[account(mut)]
    pub pool_authority: Signer<'info>,
    /// Strategy token authority pda account. 
    /// CHECK: seeds
    #[account(seeds = [STRATEGY_SEED_PART.as_ref(),
    strategy_account.key().as_ref()], bump)]
    pub strategy_authority: UncheckedAccount<'info>,
}

impl<'info> Initialize<'info> {
    pub fn create_change_authority_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.strategy_vault.to_account_info(),
            current_authority: self.authority.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }

    pub fn create_approve_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Approve<'info>> {
        let cpi_accounts = Approve {
            to: self.pool_vault.to_account_info(),
            authority: self.pool_authority.to_account_info(),
            delegate: self.strategy_authority.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}
 
#[derive(Accounts)]
pub struct AfterExit<'info> {
    #[account(has_one = authority @ ErrorCode::UnauthorizedAfterExit)]
    pub strategy_account: Box<Account<'info, StrategyMock>>,
    #[account(constraint = strategy_account.base_strategy_info == base_strategy_info.key() @ ErrorCode::InvalidBaseStrategyInfoAccount,
     constraint = base_strategy_info.exited == true @ ErrorCode::StrategyNotExited)]
    pub base_strategy_info: Box<Account<'info, BaseStrategyInfo>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK:
    pub strategy_program: UncheckedAccount<'info>,
}
 
// #[derive(Accounts)]
// pub struct Skim<'info> {
//     /// Strategy program account.
//     /// CHECK: using for checking seeds.
//     pub strategy_program: UncheckedAccount<'info>,
//     /// Bentobox program account.
//     /// CHECK: with strategy.
//     pub bentobox_program: UncheckedAccount<'info>,
//     /// Bentobox account.
//     pub bentobox_account: Box<Account<'info, BentoBox>>,     
//     /// Strategy token account.
//     #[account(mut)]
//     pub strategy_vault: Box<Account<'info, TokenAccount>>,
//     /// Strategy account.
//     pub strategy_account:Box<Account<'info, StrategyMock>>,
//     /// Strategy token authority pda account.
//     /// CHECK: seeds, seeds::program.
//     #[account(seeds = [STRATEGY_SEED_PART.as_ref(), strategy_account.key().as_ref()], bump = strategy_account.strategy_authority_bump, seeds::program = strategy_program.key())]
//     pub strategy_authority: UncheckedAccount<'info>,
//     /// Account which holds all base info for strategy.
//     /// CHECK: whether strategy info relates to that strategy.
//     pub base_strategy_info: UncheckedAccount<'info>,
//     /// Token program account.
//     pub token_program: Program<'info, Token>,
//     #[account(mut)]
//     pub authority: Signer<'info>
// }
 

#[derive(Accounts)]
pub struct Skim<'info> {
    /// Strategy program account.
    /// CHECK: using for check strategy_authority seeds and account owner.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check accounts seeds and account owner.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: for owner and for rent_exempt enforce, inside inside instruction: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy account.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token authority pda account.
    /// CHECK: seeds and seeds::program.
    #[account(seeds = [STRATEGY_SEED_PART.as_ref(),
                       strategy_account.key().as_ref()],
                       bump,
                       seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Bentobox token authority pda account.
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(executor: Pubkey, value: bool)]
pub struct SetStrategyExecutor<'info> {
    #[account(has_one = authority @ ErrorCode::UnauthorizedSetStrategyExecutor)]
    pub strategy_account: Box<Account<'info, StrategyMock>>,
    #[account(init_if_needed,
        seeds = [EXECUTOR_INFO_SEED.as_ref(),
        strategy_account.key().as_ref(), 
        executor.as_ref()],
        bump,
        payer = authority,
        space = ExecutorInfo::SIZE)]
    pub executor_info: Box<Account<'info, ExecutorInfo>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct Harvest<'info> {
    /// Strategy program account.
    /// CHECK: using for check seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account..
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Strategy account used by Bentobox.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]    
    pub strategy_account: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref()],
              bump, 
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token authority pda account.
    // edit
    /// CHECK: account checked in CPI
    #[account(seeds = [STRATEGY_SEED_PART.as_ref(),
                       strategy_account.key().as_ref()], 
              bump,
              seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(mut, 
              rent_exempt = enforce,
              constraint = cpi_result_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub cpi_result_account: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// Strategy program account.
    /// CHECK: using for check seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]    
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token authority pda account.
    /// edit
    ///  CHECK: strategy authority
    #[account(seeds = [STRATEGY_SEED_PART.as_ref(), 
                       strategy_account.key().as_ref()], 
                       bump, 
                       seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(), 
                       bentobox_account.key().as_ref()], 
              bump, 
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Exit<'info> {
    /// Strategy program account.
    /// CHECK: using for check seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: using to check strategy_authority seeds and accounts inside exit implementation.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]

    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token authority pda account.
    /// CHECK: seeds
    #[account(seeds = [STRATEGY_SEED_PART.as_ref(),
                       strategy_account.key().as_ref()],
              bump,
              seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Bentobox token authority pda account.
    #[account(mut,
              seeds = [BENTOBOX_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref()],
              bump,
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(mut,
              rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct HarvestRewards<'info> {
    /// Strategy program account.
    /// CHECK: using for check signer's seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: using to check signer's seeds and accounts inside exit implementation.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref()],
              bump,
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Strategy token authority pda account.
    /// CHECK: seeds.
    #[account(mut, 
              seeds = [STRATEGY_SEED_PART.as_ref(),
                       strategy_account.key().as_ref()],
              bump, 
              seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SafeHarvest<'info> {
    // Account which holds all base info for strategy.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(mut, 
              rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy program account.
    /// CHECK: using for check seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox progra, account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Strategy account used by Bentobox.
    /// CHECK: using to check accounts inside safe harvest implementation.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox token authority pda account.
    #[account(mut, 
              seeds = [BENTOBOX_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref()],
              bump,
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Strategy token authority pda account.
    /// CHECK:
    #[account(mut,
              seeds = [STRATEGY_SEED_PART.as_ref(),
                       strategy_account.key().as_ref()],
              bump,
              seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Transfer<'info> {
    /// Strategy program account.
    /// CHECK: using for check signer's seeds.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: using for check signer's seeds.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Bentobox account.
    /// CHECK: whether bentobox is the same as initialized for strategy.
    #[account(rent_exempt = enforce,
              constraint = bentobox_account.owner == &bentobox_program.key() @ CommonErrorCode::InvalidAccountOwnerBentoboxProgram)]
    pub bentobox_account: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: on owner and on rent_exempt enforce.
    #[account(rent_exempt = enforce,
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Bentobox token authority pda account.
    #[account(mut,
              seeds = [BENTOBOX_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref()],
              bump,
              seeds::program = bentobox_program.key())]
    pub authority: Signer<'info>,
    /// Bentobox token account.
    #[account(mut, 
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
             bump,
             seeds::program = bentobox_program.key(),
             constraint = bentobox_vault.owner == authority.key() @ CommonErrorCode::BentoboxVaultInvalidAuthority)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       strategy_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token authority pda account.
    // edit
    /// CHECK: strategy authority
    #[account(seeds = [STRATEGY_SEED_PART.as_ref(),
                       strategy_account.key().as_ref()],
              bump,
              seeds::program = strategy_program.key())]
    pub strategy_authority: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
}
//** Strategy implementation: override the following functions: */
// #[interface]
// pub trait Strategy<'info,>
// {
//     /// Invest strategy.
//     ///
//     /// Arguments:
//     ///
//     /// * `amount` - The amount of tokens to invest.
//     /// Assume the amount of strategy token account is greater than the amount.
//     fn skim<'a>(ctx: Context<'_, '_, '_, 'a, Skim<'a>>, amount: u64) -> Result<()>;

//     /// Harvest any profits made converted to the asset and pass them to startegy token account.
//     ///
//     /// Arguments:
//     ///
//     /// * `balance`        - The amount of tokens that have been invested from strategy token account.
//     fn harvest<'a>(ctx: Context<'_, '_, '_, 'a, Harvest<'a>>, balance: u64) -> Result<()>;

//     /// Withdraw tokens. The returned amount can differ from the requested amount due to rounding.
//     ///
//     /// Arguments:
//     ///
//     /// * `amount`         - The requested amount the Bentobox wants to withdraw to strategy token account.
//     fn withdraw<'a>(ctx: Context<'_, '_, '_, 'a, Withdraw<'a>>, amount: u64) -> Result<()>;

//     /// Withdraw the maximum available amount of the invested assets to strategy token account.
//     fn exit<'a>(ctx: Context<'_, '_, '_, 'a, Exit<'a>>) -> Result<()>;

//     /// Claim any tokens rewards and optionally sell them for the underlying token.
//     fn harvest_rewards<'a>(ctx: Context<'_, '_, '_, 'a, HarvestRewards<'a>>) -> Result<()>;

//     /// Harvest profits with safe get harvest rewards.
//     fn safe_harvest<'a>(
//         ctx: Context<'_, '_, '_, 'a, SafeHarvest<'a>>,
//         max_balance: u64,
//     ) -> Result<()>;

//     /// Transfer tokens from strategy token account to Bentobox token account.
//     ///
//     /// Arguments:
//     ///
//     /// * `amount`         - The requested amount the Bentobox wants to withdraw.
//     fn transfer<'a>(ctx: Context<'_, '_, '_, 'a, Transfer<'a>>, amount: u64) -> Result<()>;
//     //** End strategy implementation */
// }
