use anchor_lang::prelude::*;

/// Errors that may be returned by the Cauldron program.
#[error_code]
pub enum ErrorCode {
    // 0
    #[msg("Cauldron: user insolvent.")]
    UserInsolventError,
    #[msg("Cauldron: invalid collateral account.")]
    InvalidCollateral,
    #[msg("Switchboard account provided is not owned by the switchboard oracle program.")]
    InvalidSwitchboardProgram,
    #[msg("Switchboard oracle price is negative which is not allowed.")]
    InvalidSwitchboardPrice,
    #[msg("Switchboard data feed account is invalid.")]
    InvalidSwitchboardDataFeedAccount,
    #[msg("Switchboard data feed not of type aggregator.")]
    InvalidSwitchboardAccountType,
    #[msg("Switchboard data feed account version is incorrect.")]
    InvalidSwitchboardAccountVersion,
    #[msg("Switchboard oracle price is stale.")]
    StaleSwitchboardDataFeedResult,
    #[msg("Incompatible switchboard data feed account.")]
    IncompatibleSwitchboardDataFeed,

    // 9
    #[msg("Add collateral: Skim too much.")]
    SkimTooMuch,
    #[msg("Incorrect remaining accounts.")]
    IncorrectRemainingAccounts,
    #[msg("Invalid Bentobox account.")]
    InvalidBentoboxAccount,
    #[msg("Invalid Bentobox program account.")]
    InvalidBentoboxProgramAccount,
    #[msg("Invalid cauldron authority account.")]
    InvalidCauldronAuthority,
    #[msg("Cauldron: Borrow limit reached.")]
    BorrowLimitReached,
    #[msg("BentoBox account is not owned by BentoBox program.")]
    BentoBoxAccountOwnerDoesNotMatchProgram,
    #[msg("Total account pubkey from total info mismatch with total token account.")]
    InvalidBentoboxTotalTokenAccount,
    #[msg("Invalid Master Contract whitelisted account".)]
    MasterContractWhitelistedAccountInvalid,
    #[msg("Incompatible Master Contract whitelisted account.")]
    IncompatibleMasterContractWhitelistedAccount,
    #[msg("Incompatible token account owner and signer.")]
    IncompatibleTokenAccountOwner,

    #[msg("Interest rate increase > 75%".)]
    NotValidInterestRate,

    #[msg("Canot update interest rate, update only every 3 days".)]
    TooSoonToUpdateInterestRate,
    #[msg("Cauldron: invalid magic internet money account.")]
    InvalidMagicInternetMoneyAccount,

    #[msg("Bento transfer: invalid parameter 'from'.")]
    InvalidParameterFrom,
    #[msg("Cauldron: user is solvent")]
    UserIsSolvent,

    #[msg("Incorrect remaining accounts for swapper.")]
    IncorrectRemainingAccountsForSwapper,

    #[msg("Invalid swapper.")]
    InvalidSwapper,

    #[msg("Can not complete liquidation, only origin liquidator can do it before timestamp.")]
    TooSoon,

    #[msg("Invalid owner of cauldron source token account.")]
    InvalidCauldronSourceVault,

    #[msg("Invalid owner of cauldron destination token account.")]
    InvalidCauldronDestinationVault,

    
}
