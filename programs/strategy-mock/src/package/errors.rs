use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("After exit: accounts list for after exit is empty.")]
    EmptyAccountsListForAfterExit,
    #[msg("Error while casting AccountInfo to BaseStrategyInfo.")]
    WrongConvertionFromAccountInfoToBaseStrategyInfo,
}
