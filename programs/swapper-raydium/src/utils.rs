use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, program::invoke},
};

use swapper_package::swapper_interface::Swap;

use crate::error::ErrorCode as RaydiumErrorCode;
use crate::state::*;

const SWAP_REMAINING_ACCOUNTS_COUNT: usize = 14;

pub fn swap_raydium<'a, 'b, 'c, 'info>(
    ctx: &Context<'a, 'b, 'c, 'info, Swap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    let remaining_accounts = ctx.remaining_accounts;
    require!(
        remaining_accounts.len() >= SWAP_REMAINING_ACCOUNTS_COUNT,
        RaydiumErrorCode::NotEnoughRemainingAccounts
    );

    let amm = remaining_accounts[0].clone();
    let amm_authority = remaining_accounts[1].clone();
    let amm_open_orders = remaining_accounts[2].clone();
    let amm_target_orders = remaining_accounts[3].clone();
    let pool_coin_token_account = remaining_accounts[4].clone();
    let pool_pc_token_account = remaining_accounts[5].clone();
    let serum_program = remaining_accounts[6].clone();
    let serum_market = remaining_accounts[7].clone();
    let serum_bids = remaining_accounts[8].clone();
    let serum_asks = remaining_accounts[9].clone();
    let serum_event_queue = remaining_accounts[10].clone();
    let serum_coin_vault_account = remaining_accounts[11].clone();
    let serum_pc_vault_account = remaining_accounts[12].clone();
    let serum_vault_signer = remaining_accounts[13].clone();
    let source_token_account = ctx.accounts.source_token_account.to_account_info();
    let destination_token_account = ctx.accounts.destination_token_account.to_account_info();

    let ix = make_swap_base_in_instruction(
        ctx.accounts.swap_program.key,
        amm.key,
        amm_authority.key,
        amm_open_orders.key,
        amm_target_orders.key,
        pool_coin_token_account.key,
        pool_pc_token_account.key,
        serum_program.key,
        serum_market.key,
        serum_bids.key,
        serum_asks.key,
        serum_event_queue.key,
        serum_coin_vault_account.key,
        serum_pc_vault_account.key,
        serum_vault_signer.key,
        source_token_account.key,
        destination_token_account.key,
        ctx.accounts.authority.key,
        ctx.accounts.token_program.key,
        amount_in,
        minimum_amount_out,
    )?;

    invoke(
        &ix,
        &vec![
            ctx.accounts.token_program.to_account_info(),
            amm,
            amm_authority,
            amm_open_orders,
            amm_target_orders,
            pool_coin_token_account,
            pool_pc_token_account,
            serum_program,
            serum_market,
            serum_bids,
            serum_asks,
            serum_event_queue,
            serum_coin_vault_account,
            serum_pc_vault_account,
            serum_vault_signer,
            source_token_account,
            destination_token_account,
            ctx.accounts.authority.to_account_info(),
        ],
    )?;
    Ok(())
}
    
/// Creates a 'swap base in' instruction.
fn make_swap_base_in_instruction(
    program_id: &Pubkey,
    amm_id: &Pubkey,
    amm_authority: &Pubkey,
    amm_open_orders: &Pubkey,
    amm_target_orders: &Pubkey,
    pool_coin_token_account: &Pubkey,
    pool_pc_token_account: &Pubkey,
    serum_program_id: &Pubkey,
    serum_market: &Pubkey,
    serum_bids: &Pubkey,
    serum_asks: &Pubkey,
    serum_event_queue: &Pubkey,
    serum_coin_vault_account: &Pubkey,
    serum_pc_vault_account: &Pubkey,
    serum_vault_signer: &Pubkey,
    uer_source_token_account: &Pubkey,
    uer_destination_token_account: &Pubkey,
    user_source_owner: &Pubkey,
    spl_token_program: &Pubkey,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<Instruction> {
    let data = AmmInstruction::SwapBaseIn(SwapInstructionBaseIn {
        amount_in,
        minimum_amount_out,
    })
    .pack()?;

    let accounts = vec![
        // spl token
        AccountMeta::new_readonly(*spl_token_program, false),
        // amm
        AccountMeta::new(*amm_id, false),
        AccountMeta::new_readonly(*amm_authority, false),
        AccountMeta::new(*amm_open_orders, false),
        AccountMeta::new(*amm_target_orders, false),
        AccountMeta::new(*pool_coin_token_account, false),
        AccountMeta::new(*pool_pc_token_account, false),
        // serum
        AccountMeta::new_readonly(*serum_program_id, false),
        AccountMeta::new(*serum_market, false),
        AccountMeta::new(*serum_bids, false),
        AccountMeta::new(*serum_asks, false),
        AccountMeta::new(*serum_event_queue, false),
        AccountMeta::new(*serum_coin_vault_account, false),
        AccountMeta::new(*serum_pc_vault_account, false),
        AccountMeta::new_readonly(*serum_vault_signer, false),
        // user
        AccountMeta::new(*uer_source_token_account, false),
        AccountMeta::new(*uer_destination_token_account, false),
        AccountMeta::new(*user_source_owner, true),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}
