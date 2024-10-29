use anchor_lang::prelude::*;

#[event]
pub struct LogAccrue {
    pub extra_amount: u128,
}

#[event]
pub struct LogSwitchboardPrice {
    pub mantissa: i128,
    pub scale: u32,
}

#[event]
pub struct LogRepay {
    pub from: Pubkey,
    pub to: Pubkey,
    pub part: u64,
}

#[event]
pub struct LogAddCollateral {
    pub from: Pubkey,
    pub to: Pubkey,
    pub share: u64,
}

#[event]
pub struct LogRemoveCollateral {
    pub to: Pubkey,
    pub share: u64,
}

#[event]
pub struct LogInterestChange {
    pub old_interest_rate: u64,
    pub new_interest_rate: u64,
}

#[event]
pub struct LogFeeTo {
    pub new_fee_to: Pubkey,
}

#[event]
pub struct LogWithdrawFees {
    pub fee_to: Pubkey,
    pub fees_earned_fraction: u128,
}
#[event]
pub struct LogChangeBorrowLimit {
    pub new_borrow_limit: u64,
    pub per_address_part: u64,
}
#[event]
pub struct LogReduceSuply {
    pub reduce_amount: u64,
    pub amount_left: u64,
}
