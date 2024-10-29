
use anchor_lang::prelude::*;



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
