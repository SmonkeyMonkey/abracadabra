### Flash loan
Everyone can send a transaction with instruction `flash_loan` to the bentobox program to do a flash loan.

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)
2. [Create total accounts](./02-create-total-accounts.md)

#### Arguments
1. amount - the amount of the tokens to receive.

#### Accounts
| Field  | Description |
| ------------- | ------------- |
| lending_program | The `lending program` account |
| source_liquidity | Source liquidity token account |
| destination_liquidity | Destination liquidity token account - same `mint` as source liquidity |
| reserve  | `Reserve` account.|
| flash_loan_fee_receiver | Flash loan fee receiver account |
| host_fee_receiver  | Bentobox token account |
| lending_market  | `Lending market` account. |
| derived_lending_market_authority | Derived lending market authority - PDA |
| flash_loan_receiver | |
| authority | Signer of `flash_loan` instruction |
| token_program | The address of `TokenProgram` |
| total_data | The already created `TotalData` account |
| bentobox_account | Already created `BentoboxAccount` |
| strategy_data | Already created account of `StrategyData` which stores base data for strategy |

