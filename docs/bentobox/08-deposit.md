### Deposit

Everyone wallet can send a transaction with instruction `deposit` to the bentobox program to send tokens on Bentobox. If signer is master contract you need to create and provide some extra accounts which describes below.

![Deposit](../bentobox/images/Deposit.png)

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)
2. [Create total accounts](./02-create-total-accounts.md)
3. [Create balance](./03-create-balance-account.md)
4. [Create strategy data](./12-set-strategy.md#Create%20strategy%20data%20account)

If signer is master contract (PDA) it **MUST** be whitelisted and user **MUST** approve this master contract.

1. [Bentobox whitelist](./05-bentobox-whitelist.md#Create520master%20contract%20whitelisted%20account)
2. [Approve master contract](./06-approve-master-contract.md#Create%20master%20contract%20approval%20account)

To deposit tokens on Bentobox we need the following arguments and accounts.

#### Arguments
1. to: Pubkey - which account to push the tokens.
2. amount: u64 - token amount in native representation to deposit.
3. share: u64 - token amount represented in shares to deposit. Takes precedence over `amount`.
   
#### Accounts

| Field  | Description |
| ------------- | ------------- |
| from  | Token account which pull the tokens, should be owned by depositer |
| bentobox_vault  | Bentobox token account |
| balance  | The account of `Balance` which pull tokens |
| total_data  | The account of `TotalData` for provided mint |
| bentobox_account  | Already created account of `BentoboxAccount` |
| authority  | Signer of `deposit` instruction |
| mint  | The token mint account  |
| token_program  | The address of `TokenProgram` |
| strategy_data  | The account of `StrategyData` which stores base data for strategy |

#### Remaining accounts
Only needed if signer is master contract (PDA)

| Field  | Description |
| ------------- | ------------- |
| master_contract_whitelisted  | The account of `MasterContractWhitelist` which is whitelisted for this Bentobox |
| master_contract_approved  | The account of `MasterContractApproved` for this master contract which already approved by user | 
| master_contract_account  | The master contract account |  
