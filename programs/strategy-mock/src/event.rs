use anchor_lang::prelude::*;
#[event]
pub struct LogSetStrategyExecutor {
    pub executor: Pubkey,
    pub value: bool,
}
