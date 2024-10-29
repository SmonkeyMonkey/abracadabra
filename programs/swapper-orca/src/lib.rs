use anchor_lang::prelude::*;

use anchor_lang::solana_program::pubkey::Pubkey;

pub mod context;
pub mod error;
pub mod utils;

use crate::context::*;
use crate::utils::*;

use swapper_package::swapper_interface::{GetAmountIn, GetAmountOut, Swap, Swapper};


declare_id!("3Hm9snMqyCdNHXFZ6B3jgwnY1gE86N12WrcPsfniHyjf");

#[program]
pub mod swapper_orca {
    use super::*;

    // #[state]
    pub struct SwapperOrca;

    // remaining [0] - pool vault
    pub fn swap<'info>(
        ctx: Context<'_, '_, '_, 'info, Swap<'info>>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        swap_orca(&ctx, amount_in, minimum_amount_out)
    }

    impl<'info> Swapper<'info> for SwapperOrca {
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

        // Remaining accounts required by Orca Swap
        ///   1. `[writable]` token swap
        ///   2. `[]` swap authority
        ///   3. `[writable]` pool source account
        ///   4. `[writable]` pool destination account
        ///   5. `[writable]` pool token mint
        ///   6. `[writable]` pool fee account
        ///   7. `[writable]` pool host fee account
        //    8. `[]` source mint account
        ///   9. `[]` destination mint account
        fn swap<'a>(
            ctx: Context<'_, '_, '_, 'a, Swap<'a>>,
            amount_in: u64,
            minimum_amount_out: u64,
        ) -> Result<()> {
            swap_orca(&ctx, amount_in, minimum_amount_out)
        }
    }
}
