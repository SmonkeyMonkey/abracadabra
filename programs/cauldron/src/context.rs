use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, SetAuthority, Approve, Token, TokenAccount};


use crate::{error::ErrorCode, state::*, utils::*};

use bentobox::{
    self,
    cpi::accounts::Conversion,
    program::Bentobox,
    state::{Balance, BentoBox, MasterContractApproved, MasterContractWhitelisted, Total as BentoBoxTotal},
};

use swapper_package::swapper_interface::Swap;
use swapper_orca::cpi::accounts::Swap as SwapOrca;

use swapper_raydium::cpi::accounts::Swap as SwapRaydium;

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Cauldron account.
    #[account(init, payer = authority, space = Cauldron::SIZE)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// MagicInternetMoney mint account.
    pub magic_internet_money: Box<Account<'info, Mint>>,
    /// Сollateral token mint account.
    #[account(constraint = collateral.key() != Pubkey::default() @ ErrorCode::InvalidCollateral)]
    pub collateral: Box<Account<'info, Mint>>,
    /// Switchboard data feed account.
    /// CHECK: account owner.
    pub switchboard_data_feed: UncheckedAccount<'info>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct CreateUserBalance<'info> {
    /// User balance pda account.
    #[account(init,
              seeds = [USER_BALANCE_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       user.as_ref()],
              bump,
              payer = authority,
              space = UserBalance::SIZE)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateTotal<'info> {
    /// Cauldron pda total account.
    #[account(init,
              seeds = [TOTAL_SEED_PART.as_ref(),
                      cauldron_account.key().as_ref()],
              bump,
              payer = authority,
              space = Total::SIZE)]
    pub total_data: AccountLoader<'info, Total>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// System program account.
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(init,
              seeds = [TOTAL_VAULT_SEED_PART.as_ref(),
                      cauldron_account.key().as_ref(),
                      mint.key().as_ref()],
              bump,
              payer = authority,
              token::mint = mint,
              token::authority = authority,)]
    pub cauldron_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Token mint account.
    pub mint: Box<Account<'info, Mint>>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Sysvar rent account, is required to be rent-exempt.
    pub rent: Sysvar<'info, Rent>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
}

impl<'info> CreateVault<'info> {
    /// Helper function to create `SetAuthority` cpi context.
    pub fn create_change_authority_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.cauldron_vault.to_account_info(),
            current_authority: self.authority.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}

#[derive(Accounts)]
pub struct Accrue<'info> {
    /// Cauldron pda total account.
    #[account(seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump, mut)]
    pub total_data: AccountLoader<'info, Total>,
    #[account(mut)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SwitchboardPrice<'info> {
    /// Switchboard data feed account.
    /// CHECK: account owner.
    #[account(constraint = switchboard_data_feed.key() == cauldron_account.switchboard_data_feed @ ErrorCode::IncompatibleSwitchboardDataFeed)]
    pub switchboard_data_feed: UncheckedAccount<'info>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
}

#[derive(Accounts)]
#[instruction(to: Pubkey)]
pub struct Repay<'info> {
    /// Cauldron pda total account.
    #[account(mut,   
              seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
                       bump)]
    pub total_data: AccountLoader<'info, Total>,
    /// CHECK: passed to share
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// User balance pda account.
    #[account(mut, 
              seeds = [USER_BALANCE_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       to.as_ref()],
              bump)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron account.
    #[account(mut)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron balance account on bentobox.
    /// CHECK: pass to transfer.
    #[account(mut)]
    pub cauldron_bentobox_balance: UncheckedAccount<'info>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.to_account_info().owner == &bentobox_program.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram,
              constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Authority balance account on bentobox.
    /// CHECK: pass to transfer.
    #[account(mut)]
    pub from_bentobox_balance: UncheckedAccount<'info>,
    #[account(constraint = cauldron_account.magic_internet_money == magic_internet_money_mint.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub magic_internet_money_mint: Box<Account<'info, Mint>>,
    /// CHECK: seeds.
    pub cauldron_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: inside bentobox transfer.
    pub master_contract_approved: UncheckedAccount<'info>,
    /// CHECK: inside bentobox transfer.
    pub master_contract_whitelisted: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(to: Pubkey)]
pub struct Borrow<'info> {
    /// CHECK: passed to transfer
    #[account(mut)]
    pub from: UncheckedAccount<'info>,
    /// CHECK: passed to share
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// CHECK: pass to transfer.
    #[account(mut)]
    pub to_bentobox_balance: UncheckedAccount<'info>,
    /// User balance pda account.
    #[account(mut,
        seeds = [USER_BALANCE_SEED_PART.as_ref(),
                 cauldron_account.key().as_ref(),
                 authority.key().as_ref()],
        bump,)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron pda total account.
    #[account(seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump, mut)]
    pub total_data: AccountLoader<'info, Total>,
    /// Cauldron account.
    #[account(mut)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// CHECK: pass to transfer.
    #[account(mut)]
    pub cauldron_bentobox_balance: UncheckedAccount<'info>,
    #[account(constraint = bentobox_account.to_account_info().owner == &bentobox_program.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    pub bentobox_program: Program<'info, Bentobox>,
    #[account(constraint = cauldron_account.magic_internet_money == magic_internet_money_mint.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub magic_internet_money_mint: Box<Account<'info, Mint>>,
    /// Switchboard data feed account.
    /// CHECK: account key.
    #[account(constraint = switchboard_data_feed.key() == cauldron_account.switchboard_data_feed @ ErrorCode::IncompatibleSwitchboardDataFeed)]
    pub switchboard_data_feed: UncheckedAccount<'info>,
    // pub switchboard_data_feed: AccountLoader<'info,AggregatorAccountData>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

impl<'info> Borrow<'info> {
    pub fn create_conversion_context(&self) -> CpiContext<'_, '_, '_, 'info, Conversion<'info>> {
        create_conversion_context(
            self.bentobox_program.to_account_info(),
            self.magic_internet_money_mint.to_account_info(),
            self.bentobox_total_data.to_account_info(),
            self.bentobox_account.to_account_info(),
        )
    }
}

#[derive(Accounts)]
#[instruction(to: Pubkey, share: u64)]
pub struct AddCollateral<'info> {
    /// User balance pda account.
    #[account(mut, 
              seeds = [USER_BALANCE_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       to.as_ref()],
              bump)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron pda total account.
    #[account(mut, 
              seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump)]
    pub total_data: AccountLoader<'info, Total>,
    /// Cauldron balance account on bentobox.
    #[account(mut, 
             seeds = [bentobox::state::BALANCE_SEED_PART.as_ref(),
                      cauldron_account.bentobox.as_ref(),
                      cauldron_account.collateral.as_ref(),
                      cauldron_authority.key().as_ref(),], 
             bump, 
             seeds::program = cauldron_account.bentobox_program)]
    pub cauldron_bentobox_balance: Box<Account<'info, Balance>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    // > Remaining accounts:
    // Only needed if skim = false 

    // Collateral mint account.
    // CHECK: with account which initialized in cauldron.
    // [0] collateral, 
    // [1] authority_bentobox_balance, mut
    // CHECK: with account which initialized in cauldron.
    // [2] bentobox_program
    // CHECK: with account which initialized in cauldron.
    // [3] bentobox_account
    // [4] master_contract_whitelisted
    // [5] master_contract_approved
}

#[derive(Accounts)]
#[instruction(to : Pubkey, share: u64)]
pub struct RemoveCollateral<'info> {
    /// User balance pda account.
    #[account(mut, 
              seeds = [USER_BALANCE_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       authority.key().as_ref()],
              bump)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron account.
    #[account(mut)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron pda total account.
    #[account(mut, 
              seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
    /// Collateral mint account.
    #[account(constraint = collateral.key() == cauldron_account.collateral @ ErrorCode::InvalidCollateral)]
    pub collateral: Box<Account<'info, Mint>>,
    /// Cauldron balance account on bentobox.
    #[account(mut)]
    pub cauldron_bentobox_balance: Box<Account<'info, Balance>>,
    /// Authority balance account on bentobox.
    #[account(mut)]
    pub to_bentobox_balance: Box<Account<'info, Balance>>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Bentobox total data account.    
    /// CHECK: inside bentobox instuction.
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// Switchboard data feed account.
    /// CHECK: account key.
    #[account(constraint = switchboard_data_feed.key() == cauldron_account.switchboard_data_feed @ ErrorCode::IncompatibleSwitchboardDataFeed)]
    pub switchboard_data_feed: UncheckedAccount<'info>,
    // pub switchboard_data_feed: AccountLoader<'info,AggregatorAccountData>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub master_contract_approved: Box<Account<'info, MasterContractApproved>>,
    /// CHECK: inside bentobox transfer.
    pub master_contract_whitelisted: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(to: Pubkey, amount: u64, share: u64)]
pub struct BentoDeposit<'info> {
    /// Token account which push the tokens, should be owned by authority.
    /// CHECK: inside bentobox deposit.
    #[account(mut)]
    pub from_vault: Account<'info, TokenAccount>,
    /// CHECK: inside bentobox deposit.
    /// Bentobox token account.
    #[account(mut)]
    pub bentobox_vault: UncheckedAccount<'info>,
    /// Bentobox balance account which holds balance on 'to' account. 
    /// CHECK: inside bentobox deposit.
    #[account(mut)]
    pub bentobox_to_balance: Box<Account<'info, Balance>>,
    /// Total account which stores all Bentobox amount by token.
    /// CHECK: inside bentobox deposit.
    #[account(mut)]
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Strategy data account which stores base data for strategy.
    /// CHECK: inside bentobox deposit.     
    pub bentobox_strategy_data: UncheckedAccount<'info>,
    /// Mint token account.
    pub mint: Box<Account<'info, Mint>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(mut,   
              seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// CHECK: inside bentobox deposit.
    pub master_contract_approved: UncheckedAccount<'info>,
    /// CHECK: inside bentobox deposit.
    pub master_contract_whitelisted: UncheckedAccount<'info>,
    /// User account which want to push tokens.
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, share: u64)]
pub struct BentoWithdraw<'info> {
    /// Token account where withdrawer pulls the tokens, should be owner by withdrawer.
    /// CHECK: inside bentobox withdraw.
    #[account(mut)]
    pub to_vault: UncheckedAccount<'info>,
    /// CHECK: inside bentobox withdraw.
    /// Bentobox token account.
    #[account(mut)]
    pub bentobox_vault: UncheckedAccount<'info>,
    /// Balance account which holds balance on 'from' account. 
    /// CHECK: inside bentobox withdraw.
    #[account(mut)]
    pub bentobox_from_balance: Box<Account<'info, Balance>>,
    /// Total account which stores all Bentobox amount by token.
    /// CHECK: inside bentobox withdraw.
    #[account(mut)]
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Bentobox token authority account.
    /// CHECK: inside bentobox withdraw.
    pub bentobox_vault_authority: UncheckedAccount<'info>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(mut,               
              seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// CHECK: inside bentobox withdraw.
    pub master_contract_approved: UncheckedAccount<'info>,
    /// CHECK: inside bentobox withdraw.
    pub master_contract_whitelisted: UncheckedAccount<'info>,
    /// User account which want to pull tokens.
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(from : Pubkey, to: Pubkey)]
pub struct BentoTransfer<'info> {
    /// Cauldron account.
    #[account(mut)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Mint account.
    pub mint: Box<Account<'info, Mint>>,
    /// From balance account on bentobox.
    /// CHECK: inside bentobox.
    #[account(mut)]
    pub from_bentobox_balance: UncheckedAccount<'info>,
    /// To balance account on bentobox.
    /// CHECK: inside bentobox.
    #[account(mut)]
    pub to_bentobox_balance: UncheckedAccount<'info>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    #[account(mut, constraint = authority.key() == from @ ErrorCode::InvalidParameterFrom)]
    pub authority: Signer<'info>,
    pub master_contract_approved: Box<Account<'info, MasterContractApproved>>,
    /// CHECK: inside bentobox transfer.
    pub master_contract_whitelisted: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ApproveToCauldron<'info> {
    /// Token account which authority want to approve.
    #[account(mut, 
              constraint = account_to_approve.owner == authority.key() @ ErrorCode:: IncompatibleTokenAccountOwner)]
    pub account_to_approve: Box<Account<'info, TokenAccount>>,
    /// Cauldron authority account.
    /// CHECK: seeds
    #[account(seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,    
    /// Token program account.
    pub token_program: Program<'info, Token>,
    #[account(mut)]
    pub authority: Signer<'info>
}

impl<'info> ApproveToCauldron<'info> {
    pub fn create_approve_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, Approve<'info>> {
        let cpi_accounts = Approve {
            to: self.account_to_approve.to_account_info(),
            authority: self.authority.to_account_info(),
            delegate: self.cauldron_authority.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}

#[derive(Accounts)]
pub struct CreateCauldronApprovalAccount<'info> {
    /// Master Contract PDA account to store user approval information.
    /// CHECK: inside bentobox CreateApproveMasterContract
    #[account(mut)]
    pub master_contract_approved: UncheckedAccount<'info>,
    /// Master Contract PDA account that store whitelised information.
    /// CHECK: inside bentobox CreateApproveMasterContract.
    pub master_contract_whitelisted: UncheckedAccount<'info>,
    /// Cauldron authority account.
    /// CHECK: seeds
    #[account(mut, 
              seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron program.
    /// CHECK: inside CreateApproveMasterContract.
    pub cauldron_program: UncheckedAccount<'info>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// System program account.
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
pub struct SetFeeTo<'info> {
    /// Cauldron account.
    #[account(mut, has_one = authority)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,    
    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    /// Cauldron account.
    #[account(mut)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,  
    /// Cauldron pda total account.
    #[account(mut, 
              seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Total account which stores all Bentobox amount by token.
    /// CHECK: inside bentobox transfer.
    #[account(mut)]
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// Token magic internet money mint account.
    #[account(constraint = magic_internet_money.key() == cauldron_account.magic_internet_money @ ErrorCode::InvalidMagicInternetMoneyAccount)]
    pub magic_internet_money: Box<Account<'info, Mint>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Cauldron balance account on bentobox.
    #[account(mut)]
    pub cauldron_bentobox_balance: Box<Account<'info, Balance>>,
    /// fee_to balance account on bentobox.
    #[account(mut)]
    pub fee_to_bentobox_balance: Box<Account<'info, Balance>>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReduceSupply<'info> {
     // Token account where withdrawer pulls the tokens.
    /// CHECK: inside bentobox withdraw.
    #[account(mut)]
    pub cauldron_owner_vault: Account<'info, TokenAccount>,
    /// CHECK: inside bentobox withdraw.
    /// Bentobox token account.
    #[account(mut)]
    pub bentobox_vault: UncheckedAccount<'info>,
    /// Balance account which holds cauldron balance on bentobox. 
    /// CHECK: inside bentobox withdraw.
    #[account(mut)]
    pub cauldron_bentobox_balance: Box<Account<'info, Balance>>,
    /// Total account which stores all Bentobox amount by token.
    /// CHECK: inside bentobox withdraw.
    #[account(mut)]
    pub bentobox_total_data: UncheckedAccount<'info>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Cauldron account.
    #[account(has_one = authority)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(mut,               
              seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Bentobox token authority account.
    /// CHECK: inside bentobox withdraw.
    pub bentobox_vault_authority: UncheckedAccount<'info>,
    /// User account which want to pull tokens.
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ChangeBorrowLimit<'info> {
    /// Cauldron account.
    #[account(mut, has_one = authority)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,    
    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
pub struct ChangeInterestRate<'info> {
    /// Cauldron account.
    #[account(mut, has_one = authority)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,    
    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
pub struct GetRepayShare<'info> {
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>, 
    /// Cauldron pda total account.
    #[account(seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    #[account(constraint = magic_internet_money.key() == cauldron_account.magic_internet_money @ ErrorCode::InvalidMagicInternetMoneyAccount)]
    /// Magic_internet_money mint account
    pub magic_internet_money: Box<Account<'info, Mint>>,
    /// Total account which stores all Bentobox amount by token.
    /// CHECK: inside bentobox withdraw.
    pub bentobox_total_data: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
pub struct GetRepayPart<'info> {
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>, 
    /// Cauldron pda total account.
    #[account(seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>, 
    #[account(mut)]
    pub authority: Signer<'info>
}

#[derive(Accounts)]
#[instruction(_user: Pubkey)]
pub struct BeginLiquidate<'info> {
    /// Collateral total account which stores all Bentobox amount by token.
    #[account(mut)]
    pub bentobox_collateral_total_data: AccountLoader<'info, BentoBoxTotal>,
    /// MiM total account which stores all Bentobox amount by token.
    #[account(mut)]
    pub bentobox_mim_total_data: AccountLoader<'info, BentoBoxTotal>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(mut, seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Switchboard data feed account.
    /// CHECK: account owner.
    #[account(constraint = switchboard_data_feed.key() == cauldron_account.switchboard_data_feed @ ErrorCode::IncompatibleSwitchboardDataFeed)]
    // pub switchboard_data_feed: AccountLoader<'info,AggregatorAccountData>,
    pub switchboard_data_feed: UncheckedAccount<'info>,
    /// Cauldron pda total account.
    #[account(mut, 
              seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
      /// User balance pda account.
      #[account(mut, 
        seeds = [USER_BALANCE_SEED_PART.as_ref(),
                 cauldron_account.key().as_ref(),
                 _user.as_ref()],
        bump)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron collateral balance account on bentobox.
    #[account(mut)]
    pub cauldron_collateral_bentobox_balance: Box<Account<'info, Balance>>,
    /// Collateral mint account.
    #[account(constraint = collateral.key() == cauldron_account.collateral @ ErrorCode::InvalidCollateral)]
    pub collateral: Box<Account<'info, Mint>>,
    /// MIM mint account.
    #[account(constraint = cauldron_account.magic_internet_money == magic_internet_money_mint.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub magic_internet_money_mint: Box<Account<'info, Mint>>,
    /// Liquidator account pda account.
    #[account(init,
              seeds = [LIQUIDATOR_ACCOUNT_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       authority.key().as_ref()],
              bump,
              payer = authority,
              space = LiquidatorAccount::SIZE)]
    pub liquidator_account: Box<Account<'info, LiquidatorAccount>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Cauldron collateral vault account.
    #[account(mut,
              seeds = [TOTAL_VAULT_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       collateral.key().as_ref()],
              bump)]
    pub cauldron_source_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox vault authority account account.
    /// CHECK: inside bentobox withdraw instruction.
    pub bentobox_vault_authority: UncheckedAccount<'info>,
    /// Bentobox collateral vault account.
    #[account(mut)]
    pub bentobox_collateral_vault: Box<Account<'info, TokenAccount>>,
    /// System program account.
    pub system_program: Program<'info, System>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct LiquidateSwap<'info> {
    /// Liquidator account pda account.
    #[account(mut,
              seeds = [LIQUIDATOR_ACCOUNT_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       liquidator_account.origin_liquidator.as_ref()],
              bump)]
    pub liquidator_account: Box<Account<'info, LiquidatorAccount>>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(mut, 
              seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Collateral mint account.
    #[account(constraint = collateral.key() == cauldron_account.collateral @ ErrorCode::InvalidCollateral)]
    pub collateral: Box<Account<'info, Mint>>,
    /// MIM mint account.
    #[account(constraint = cauldron_account.magic_internet_money == magic_internet_money_mint.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub magic_internet_money_mint: Box<Account<'info, Mint>>,
    /// Cauldron collateral vault account.
    #[account(mut,
              seeds = [TOTAL_VAULT_SEED_PART.as_ref(),
                        cauldron_account.key().as_ref(),
                        collateral.key().as_ref()],
              bump,
              constraint = cauldron_source_vault.owner == cauldron_authority.key() @ ErrorCode::InvalidCauldronSourceVault)]
    pub cauldron_source_vault: Box<Account<'info, TokenAccount>>,
    /// Cauldron MIM vault account.
    #[account(mut,
              seeds = [TOTAL_VAULT_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       magic_internet_money_mint.key().as_ref()],
              bump,
              constraint = cauldron_destination_vault.owner == cauldron_authority.key() @ ErrorCode::InvalidCauldronDestinationVault)]
    pub cauldron_destination_vault: Box<Account<'info, TokenAccount>>,
    /// Concreet swapper program account.
    /// CHECK:
    pub swapper_program: UncheckedAccount<'info>,
    /// Swap program account.
    /// CHECK: inside swap
    pub swap_program: UncheckedAccount<'info>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Signer account
    #[account(mut)]
    pub authority: Signer<'info>,
     /// Token swap account.
    /// CHECK:
    #[account(mut)]
    pub token_swap: UncheckedAccount<'info>,
    /// Swap authority account.
    /// CHECK:
    pub swap_authority: UncheckedAccount<'info>,
}

impl<'info> LiquidateSwap<'info> {
    /// Helper function to create swap context.
    pub fn create_swap_ctx(&self) 
        -> Result<CpiContext<'_, '_, '_, 'info, Swap<'info>>> {
            let mut cauldron_authority = self.cauldron_authority.to_account_info();
            cauldron_authority.is_signer = true;

            Ok(CpiContext::new(self.swapper_program.to_account_info(), Swap {
                source_token_account: self.cauldron_source_vault.clone(),
                destination_token_account: self.cauldron_destination_vault.clone(),
                token_program: self.token_program.clone(),
                swap_program: self.swap_program.clone(),
                authority: Signer::try_from(&cauldron_authority)?,
            }))
        }
    pub fn create_orca_swap_ctx(&self) -> Result<CpiContext<'_,'_,'_,'info,SwapOrca<'info>>> {
            let mut cauldron_authority = self.cauldron_authority.to_account_info();
            cauldron_authority.is_signer = true;

            Ok(CpiContext::new(self.swapper_program.to_account_info(), SwapOrca {
                source_token_account: self.cauldron_source_vault.to_account_info(),
                destination_token_account: self.cauldron_destination_vault.to_account_info(),
                token_program: self.token_program.to_account_info(),
                swap_program: self.swap_program.to_account_info(),
                authority: Signer::try_from(&cauldron_authority)?.to_account_info(),
            }))
    }
    pub fn create_raydium_swap_ctx(&self) -> Result<CpiContext<'_,'_,'_,'info,SwapRaydium<'info>>>{
            let mut cauldron_authority = self.cauldron_authority.to_account_info();
            cauldron_authority.is_signer = true;

            Ok(CpiContext::new(self.swapper_program.to_account_info(), SwapRaydium {
                source_token_account: self.cauldron_source_vault.to_account_info(),
                destination_token_account: self.cauldron_destination_vault.to_account_info(),
                token_program: self.token_program.to_account_info(),
                swap_program: self.swap_program.to_account_info(),
                authority: Signer::try_from(&cauldron_authority)?.to_account_info(),
            }))
    }
    // pub fn create_orca_swapper_ctx(&self) 
    //     -> Result<CpiContext<'_,'_,'_,'info,SwapOrca<'info>>>{
    //         let mut cauldron_authority = self.cauldron_authority.to_account_info();
    //         cauldron_authority.is_signer = true;

    //         Ok(CpiContext::new(self.swapper_program.to_account_info(),SwapOrca{
    //             source_token_account: self.cauldron_source_vault.to_account_info(),
    //             destination_token_account: self.cauldron_destination_vault.to_account_info(),
    //             swap_program: self.swap_program.to_account_info(),
    //             token_program: self.token_program.to_account_info(),
    //             token_swap: self.token_swap.to_account_info(),
    //             swap_authority: self.swap_authority.to_account_info(),
    //             pool_source: todo!(),
    //             pool_destination: todo!(),
    //             pool_token_mint: todo!(),
    //             pool_fee_account: todo!(),
    //             host_fee_account: todo!(),
    //             source_mint: todo!(),
    //             destination_mint: todo!(),
    //             cauldron_authority,
    //             authority: Signer::try_from(&cauldron_authority)?.to_account_info(),
    //         }))
            
    //     }
}

#[derive(Accounts)]
pub struct CompleteLiquidate<'info> {
    /// Liquidator account pda account.
    #[account(mut,
              seeds = [LIQUIDATOR_ACCOUNT_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       liquidator_account.origin_liquidator.as_ref()],
              bump,
              close = authority)]
    pub liquidator_account: Box<Account<'info, LiquidatorAccount>>,
    /// Cauldron MIM balance account on bentobox.
    #[account(mut)]
    pub cauldron_mim_bentobox_balance: Box<Account<'info, Balance>>,
    /// Authority MIM balance account on bentobox.
    #[account(mut)]
    pub authority_mim_bentobox_balance: Box<Account<'info, Balance>>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(mut, 
              seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// MIM mint account.
    #[account(constraint = cauldron_account.magic_internet_money == magic_internet_money_mint.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub magic_internet_money_mint: Box<Account<'info, Mint>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Strategy data account for MIM token.
    /// CHECK: inside bento-deposit.
    pub mim_strategy_data: UncheckedAccount<'info>,
    /// MiM total account which stores all Bentobox amount by token.
    #[account(mut)]
    pub bentobox_mim_total_data: AccountLoader<'info, BentoBoxTotal>,
    /// Cauldron token account for MIM.
    #[account(mut, 
              seeds = [TOTAL_VAULT_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref(),
                       magic_internet_money_mint.key().as_ref()],
        bump)]
    pub cauldron_mim_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox MIM token account.
    /// CHECK: inside bentobox deposit.
    #[account(mut)]
    pub bentobox_mim_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct Liquidate<'info> {
    /// Collateral total account which stores all Bentobox amount by token.
    #[account(mut)]
    pub bentobox_collateral_total_data: AccountLoader<'info, BentoBoxTotal>,
    /// MiM total account which stores all Bentobox amount by token.
    #[account(mut)]
    pub bentobox_mim_total_data: AccountLoader<'info, BentoBoxTotal>,
    /// Bentobox account.
    #[account(constraint = bentobox_account.key() == cauldron_account.bentobox @ ErrorCode::InvalidBentoboxAccount)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Bentobox program account.
    #[account(constraint = bentobox_program.key() == cauldron_account.bentobox_program @ ErrorCode::InvalidBentoboxProgramAccount)]
    pub bentobox_program: Program<'info, Bentobox>,
    /// Cauldron account.
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Cauldron authority account.
    /// CHECK: seeds.
    #[account(seeds = [CAULDRON_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()], 
              bump)]
    pub cauldron_authority: UncheckedAccount<'info>,
    /// Switchboard data feed account.
    /// CHECK: account owner.
    #[account(constraint = switchboard_data_feed.key() == cauldron_account.switchboard_data_feed @ ErrorCode::IncompatibleSwitchboardDataFeed)]
    // pub switchboard_data_feed: AccountLoader<'info,AggregatorAccountData>,
    pub switchboard_data_feed: UncheckedAccount<'info>,
    /// Cauldron pda total account.
    #[account(mut, 
              seeds = [TOTAL_SEED_PART.as_ref(),
                       cauldron_account.key().as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
      /// User balance pda account.
      #[account(mut, 
        seeds = [USER_BALANCE_SEED_PART.as_ref(),
                 cauldron_account.key().as_ref(),
                 user.as_ref()],
        bump)]
    pub user_balance: Box<Account<'info, UserBalance>>,
    /// Cauldron collateral balance account on bentobox.
    #[account(mut)]
    pub cauldron_collateral_bentobox_balance: Box<Account<'info, Balance>>,
    /// Authority collateral balance account on bentobox.
    #[account(mut)]
    pub authority_collateral_bentobox_balance: Box<Account<'info, Balance>>,
    /// Cauldron MIM balance account on bentobox.
    #[account(mut)]
    pub cauldron_mim_bentobox_balance: Box<Account<'info, Balance>>,
    /// Authority MIM balance account on bentobox.
    #[account(mut)]
    pub authority_mim_bentobox_balance: Box<Account<'info, Balance>>,
    /// Collateral mint account.
    #[account(constraint = collateral.key() == cauldron_account.collateral @ ErrorCode::InvalidCollateral)]
    pub collateral: Box<Account<'info, Mint>>,
    /// MIM mint account.
    #[account(constraint = cauldron_account.magic_internet_money == magic_internet_money_mint.key() @ ErrorCode::BentoBoxAccountOwnerDoesNotMatchProgram)]
    pub magic_internet_money_mint: Box<Account<'info, Mint>>,
    /// Approve account for bentobox
    pub master_contract_approved: Box<Account<'info, MasterContractApproved>>,
    /// Whitelisted account 
    pub master_contract_whitelisted: Box<Account<'info, MasterContractWhitelisted>>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateSwitchboardDataFeed<'info> {
    /// Cauldron account.
    #[account(mut, has_one = authority)]
    pub cauldron_account: Box<Account<'info, Cauldron>>,
    /// Switchboard data feed account.
    /// CHECK: account owner.
    pub switchboard_data_feed: UncheckedAccount<'info>, 
    #[account(mut)]
    pub authority: Signer<'info>
}