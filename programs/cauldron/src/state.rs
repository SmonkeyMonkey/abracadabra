use anchor_lang::prelude::*;

use common::rebase::Rebase;

#[constant]
pub const CAULDRON_SEED_PART: &[u8] = b"cauldron";
#[constant]
pub const USER_BALANCE_SEED_PART: &[u8] = b"userbalance";
#[constant]
pub const TOTAL_SEED_PART: &[u8] = b"cauldrontotal";
#[constant]
pub const TOTAL_VAULT_SEED_PART: &[u8] = b"cauldrontotalvault";
#[constant]
pub const LIQUIDATOR_ACCOUNT_SEED_PART: &[u8] = b"liquidatoraccount";
#[constant]
pub const THREE_DAYS: u64 = 259200;

#[constant]
pub const ADD_COLLATERAL_REMAINING_ACCOUNTS_COUNT: usize = 6;

#[account]
#[derive(Default)]
pub struct Cauldron {
    /// Owner of Cauldron.
    pub authority: Pubkey,
    /// Switchboard oracle data feed.
    pub switchboard_data_feed: Pubkey,
    /// Settings data.
    pub constants: Constants,
    /// Borrow cap
    pub borrow_limit: BorrowCap,
    /// Bentobox public key.
    pub bentobox: Pubkey,
    /// Bentobox program public key.
    pub bentobox_program: Pubkey,
    /// Collateral.
    pub collateral: Pubkey,
    /// magic internet money mint.
    pub magic_internet_money: Pubkey,
    /// Accrue information
    pub accrue_info: AccrueInfo,
    /// Tracking of last interest update.
    pub last_interest_update: u64,
    /// Address which can withdraw fee from cauldron account
    pub fee_to: Pubkey,
}

impl Cauldron {
    pub const SIZE: usize = 8
        + 32
        + 32
        + Constants::SIZE
        + BorrowCap::SIZE
        + 32
        + 32
        + 32
        + 32
        + AccrueInfo::SIZE
        + 8
        + 32;
}

#[account]
#[derive(Default)]
pub struct UserBalance {
    /// The amount of collateral in shares.
    pub collateral_share: u64,
    /// The user borrow amount.
    pub borrow_part: u64,
}

impl UserBalance {
    pub const SIZE: usize = 8 + 8 + 8;
}
#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct BorrowCap {
    pub total: u64,
    pub borrow_part_per_address: u64,
}

impl BorrowCap {
    pub const SIZE: usize = 8 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct Constants {
    pub collaterization_rate: u64,
    pub collaterization_rate_precision: u64,
    pub liquidation_multiplier: u64,
    pub liquidation_multiplier_precision: u64,
    pub distribution_part: u64,
    pub distribution_precision: u64,
    pub borrow_opening_fee: u64,
    pub borrow_opening_fee_precision: u64,
    pub one_percent_rate: u64,
    /// The max difference between the time slots during update which the price can be called relevant.
    pub stale_after_slots_elapsed: u64,
    /// Duration in seconds for complete liquidation by liquidator who starts liquidate.
    pub complete_liquidation_duration: u64,
}

impl Constants {
    pub const SIZE: usize = 8 + 8 * 11;
}

#[zero_copy(unsafe)]
#[derive(Default)]
pub struct CauldronRebase {
    pub base: u128,
    pub elastic: u128,
}

impl From<Rebase> for CauldronRebase {
    fn from(rebase: Rebase) -> CauldronRebase {
        CauldronRebase {
            base: rebase.base,
            elastic: rebase.elastic,
        }
    }
}
impl From<CauldronRebase> for Rebase {
    fn from(cauldron_rebase: CauldronRebase) -> Rebase {
        Rebase {
            base: cauldron_rebase.base,
            elastic: cauldron_rebase.elastic,
        }
    }
}

#[account(zero_copy(unsafe))]
#[derive(Default)]
#[repr(packed)]
pub struct Total {
    /// Total collateral supplied.
    pub collateral_share: u64,
    /// elastic = Total token amount to be repayed by borrowers,
    /// base = Total parts of the debt held by borrowers.
    pub borrow: CauldronRebase,
}

impl Total {
    pub const SIZE: usize = 8 + 8 + Rebase::SIZE;
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct AccrueInfo {
    pub last_accrued: u64,
    pub fees_earned: u128,
    pub interest_per_second: u64,
}

impl AccrueInfo {
    pub const SIZE: usize = 8 //last_accrued
     + 16 //fees_earned
     + 8; //interest_per_second
}

#[account]
#[derive(Default)]
pub struct LiquidatorAccount {
    /// Liquidator public key.
    pub origin_liquidator: Pubkey,
    /// Collateral user amount from position for swap.
    pub collateral_share: u64,
    /// Liquidator`s amount (liquidation fee).
    pub borrow_amount: u64,
    /// Minimum amount which should returns to cauldron_account.
    pub borrow_share: u64,
    /// Amount of MIM which cauldron receive after swap.
    pub real_amount: u64,
    /// Time in seconds till liquidator can safety withdraw own liquidation fee, after this time enyone can withdraw this fee.
    pub timestamp: u64,
}

impl LiquidatorAccount {
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 8;
}
