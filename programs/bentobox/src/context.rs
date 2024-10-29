use crate::{error::ErrorCode, state::*, utils::SPLFlashLoan};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, SetAuthority, Token, TokenAccount, Transfer};
use spl_token_lending::{math::Decimal, state::Reserve};

use crate::state::{BaseExit, BaseSafeHarvest};

use common::utils::calculate_end_byte_to_serialize;
use common::constants::{DISCRIMINATOR_BYTES, STRATEGY_VAULT_SEED_PART};
use common::errors::ErrorCode as CommonErrorCode;
#[derive(Accounts)]
pub struct Conversion<'info> {
    /// Total bentobox account for token.
    #[account(  
        seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                 bentobox_account.key().as_ref(),
                 mint.key().as_ref()],
        bump, 
        constraint = total_data.load()?.mint_address == mint.key() @ ErrorCode::BentoBoxWrongToken)]
    pub total_data: AccountLoader<'info, Total>,
    /// Token mint account for token.
    pub mint: Box<Account<'info, Mint>>,
    pub bentobox_account: Box<Account<'info, BentoBox>>,
}

#[derive(Accounts)]
pub struct CreateBentoBox<'info> {
    /// Bentobox account.
    #[account(init, payer = authority, space = BentoBox::SIZE)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Account for authority of newly created Bentobox account.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetStrategyDelay<'info> {
    /// Bentobox account.
    #[account(mut, has_one = authority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// BentoBox authority account.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new_authority: Pubkey)]
pub struct TransferAuthority<'info> {
    /// Bentobox account.
    #[account(mut, has_one = authority,
             constraint = new_authority != bentobox_account.authority @ ErrorCode::SameAuthority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// BentoBox authority account.
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimAuthority<'info> {
    /// Bentobox account.
    #[account(mut, constraint = bentobox_account.pending_authority.ok_or(ErrorCode::EmptyPendingAuthorityAddress)? == authority.key() @ ErrorCode::InvalidClaimAuthority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// BentoBox authority account.
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterMasterContract<'info>  {
    /// Master Contract PDA account to store whitelised information.
    #[account(init,
              seeds = [WHITELISTED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref()],
              bump,
              payer = authority,
              space = MasterContractWhitelisted::SIZE)]
    pub master_contract_whitelisted: Box<Account<'info, MasterContractWhitelisted>>,
    /// Bentobox account.
    #[account(has_one = authority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// CHECK: If this account is master contract executable
    #[account(executable)]
    pub master_contract_program: UncheckedAccount<'info>,
    /// CHECK: If this account belongs to master contract executable
    #[account(rent_exempt = enforce,
              constraint = master_contract_account.owner == &master_contract_program.key() @ ErrorCode::MasterContractAccountOwnerDoesNotMatchProgram)]
    pub master_contract_account: UncheckedAccount<'info>,
    /// BentoBox authority account.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WhitelistMasterContract<'info> {
    /// Master Contract PDA account that store whitelised information.
    #[account(mut,
              seeds = [WHITELISTED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref()],
              bump)]
    pub master_contract_whitelisted: Box<Account<'info, MasterContractWhitelisted>>,
    /// CHECK: If this account is master contract executable
    #[account(executable)]
    pub master_contract_program: UncheckedAccount<'info>,
    /// CHECK: If this account belongs to master contract executable
    #[account(rent_exempt = enforce,
              constraint = master_contract_account.owner == &master_contract_program.key() @ ErrorCode::MasterContractAccountOwnerDoesNotMatchProgram)]
    pub master_contract_account: UncheckedAccount<'info>,
    /// BentoBox authority account.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Bentobox account.
    #[account(has_one = authority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
}

#[derive(Accounts)]
pub struct CreateApproveMasterContract<'info> {
    /// Master Contract PDA account to store user approval information.
    #[account(init,
              seeds = [APPROVED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref(),
                       authority.key().as_ref()],
              bump,
              payer = payer,
              space = MasterContractApproved::SIZE)]
    pub master_contract_approved: Box<Account<'info, MasterContractApproved>>,
    /// Master Contract PDA account that store whitelised information.
    #[account(seeds = [WHITELISTED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref()],
              bump,
              constraint = master_contract_whitelisted.whitelisted == true @ ErrorCode::MasterContractNotWhitelisted)]
    pub master_contract_whitelisted: Box<Account<'info, MasterContractWhitelisted>>,
    /// CHECK: If this account is master contract executable
    #[account(executable)]
    pub master_contract_program: UncheckedAccount<'info>,
    /// CHECK: If this account belongs to master contract executable
    #[account(rent_exempt = enforce,
              constraint = master_contract_account.owner == &master_contract_program.key() @ ErrorCode::MasterContractAccountOwnerDoesNotMatchProgram)]
    pub master_contract_account: UncheckedAccount<'info>,
    /// CHECK: User that approves master contract
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
}

#[derive(Accounts)]
pub struct CreateBentoboxAuthorityMasterContract<'info> {
    /// Master Contract PDA account to store user approval information.
    #[account(init,
        seeds = [APPROVED_MASTER_CONTRACT_PART.as_ref(),
                 bentobox_account.key().as_ref(),
                 master_contract_account.key().as_ref(),
                 bentobox_authority.key().as_ref()],
        bump,
        payer = authority,
        space = MasterContractApproved::SIZE)]
    pub master_contract_approved: Box<Account<'info, MasterContractApproved>>,
    /// Master Contract PDA account that store whitelised information.
    #[account(seeds = [WHITELISTED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref()],
              bump,
              constraint = master_contract_whitelisted.whitelisted == true @ ErrorCode::MasterContractNotWhitelisted)]
    pub master_contract_whitelisted: Box<Account<'info, MasterContractWhitelisted>>,
    /// CHECK: account checked in CPI
    pub master_contract_program: UncheckedAccount<'info>,
    /// CHECK: account checked in CPI
    pub master_contract_account: UncheckedAccount<'info>,
    /// Bentobox token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut, seeds = [BENTOBOX_SEED_PART, bentobox_account.key().as_ref()], bump)]
    pub bentobox_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
}

#[derive(Accounts)]
pub struct ApproveMasterContract<'info> {
    /// Master Contract PDA account to store user approval information.
    #[account(mut,
              seeds = [APPROVED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref(),
                       authority.key().as_ref()],
              bump)]
    pub master_contract_approved: Box<Account<'info, MasterContractApproved>>,
    /// Master Contract PDA account that store whitelised information.
    #[account(seeds = [WHITELISTED_MASTER_CONTRACT_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       master_contract_account.key().as_ref()],
              bump,
              constraint = master_contract_whitelisted.whitelisted == true @ ErrorCode::MasterContractNotWhitelisted)]
    pub master_contract_whitelisted: Box<Account<'info, MasterContractWhitelisted>>,
    /// CHECK: If this account is master contract executable
    #[account(executable)]
    pub master_contract_program: UncheckedAccount<'info>,
    /// CHECK: If this account belongs to master contract executable
    #[account(rent_exempt = enforce,
              constraint = master_contract_account.owner == &master_contract_program.key() @ ErrorCode::MasterContractAccountOwnerDoesNotMatchProgram)]
    pub master_contract_account: UncheckedAccount<'info>,
    /// CHECK: User that approves master contract
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    /// Bentobox pda total account by token. 
    #[account(init,
              seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                      bentobox_account.key().as_ref(),
                      mint.key().as_ref()],
              bump,
              payer = authority,
              space = Total::SIZE)]
    pub total_data: AccountLoader<'info, Total>,
     /// Bentobox token account.
    #[account(init,
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       mint.key().as_ref()],
              bump,
              payer = authority,
              token::mint = mint,
              token::authority = authority,)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Token mint account.
    pub mint: Box<Account<'info, Mint>>,
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Sysvar rent account, is required to be rent-exempt.
    pub rent: Sysvar<'info, Rent>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
}

impl <'info> CreateVault<'info> {
    /// Helper function to create `SetAuthority` cpi context.
    pub fn create_change_authority_context(
        &self,
    ) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.bentobox_vault.to_account_info(),
            current_authority: self.authority.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}

#[derive(Accounts)]
#[instruction(to: Pubkey)]
pub struct CreateBalance<'info> {
    /// Balance account.
    #[account(init,
        seeds = [BALANCE_SEED_PART.as_ref(),
                 bentobox_account.key().as_ref(),
                 mint.key().as_ref(),
                 to.as_ref()],
        bump,
        payer = authority,
        space = Balance::SIZE)]
    pub balance: Box<Account<'info, Balance>>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,  
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Mint token account.
    pub mint: Box<Account<'info, Mint>>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(to: Pubkey, amount: u64, share: u64)]
pub struct Deposit<'info> {
    /// Token account which pull the tokens, should be owned by depositer.
    #[account(mut, constraint = from.amount >= amount @ ErrorCode::DepositAmountTooHigh)]
    pub from: Account<'info, TokenAccount>,
    /// Bentobox token account.
    #[account(mut, 
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              constraint = from.mint == bentobox_vault.mint && bentobox_vault.mint == mint.key() @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub bentobox_vault: Account<'info, TokenAccount>,
    #[account(mut,
              seeds = [BALANCE_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref(),
                       to.as_ref()],
              bump)]
    /// Balance account which holds balance on 'to' account. 
    pub balance: Box<Account<'info, Balance>>,
    /// Total account which stores all Bentobox amount by token.
    #[account(mut, 
             seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                     bentobox_account.key().as_ref(),
                     bentobox_vault.mint.as_ref()],
             bump, 
             constraint = total_data.load()?.token_account == bentobox_vault.key() @ ErrorCode::InvalidTotalTokenAccount)]
    pub total_data: AccountLoader<'info, Total>,
    /// User / contract account which want to push tokens.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    #[account(
        seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump)]
    /// Strategy data account which stores base data for strategy.     
    pub strategy_data: Box<Account<'info, StrategyData>>,
    /// Mint token account.
    pub mint: Box<Account<'info, Mint>>,
    // > Only needed if authority is master contract
    // master_contract_whitelisted
    // > Only needed if authority is master contract
    // master_contract_approved
    // > Only needed if authority is master contract
    // master_contract_account
}

impl<'info> Deposit<'info> {
    /// Helper function to create `Transfer` cpi context.
    pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from.to_account_info(),
            to: self.bentobox_vault.to_account_info(),
            authority: self.authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
 
#[derive(Accounts)]
#[instruction(from: Pubkey, amount: u64, share: u64)]
pub struct Withdraw<'info> {
    /// Bentobox token account.
    #[account(mut,  
             seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                     bentobox_account.key().as_ref(),
                     bentobox_vault.mint.as_ref()],
             bump,
             constraint = bentobox_vault.amount >= amount @ ErrorCode::WithdrawAmountToHigh,
             constraint = bentobox_vault.owner == vault_authority.key() @ ErrorCode::WithdrawTokenAccountInvalidAuthority,
             constraint = bentobox_vault.mint == to.mint  @ CommonErrorCode::IncompatibleTokenAccounts,
             constraint = total_data.load()?.token_account == bentobox_vault.key() @ ErrorCode::InvalidTotalTokenAccount)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Token account where withdrawer pushes the tokens
    #[account(mut)]
    pub to: Box<Account<'info, TokenAccount>>,
    #[account(mut, 
              seeds = [BALANCE_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref(),
                       from.as_ref(),], 
              bump)]
    /// Balance account which holds balance on 'from' account. 
    pub balance: Box<Account<'info, Balance>>,
    #[account(mut, 
             seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                      bentobox_account.key().as_ref(),
                      bentobox_vault.mint.as_ref()],
             bump,)]
    /// Total account which stores all Bentobox amount by token.
    pub total_data: AccountLoader<'info, Total>,
    /// User / contract account which want to withdraw tokens.
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Bentobox token authority account.
    /// CHECK: on Bentobox ownership.
    #[account(seeds = [BENTOBOX_SEED_PART, bentobox_account.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    // > Only needed if authority is master contract
    // master_contract_whitelisted
    // > Only needed if authority is master contract
    // master_contract_approved
    // > Only needed if authority is master contract
    // master_contract_account
}

impl<'info> Withdraw<'info> {
    /// Helper function to create `Transfer` cpi context.
    pub fn create_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.bentobox_vault.to_account_info(),
            to: self.to.to_account_info(),
            authority: self.vault_authority.to_account_info(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[derive(Accounts)]
#[instruction(from: Pubkey, to: Pubkey, share: u64)]
pub struct TransferInternal<'info> {
    /// Balance account which holds balance on `from_key` account. 
    #[account(mut,
              seeds = [BALANCE_SEED_PART.as_ref(),
                      bentobox_account.key().as_ref(),
                      mint.key().as_ref(),
                      from.as_ref(),], 
              bump,
              constraint = balance_from.amount >= share @ ErrorCode::TransferAmountToHigh, )]
    pub balance_from: Box<Account<'info, Balance>>,
    /// Balance account which holds balance on `to_key` account. 
    #[account(mut, 
              seeds = [BALANCE_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       mint.key().as_ref(),
                       to.as_ref(),], 
              bump)]
    pub balance_to: Box<Account<'info, Balance>>,
    pub authority: Signer<'info>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Mint account for token.
    pub mint: Box<Account<'info, Mint>>,
    // > Only needed if authority is master contract
    // master_contract_whitelisted
    // > Only needed if authority is master contract
    // master_contract_approved
    // > Only needed if authority is master contract
    // master_contract_account
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct FlashLoan<'info> {
    /// Lending program account.
    /// CHECK: inside token lending.
    pub lending_program: UncheckedAccount<'info>,
    /// Source liquidity token account.
    #[account(mut, constraint = source_liquidity.amount >= amount  @ ErrorCode::InsufficientSourceLiquidity)]
    pub source_liquidity: Box<Account<'info, TokenAccount>>,
    /// Destination liquidity token account - same mint as source liquidity.
    #[account(mut,
        constraint = source_liquidity.mint == destination_liquidity.mint  @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub destination_liquidity: Box<Account<'info, TokenAccount>>,
    /// Reserve account.
    /// CHECK: inside token lending.
    #[account(mut)]
    pub reserve: UncheckedAccount<'info>,
    /// Flash loan fee receiver account.
    #[account(mut, 
        constraint = source_liquidity.mint == flash_loan_fee_receiver.mint  @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub flash_loan_fee_receiver: Box<Account<'info, TokenAccount>>,
    /// Host fee receiver. (Bentobox vault).
    #[account(mut, 
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       host_fee_receiver.mint.as_ref()],
              bump,
              constraint = source_liquidity.mint == host_fee_receiver.mint @ CommonErrorCode::IncompatibleTokenAccounts)]
    pub host_fee_receiver: Box<Account<'info, TokenAccount>>,
    /// Lending market account.
    /// CHECK: inside token lending.
    pub lending_market: UncheckedAccount<'info>,
    /// Derived lending market authority - PDA.
    /// CHECK: inside token lending.
    pub derived_lending_market_authority: UncheckedAccount<'info>,
    // Flash loan program receiver ID.
    /// CHECK: inside token lending.
    pub flash_loan_receiver: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: inside token lending.
    pub token_program: UncheckedAccount<'info>,
    #[account(mut, 
              seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       host_fee_receiver.mint.as_ref()],
              bump,
              constraint = total_data.load()?.token_account == host_fee_receiver.key() @ ErrorCode::InvalidTotalTokenAccount)]
    pub total_data: AccountLoader<'info, Total>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Strategy data account which stores base data for strategy.  
    #[account(seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       host_fee_receiver.mint.as_ref()],
              bump,)]
    pub strategy_data: Box<Account<'info, StrategyData>>,
}

impl<'a, 'b, 'c, 'info> FlashLoan<'info> {
    /// Helper function to create `FlashLoan` cpi context.
    pub fn create_flash_loan_cpi(&self, signer: &'a [&'b [&'c [u8]]]) -> CpiContext<'a, 'b, 'c, 'info, SPLFlashLoan<'info>>
    {
        CpiContext::new_with_signer(
            self.lending_program.to_account_info(),
            SPLFlashLoan { 
                    lending_program: self.lending_program.to_account_info(),
                    source_liquidity: self.source_liquidity.to_account_info(),
                    destination_liquidity: self.destination_liquidity.to_account_info(),
                    reserve: self.reserve.to_account_info(),
                    flash_loan_fee_receiver: self.flash_loan_fee_receiver.to_account_info(),
                    host_fee_receiver: self.host_fee_receiver.to_account_info(),
                    lending_market: self.lending_market.to_account_info(),
                    derived_lending_market_authority: self.derived_lending_market_authority.to_account_info(),
                    token_program_id: self.token_program.to_account_info(),
                    flash_loan_receiver: self.flash_loan_receiver.to_account_info(),
                    transfer_authority: self.authority.to_account_info(),
                },
            signer,
        )
    }
    /// Calculates flash loan fee for flash loan instruction.
    pub fn flash_loan_fee(reserve: &Reserve, amount: u64) -> Result<(u64, u64)> {
        let flash_loan_amount = if amount == u64::MAX {
            reserve.liquidity.available_amount
        } else {
            amount
        };
        Ok(reserve
            .config
            .fees
            .calculate_flash_loan_fees(Decimal::from(flash_loan_amount))?)
    }
}

#[derive(Accounts)]
pub struct CreateStrategyData<'info> {
    /// Strategy data account for token.
    #[account(init,
              seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       mint.key().as_ref()],
              bump,
              payer = authority,
              space = StrategyData::SIZE)]
    pub strategy_data: Box<Account<'info, StrategyData>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Mint accoount for token.
    pub mint: Box<Account<'info, Mint>>,
    /// Bentobox account.
    #[account(has_one = authority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetStrategyTargetPercentage<'info> {
    // Strategy data account for token.
    #[account(mut, 
              seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
              bentobox_account.key().as_ref(),
              mint.key().as_ref()],
              bump,)]
    pub strategy_data: Box<Account<'info, StrategyData>>,
    /// Bentobox account.
    #[account(has_one = authority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Mint token account.
    pub mint: Box<Account<'info, Mint>>,
    /// Bentobox authority account.
    #[account(mut)]
    pub authority: Signer<'info>,
} 

#[derive(Accounts)]
pub struct SetStrategy<'info> {
    /// Strategy program account.
    /// CHECK: account checked in CPI.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: account checked in CPI.
    pub bentobox_program: UncheckedAccount<'info>,
    #[account(has_one = authority)]
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// CHECK: account checked in CPI.
    #[account(rent_exempt = enforce, 
              constraint = strategy_account.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy data account which stores base data for strategy.  
    #[account(mut, 
              seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,)]
    pub strategy_data: Box<Account<'info, StrategyData>>,
    /// Bentobox token account.
    #[account(mut, 
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                      bentobox_account.key().as_ref(),
                      bentobox_vault.mint.as_ref()],
              bump,
              constraint = bentobox_vault.owner == bentobox_authority.key() @ CommonErrorCode::BentoboxVaultInvalidAuthority,
              constraint = total_data.load()?.token_account == bentobox_vault.key() @ ErrorCode::InvalidTotalTokenAccount)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Strategy token account.
    #[account(mut)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Total account which stores all Bentobox amount by token.
    #[account(mut, 
              seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Bentobox token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub bentobox_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
}

impl<'info> SetStrategy<'info> {
    /// Helper function to create `BaseExit` accounts.
    pub fn create_base_exit_accounts(&self) -> Result<BaseExit<'info>> {
        let mut bentobox_authority = self.bentobox_authority.to_account_info();
        bentobox_authority.is_signer = true;
        
        Ok(BaseExit {
            strategy_program: self.strategy_program.clone(),
            bentobox_program: self.bentobox_program.clone(),
            bentobox_account: UncheckedAccount::try_from(
                self.bentobox_account.to_account_info(),
            ),
            bentobox_vault: self.bentobox_vault.clone(),
            strategy_vault: self.strategy_vault.clone(),
            token_program: self.token_program.clone(),
            base_strategy_info: self.base_strategy_info.clone(), 
            authority: Signer::try_from(&bentobox_authority)?,
            strategy_account: self.strategy_account.clone(),
            strategy_authority: self.strategy_authority.clone(),
        })
    }
}
 
#[derive(Accounts)]
pub struct Harvest<'info> {
    /// Strategy program account.
    /// CHECK: account checked in CPI.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: account checked in CPI.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Strategy account.
    /// CHECK: strategy should be set and active.
    #[account(mut, 
              constraint = strategy_data.active_strategy != Pubkey::default() @ ErrorCode::StrategyNotSet,
              constraint = strategy_data.active_strategy == strategy_account.key() @ ErrorCode::InvalidStrategyAccount)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Total account which stores all Bentobox amount by token.
    #[account(mut, 
              seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
    /// Bentobox token account.
    #[account(mut, 
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              constraint = bentobox_vault.owner == bentobox_authority.key() @ CommonErrorCode::BentoboxVaultInvalidAuthority,
              constraint = total_data.load()?.token_account == bentobox_vault.key() @ ErrorCode::InvalidTotalTokenAccount)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Account for storing result from strategy harvest implementation. 
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub cpi_result_account: UncheckedAccount<'info>,
    /// Strategy data account which stores base data for strategy.  
    #[account(mut, 
              seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,)]
    pub strategy_data: Box<Account<'info, StrategyData>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Bentobox token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut, seeds = [BENTOBOX_SEED_PART, bentobox_account.key().as_ref()], bump)]
    pub bentobox_authority: UncheckedAccount<'info>,
    /// Strategy token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Account which holds all base info for strategy.
    /// CHECK: account checked in CPI.
    pub base_strategy_info: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SafeHarvest<'info> {
    /// Strategy account.
    /// CHECK: strategy should be set and active.
    #[account(mut,
              constraint = strategy_data.active_strategy != Pubkey::default() @ ErrorCode::StrategyNotSet,
              constraint = strategy_data.active_strategy == strategy_account.key() @ ErrorCode::InvalidStrategyAccount)]
    pub strategy_account: UncheckedAccount<'info>,
    /// Account which holds all base info for strategy.
    /// CHECK: executors.
    #[account(mut, 
              rent_exempt = enforce,
              constraint = base_strategy_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)]
    pub base_strategy_info: UncheckedAccount<'info>,
    /// Strategy program account.
    /// CHECK: account checked in CPI.
    pub strategy_program: UncheckedAccount<'info>,
    /// Bentobox program account.
    /// CHECK: account checked in CPI.
    pub bentobox_program: UncheckedAccount<'info>,
    /// Strategy token account.
    #[account(mut,
              seeds = [STRATEGY_VAULT_SEED_PART.as_ref(),
                       strategy_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              seeds::program = strategy_program.key(),
              constraint = strategy_vault.owner == strategy_authority.key() @ CommonErrorCode::StrategyVaultInvalidAuthority,)]
    pub strategy_vault: Box<Account<'info, TokenAccount>>,
    /// Total account which stores all Bentobox amount by token.
    #[account(mut, 
              seeds = [TOTAL_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,)]
    pub total_data: AccountLoader<'info, Total>,
    /// Bentobox token account.
    #[account(mut,
              seeds = [TOTAL_VAULT_KEY_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,
              constraint = bentobox_vault.owner == bentobox_authority.key() @ CommonErrorCode::BentoboxVaultInvalidAuthority,
              constraint = total_data.load()?.token_account == bentobox_vault.key() @ ErrorCode::InvalidTotalTokenAccount)]
    pub bentobox_vault: Box<Account<'info, TokenAccount>>,
    /// Bentobox account.
    pub bentobox_account: Box<Account<'info, BentoBox>>,
    /// Account for storing result from strategy harvest implementation. 
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub cpi_result_account: UncheckedAccount<'info>,
    /// Strategy data account which stores base data for strategy.  
    #[account(mut, 
              seeds = [STRATEGY_DATA_SEED_PART.as_ref(),
                       bentobox_account.key().as_ref(),
                       bentobox_vault.mint.as_ref()],
              bump,)]
    pub strategy_data: Box<Account<'info, StrategyData>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// Bentobox token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut, seeds = [BENTOBOX_SEED_PART, bentobox_account.key().as_ref()], bump)]
    pub bentobox_authority: UncheckedAccount<'info>,
    /// Strategy token authority pda account.
    /// CHECK: account checked in CPI.
    #[account(mut)]
    pub strategy_authority: UncheckedAccount<'info>,
    /// System program account.
    pub system_program: Program<'info, System>,
    /// Token program account.
    pub token_program: Program<'info, Token>,
    /// Executor info account.
    /// CHECK: if executor_info belongs to authority and allowed.
    #[account(rent_exempt = enforce,
              constraint = executor_info.owner == &strategy_program.key() @ CommonErrorCode::InvalidAccountOwnerStrategyProgram)] 
    pub executor_info: UncheckedAccount<'info>,
}

impl<'info> SafeHarvest<'info> {
    /// Helper function to check if authority is one of allowed executors. 
    pub fn only_executors(ctx: &Context<SafeHarvest>) -> Result<()> {
            let data: &[u8] = &ctx.accounts.executor_info.try_borrow_data()?;
            let mut executor_info_bytes = &data[DISCRIMINATOR_BYTES..calculate_end_byte_to_serialize(ExecutorInfo::SIZE, false)];
            let executor_info_decoded = ExecutorInfo::deserialize(& mut executor_info_bytes)?;
            if executor_info_decoded.user == ctx.accounts.authority.key() && executor_info_decoded.is_executor {
                return Ok(())
            }
        return Err(error!(ErrorCode::UnauthorizedSafeHarvest))
    }

    /// Helper function to create `BaseSafeHarvest` accounts.
    pub fn create_base_safe_harvest_accounts(&self) -> Result<BaseSafeHarvest<'info>> {
        let mut bentobox_authority = self.bentobox_authority.to_account_info();
        bentobox_authority.is_signer = true;
        
        Ok(BaseSafeHarvest {
            strategy_program: self.strategy_program.clone(),
            bentobox_program: self.bentobox_program.clone(),
            bentobox_account: UncheckedAccount::try_from(
                self.bentobox_account.to_account_info(),
            ),
            base_strategy_info: self.base_strategy_info.clone(),
            strategy_account: self.strategy_account.clone(),
            strategy_vault: self.strategy_vault.clone(),
            authority: Signer::try_from(&bentobox_authority)?,
            strategy_authority: self.strategy_authority.clone(),
        })
    }
}


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ExecutorInfo {
    /// Indicates if user/contract is executor and can call safe harvest instruction.
    /// Is `true` if user/contract is executor.
    pub is_executor: bool,
    pub user: Pubkey,
}

impl ExecutorInfo {
    pub const SIZE: usize = 1 + 32;
}
