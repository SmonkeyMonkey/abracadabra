use anchor_lang::prelude::*;

#[event]
pub struct LogDeposit {
    pub token: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub share: u64,
}

#[event]
pub struct LogWithdraw {
    pub token: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub share: u64,
}

#[event]
pub struct LogTransfer {
    pub token: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub share: u64,
}

#[event]
pub struct ConversionData {
    pub data: u64,
}

#[event]
pub struct LogFlashLoan {
    pub borrower: Pubkey,
    pub token: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub receiver: Pubkey,
}

#[event]
pub struct LogStrategyQueued {
    pub token: Pubkey,
    pub new_strategy: Pubkey,

}

#[event]
pub struct LogStrategyTargetPercentage {
    pub token: Pubkey,
    pub target_percentage: u64,
}

#[event]
pub struct LogStrategyProfit {
    pub token: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LogStrategyLoss {
    pub token: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LogStrategyDivest {
    pub token: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LogStrategySet {
    pub token: Pubkey,
    pub new_strategy: Pubkey,
}

#[event]
pub struct LogStrategyInvest {
    pub token: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LogAuthorityChanged {
    pub authority: Pubkey,
    pub new_authority: Pubkey,
}
