### Bentobox whitelist

Other contracts (master contracts) can use Bentobox in case if this contracts are registered. **ONLY** Bentobox owner can register contract. For registration, you need to create a `MasterContractWhitelisted` account using `create master_contract_whitelist` instruction.

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)

#### Create master contract whitelisted account

##### Arguments
1. whitelisted: bool - true if master contract should be whitelisted, false othervise.

##### Accounts

| Field  | Description |
| ------------- | ------------- |
| master_contract_whitelisted  |  The account of `MasterContractWhitelisted` |
| bentobox_account  | Already created account of `BentoboxAccount` |
| master_contract_program | The program id of `master_contract_account` |
| master_contract_account  | The address of master contract which want to register  |
| authority  | Signer of `master_contact_whitelist` instruction. **ONLY** bentobox owner |
| system_program | The address of `SystemProgram` |

#### Change bentobox whitelist

For changing Bentobox whitelist can use `whitelist_master_contract` instruction. **ONLY** Bentobox owner can change it.

##### Arguments
1. whitelisted: bool - true if master contract should be whitelisted, false othervise.

##### Accounts

| Field  | Description |
| ------------- | ------------- |
| master_contract_whitelisted  | Already created account of `MasterContractWhitelisted` |
| bentobox_account  | Already created account of `BentoboxAccount` |
| master_contract_program | The program id of `master_contract_account` |
| master_contract_account  | The address of master contract which want to add to or remove from whitelist |
| authority  | Signer of `whitelist_master_contract` instruction. **ONLY** bentobox owner |
