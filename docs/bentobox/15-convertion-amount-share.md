### Convesion 

#### To share
Instruction which can convert `amount` of `token` in shares.

##### Preparation
1. [Create bentobox](./01-create-bentobox.md)

##### Arguments
1. `amount` - the `token` amount.
2. `roundUp` - if the result `share` should be rounded up.

##### Accounts
| Field  | Description |
| ------------- | ------------- |
| total_data  | The account of `TotalData` |
| mint  | The token mint account  |
| bentobox_account  | Already created account of `BentoboxAccount` |

#### To amount
Instruction which can convert `shares` back into the `token` amount.

##### Preparation
1. [Create bentobox](./01-create-bentobox.md)

##### Arguments
1. `share` - the amount of shares.
2. `roundUp` - if the result `share` should be rounded up.

##### Accounts
| Field  | Description |
| ------------- | ------------- |
| total_data  | The account of `TotalData` |
| mint  | The token mint account  |
| bentobox_account  | Already created account of `BentoboxAccount` |