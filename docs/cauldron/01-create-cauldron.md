### Create cauldron

Creator can send a transaction with instruction `initialize` to the cauldron program to create the Cauldron. In this instruction will be created one new account - CauldronAccount and Creator will become the owner of created Cauldron.

According to what we have in CauldronAccount, we need to provide the following accounts and arguments to initialize it.

#### Arguments
  
1. interest_per_second: u64 - **ONLY** owner can change in `changeInterestRate` instruction.
2. collaterization_rate: u64 - numerator of the fraction representing the maximum collateral ratio (MCR) percentage, the maximum amount of debt a user can borrow with a selected collateral token. **CANNOT** be changed once set.
3. collaterization_rate_precision: u64 - denominator of the fraction representing the MCR percentage, the maximum amount of debt a user can borrow with a selected collateral token. **CANNOT** be changed once set.
   
   Example: 
    collaterization_rate = 9734, collaterization_rate_precision = 100000 -> MCR = 97.34% 

4. liquidation_multiplier: u64 - numerator of the fraction representing the liquidaton fee percentage, the discount a liquidator gets when buying collateral flagged for liquidation. **CANNOT** be changed once set.
5. liquidation_multiplier_precision - u64 - denominator of the fraction representing the liquidation fee percentage, the discount a liquidator gets when buying collateral flagged for liquidation. **CANNOT** be changed once set.

    Example: 
    liquidation_multiplier = 5, liquidation_multiplier_precision = 1000 -> liquidation fee = 0.5% 

6. distribution_part: u64 - numerator of percentual fee share to sSpell holders. **CANNOT** be changed once set.
7. distribution_precision: 64 - denominator of percentual fee share to sSpell holders. **CANNOT** be changed once set.

    Example: 
    distribution_part = 1, distribution_precision = 1000 -> liquidation fee = 0.01%

8. stale_after_slots_elapsed: u64 - time in seconds, maximum difference between the time slots during update which the price can be called relevant. **CANNOT** be changed once set.
9.  fee_to: Pubkey - address that is allowed to withdraw fee from cauldron (`withdraw_fee` instruction). **ONLY** owner can change in `set_fee_to` instruction. 
10. borrow_opening_fee: u64 - numerator of the fraction representing the borrow fee percentage which added to user dept every time user borrow MIM. **CANNOT** be changed once set.
11. borrow_opening_fee_precision: u64 - denominator of the fraction representing the borrow fee percentage which added to user dept every time user borrow MIM. 
    
    Example: 
    borrow_opening_fee = 5, borrow_opening_fee_precision = 100 -> borrow fee = 5% 

12. one_percent_rate: u64 - **CANNOT** be changed once set. 
13. complete_liquidation_duration: u64 - duration in seconds for liquidation position and swap. Uses twice between 1-st and second liquidate step and between 2-nd and 3-rd liquidation step. **CANNOT** be changed once set.

#### Accounts

| Field  | Description |
| ------------- | ------------- |
| cauldron_account  | The account of `CauldronAccount`  |
| magic_internet_money  | The token mint account of MIM token  |
| collateral  | The token mint account of collateral token. New cauldron for new collateral token.  |
| switchboard_data_feed  | Switchboard data feed - price account  |
| bentobox_account  | The account of `BentoboxAccount`  |
| authority  | Signer of `initialize` instruction. To be stored in `CauldronAccount` as authority  |
| system_program | The address of `SystemProgram` |
