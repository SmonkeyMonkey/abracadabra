### Create balance account

Everyone can send a transaction with instruction `create_balance` to the bentobox program to create `Balance` account on Bentobox for a specific token. In this account store amount value in shares for address/contract on Bentobox. 

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)

According to what we have in Balance, we need the following arguments accounts to initialize it.

#### Arguments
1. to: Pubkey - address for which `Balance` account is created.
   
#### Accounts

| Field  | Description |
| ------------- | ------------- |
| balance  | The account of `Balance`  |
| bentobox_account  | Already created account of `BentoboxAccount` |
| authority  | Signer of `create_balance` instruction |
| mint  | The token mint account for which the `Balance` account is created |
| system_program | The address of `SystemProgram` |