use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Error convertion from AccountInfo to StrategyMock.")]
    WrongConvertionFromAccountInfoToStrategyMock,

    #[msg("Invalid base strategy info account.")]
    InvalidBaseStrategyInfoAccount,

    #[msg("BentoBox Strategy: not exited.")]
    StrategyNotExited,

    #[msg("BentoBox Strategy: invalid strategy vault token account.")]
    InvalidStrategyVaultAccount,

    #[msg("Unauthorized after_exit.")]
    UnauthorizedAfterExit,

    #[msg("Unauthorized set_strategy_executor.")]
    UnauthorizedSetStrategyExecutor,

    #[msg("Invalid remaining accounts.")]
    InvalidRemainingAccounts,

    #[msg("Invalid pool account.")]
    InvalidPoolAccount,

    #[msg("Invalid bentobox account.")]
    InvalidBentoBoxAccount,
}
