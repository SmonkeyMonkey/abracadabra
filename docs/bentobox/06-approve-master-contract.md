### Approve master contact

To approve some master contract user need to create a `MasterContractApproval` account to store approval data using `create master_contract_approval` instruction. User can approves **ONLY** whitelisted master contract.

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)
2. [Create master contract whitelisted](./05-bentobox-whitelist.md#create%20master%20contract%20whitelisted%20account)

#### Create master contract approval account

##### Arguments
1. approved: bool - True - approves access. False revokes. access.

##### Accounts

| Field  | Description |
| ------------- | ------------- |
| master_contract_approved  |  The account of `MasterContractApproved` |
| master_contract_whitelisted  | Already created account of `MasterContractWhitelisted` |
| bentobox_account  | Already created account of `BentoboxAccount` |
| master_contract_program | The program id of `master_contract_account` |
| master_contract_account  | The address of master contract which want to approve  |
| authority  | Signer of `master_contact_whitelist` instruction, can be wallet address or contract (PDA) |
| payer  | Signer of `master_contact_approval` instruction which pays for instructions. Always wallet address |
| system_program | The address of `SystemProgram` |

#### Change master contract approval

For changing master contract approval user can use `set_master_contract_approval` instruction and  approves or revokes a master contract access to authority funds by providing the required `approved` argument. User can can approval **ONLY** for whitelisted master contract.

##### Arguments
1. approved: bool - approves access. False revokes access.

##### Accounts

| Field  | Description |
| ------------- | ------------- |
| master_contract_approved  |  The account of `MasterContractApproved` |
| master_contract_whitelisted  | Already created account of `MasterContractWhitelisted` |
| bentobox_account  | Already created account of `BentoboxAccount` |
| master_contract_program | The program id of `master_contract_account` |
| master_contract_account  | The address of master contract for which changing user approval |
| authority  | Signer of `set_master_contract_approval` instruction - user wallet address |