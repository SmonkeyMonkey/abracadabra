### Create user balance

To open position in Cauldroun, each user should have position state account called `UserBalance`. Enyone can call instruction `create_user_balance` from the cauldron program to create new account where `collateral_share` and `borrow_part` are stored.

#### Preparation

1. [Create cauldron](./01-create-cauldron.md)

Following accounts are needed to initialize `UserBalance`.

#### Accounts

| Field            | Description                                  |
| ---------------- | -------------------------------------------- |
| user_balance     | The account of `UserBalance`                 |
| cauldron_account | Already created account of `CauldronAccount` |
| authority        | Signer of `create_user_balance` instruction  |
| system_program   | The address of `SystemProgram`               |
