use anchor_lang::prelude::*;

/// Errors that may be returned by the Bentobox program.
#[error_code]
pub enum ErrorCode {
    // deposit
    // 0
    #[msg("Cannot deposit current amount. Not enough funds.")]
    DepositAmountTooHigh,
    #[msg("Authority of deposit token account mismatch with signer.")]
    DepositTokenAccountInvalidAuthority,
    #[msg("BentoBox: No tokens.")]
    BentoBoxNoTokens,
    #[msg("BentoBox: Wrong token mint provided.")]
    BentoBoxWrongToken,

    // withdraw
    // 4
    #[msg("Cannot withdraw current amount. Not enough funds.")]
    WithdrawAmountToHigh,
    #[msg("Authority of withdraw token account mismatch with signer.")]
    WithdrawTokenAccountInvalidAuthority,
    #[msg("BentoBox: Cannot empty.")]
    WithdrawCannotEmpty,
    #[msg("Unauthorized withdraw.")]
    UnauthorizedWithdraw,

    //transfer
    // 9
    #[msg("BentoBox: Wrong amount.")]
    BentoBoxWrongAmount,
    #[msg("Cannot transfer current amount. Not enough funds.")]
    TransferAmountToHigh,
    #[msg("Cannot transfer due to empty receivers list.")]
    EmptyTransferReceiversList,
    #[msg("Cannot transfer because of missmatch between shares and receivers list.")]
    MismatchBetweenSharesAndReceivers,
    #[msg("Error while casting AccountInfo to Balance.")]
    WrongConvertionFromAccountInfoToBalance,

    //flash loan
    // 14
    #[msg("Source liquidity account amount is less than flash loan amount.")]
    InsufficientSourceLiquidity,
    #[msg("Flash loan fee receiver account amount is less than flash loan expected fee.")]
    InsufficientFlashLoanFeeReceiverFunds,
    #[msg("Error while casting AccountInfo to Reserve account.")]
    WrongConvertionFromAccountInfoToReserveAccount,
    #[msg("Invalid flash loan fee receiver account  for flash loan.")]
    FlashLoanInvalidFlashLoanFeeReceiverTokenAccount,

    // token account error
    // 18
    #[msg("Total account pubkey from total info mismatch with total token account.")]
    InvalidTotalTokenAccount,

    // set strategy error
    // 19
    #[msg("StrategyManager: Too early.")]
    TooEarlyStrategyStartData,

    // 20
    #[msg("BentoBox: Skim too much.")]
    DepositSkimTooMuch,
    #[msg("Provided account does not exist.")]
    EmptyAccount,
    #[msg("This signer cannot claim authority for BentoBox.")]
    InvalidClaimAuthority,
    #[msg("New authority has empty address.")]
    EmptyAuthorityAddress,
    #[msg("New authority is the same as current BentoBox authority.")]
    SameAuthority,
    #[msg("Unauthorized save harvest.")]
    UnauthorizedSaveHarvest,

    // Master Contracts
    // 26
    #[msg("Master Contract not whitelisted.")]
    MasterContractNotWhitelisted,
    #[msg("Master Contract not approved.")]
    MasterContractNotApproved,
    #[msg("Invalid Master Contract whitelisted account".)]
    MasterContractWhitelistedAccountInvalid,
    #[msg("Invalid Master Contract approved account.")]
    MasterContractApprovedAccountInvalid,
    #[msg("Master Contract account is not owned by Master Contract program.")]
    MasterContractAccountOwnerDoesNotMatchProgram,
    #[msg("Remaining accounts should contains 3 accounts for allowed checks.")]
    AllowedRemainingAccountsAreEmpty,

    // 32
    #[msg("Pending authority is empty.")]
    EmptyPendingAuthorityAddress,

    // safe harvest
    // 33
    #[msg("Unauthorized safe harvest.")]
    UnauthorizedSafeHarvest,
    #[msg("Active strategy is not set.")]
    StrategyNotSet,
    #[msg("Invalid strategy account.")]
    InvalidStrategyAccount,

    // 36
    #[msg("Invalid strategy target percentage.")]
    StrategyTargetPercentageTooHigh,

    #[msg("Cauldron sign mismatch.")]
    CauldronSignMismatch,

    #[msg("Invalid remaining accounts count.")]
    InvalidRemainingAccountsCount,

    #[msg("Invalid cauldron accounts.")]
    InvalidCauldronAccount,

    #[msg("BentoBox strategy is exited.")]
    StrategyIsExited,
}
