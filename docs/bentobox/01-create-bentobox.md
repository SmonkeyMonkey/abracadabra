### Create bentobox

Creator can send a transaction with instruction `create` to the bentobox program to create the Bentobox. In this instruction will be created one new account - BentoboxAccount and Creator will become the owner of created Bentobox.

According to what we have in BentoboxAccount, we need the following accounts and arguments to initialize it.

#### Arguments
  
1. minimim_share_balance: u64 - min balance in shares which should always stay on Bentobox. **CANNOT** be changed once set.
2. max_target_percentage: u64 - max target percentage of the strategies for tokens on Bentobox. **CANNOT** be changed once set.

#### Accounts

| Field  | Description |
| ------------- | ------------- |
| bentobox_account  | The account of `BentoboxAccount`  |
| authority  | Signer of `сreate` instruction. To be stored in `BentoboxAccount` as authority. **CAN** change using `transfer_authority` instruction, but **ONLY** owner can change |
| system_program | The address of `SystemProgram` |