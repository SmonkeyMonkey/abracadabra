### Change bentobox authority

Change Bentobox authority can **ONLY** current Bentobox owner using `transfer_authority` instruction. Owner can do it directly or set the new owner to be a `pending_authority` and the last needs to use `claim_authority` instruction to become the owner of Bentobox. 

#### Preparation
1. [Create bentobox](./01-create-bentobox.md)

#### Transfer authority
 
##### Arguments
1. new_authority: Pubkey - address of the new owner.
2. direct: bool - true if `newOwner` should be set immediately. False if `newOwner` needs to use `claimOwnership`.
3. renounce: bool - allows the `new_authority` to be `address(0)` if `direct` and `renounce` is True. Has no effect otherwise

##### Accounts

| Field  | Description |
| ------------- | ------------- |
| bentobox_account  | Already created account of `BentoboxAccount` |
| authority  | Signer of `transfer_authority` instruction. **ONLY** current bentobox owner can change |
 

#### Claim authority 

##### Accounts

| Field  | Description |
| ------------- | ------------- |
| bentobox_account  | Already created account of `BentoboxAccount` |
| authority  | Signer of `claim_authority` instruction. **ONLY** already setted `pending_authority` can claim |