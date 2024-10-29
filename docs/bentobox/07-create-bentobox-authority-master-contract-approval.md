### Create bentobox_authority approval
This `create_bentobox_authority_master_contract_approval` instuction create `MasterContractApproved` account for `bentobox_authority` to store approval. Сan approves **ONLY** whitelisted master contract. Uses in master contracts when need to transfer money from bentobox to master contract but this instruction do it in a save way.

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)
2. [Create master contract whitelisted](./05-bentobox-whitelist.md#create%20master%20contract%20whitelisted%20account)


#### Arguments
1. approved: bool - True - approves access. False revokes.

#### Accounts
| Field  | Description |
| ------------- | ------------- |
| master_contract_approved  | The account of `MasterContractApproved` |
| master_contract_whitelisted  | Already created account of `MasterContractWhitelisted` |
| master_contract_program  | The program id of `master_contract_account` |
| master_contract_account  | he address of master contract which want to approve |
| bentobox_authority  | Authority of `bentobox_vault` - PDA |
| authority  | Signer of `create_bentobox_authority_master_contract_approval` instruction |
| system_program  | The address of `SystemProgram` |
| bentobox_account  | Already created `BentoboxAccount` |