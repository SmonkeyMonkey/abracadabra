use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    // 0
    // accounts errors
    #[msg("Incompatible token accounts.")]
    IncompatibleTokenAccounts,
    #[msg("Invalid authority of strategy token account.")]
    StrategyVaultInvalidAuthority,
    #[msg("Invalid authority of bentobox token account.")]
    BentoboxVaultInvalidAuthority,
    #[msg("Invalid account owner. Expect strategy program as owner.")]
    InvalidAccountOwnerStrategyProgram,
    #[msg("Invalid account owner. Expect bentobox program as owner.")]
    InvalidAccountOwnerBentoboxProgram,
    #[msg("Remaining accounts are empty. Expected some.")]
    EmptyRemainingAccounts,

    // math
    // 6
    #[msg("Overflow occurred when making integer addition.")]
    WrongIntegerAddition,
    #[msg("Overflow occurred when making integer subtraction.")]
    WrongIntegerSubtraction,
    #[msg("Overflow occurred when making integer multiplication.")]
    WrongIntegerMultiplication,
    #[msg("Overflow occurred when making integer division.")]
    WrongIntegerDivision,

    #[msg("Conversion to u64 failed with an overflow or underflow")]
    TryIntoConversionError,
    #[msg("Conversion to u128/u64 failed with an overflow or underflow")]
    BnConversionError,

    #[msg("Wrong convertion from AccountInfo To TokenAccount.")]
    WrongConvertionFromAccountInfoToTokenAccount,

    #[msg("Invalid account owner. Expect cauldron program as owner.")]
    InvalidAccountOwnerCauldronProgram,

    #[msg("Invalid token account owner.")]
    InvalidTokenAccountOwner,
}
