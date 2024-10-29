### Create total accounts

Everyone can send a transaction with instruction `create_total` to the cauldron program to create new `Total` account where will store total collateral_share and total borrow.

#### Preparation
1. [Create cauldron](./01-create-cauldron.md)

According to what we have in Total, we need the following accounts to initialize it.
#### Accounts

| Field  | Description |
| ------------- | ------------- |
| total_data  | The account of `Total`  |
| authority  | Signer of `create_total` instruction |
| cauldron_account  | Already created account of `CauldronAccount` |
| system_program | The address of `SystemProgram` |