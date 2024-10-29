use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::Pubkey;

pub mod error;
pub mod state;
pub mod utils;
pub mod context;

use crate::utils::*;
use crate::context::*;
use swapper_package::swapper_interface::{GetAmountIn, GetAmountOut, Swap, Swapper};


declare_id!("Bbh4JSnawctDsQZDgme2d9S8cH16nQoJSukPmAv8qLPM");


#[program]
pub mod swapper_raydium {

    use super::*;
    pub fn swap<'a>(
        ctx: Context<'_, '_, '_, 'a, Swap<'a>>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        swap_raydium(&ctx, amount_in, minimum_amount_out)
    }
    // #[state]
    pub struct SwappperRaydium;

    impl<'info> Swapper<'info> for SwappperRaydium {
        fn get_amount_in<'a>(
            _ctx: Context<'_, '_, '_, 'a, GetAmountIn<'a>>,
            _amount_out: u64,
        ) -> Result<()> {
            Ok(())
        }

        fn get_amount_out<'a>(
            _ctx: Context<'_, '_, '_, 'a, GetAmountOut<'a>>,
            _amount_in: u64,
        ) -> Result<()> {
            Ok(())
        }

        // Remaining accounts required by Raydium Swap
        ///   1. `[writable]` amm Account
        ///   2. `[]` amm authority
        ///   3. `[writable]` amm open_orders Account
        ///   4. `[writable]` amm target_orders Account
        ///   5. `[writable]` pool_token_coin Amm Account to swap FROM or To,
        ///   6. `[writable]` pool_token_pc Amm Account to swap FROM or To,
        ///   7. `[]` serum dex program id
        ///   8. `[writable]` serum market Account. serum_dex program is the owner.
        ///   9. `[writable]` bids Account
        ///   10. `[writable]` asks Account
        ///   11. `[writable]` event_q Account
        ///   12. `[writable]` coin_vault Account
        ///   13. `[writable]` pc_vault Account
        ///   14. '[]` vault_signer Account
        fn swap<'a>(
            ctx: Context<'_, '_, '_, 'a, Swap<'a>>,
            amount_in: u64,
            minimum_amount_out: u64,
        ) -> Result<()> {
            swap_raydium(&ctx, amount_in, minimum_amount_out)
        }
    }
}
