### Create total accounts

Everyone can send a transaction with instruction `create_vault` to the bentobox program to create the total accounts for a specific token if these accounts have not already been created. In this instruction will be created two new accounts:
1. `BentoboxVault` - token account for a specific token. Authority of token account set to the bentobox PDA - bentobox_authority.
2. `TotalData` - account which store total amounts.
#### Preparation
1. [Create bentobox](./01-create-bentobox.md)

According to what we have in BentoboxVault and TotalData, we need the following accounts to initialize it.
#### Accounts

| Field  | Description |
| ------------- | ------------- |
| total_data  | The account of `TotalData`  |
| bentobox_vault  | The token account of Bentobox vault  |
| authority  | Signer of `create_vault` instruction |
| mint  | The token mint account for which the vault and `TotalData` account are created |
| bentobox_account  | Already created account of `BentoboxAccount` |
| system_program | The address of `SystemProgram` |
| rent | The address of `Rent` |
| token_program | The address of `TokenProgram` |