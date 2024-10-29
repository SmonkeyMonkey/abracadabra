use anchor_lang::prelude::*;
use std::mem::size_of;

/// Instructions supported by the AmmInfo program.
#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
pub enum AmmInstruction {
    Reserved,
    Reserved0,
    Reserved1,
    Reserved2,
    Reserved3,
    Reserved4,
    Reserved5,
    Reserved6,
    Reserved7,
    /// Swap coin or pc from pool
    ///
    ///   0. `[]` Spl Token program id
    ///   1. `[writable]` amm Account
    ///   2. `[]` $authority
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
    ///   15. `[writable]` user source token Account. user Account to swap from.
    ///   16. `[writable]` user destination token Account. user Account to swap to.
    ///   17. `[singer]` user owner Account
    SwapBaseIn(SwapInstructionBaseIn),
    Reserved8,
    Reserved9,
    Reserved10,
}

impl AmmInstruction {
    /// Packs a [AmmInstruction](enum.AmmInstruction.html) into a byte buffer.
    pub fn pack(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::with_capacity(size_of::<Self>());
        match &*self {
            Self::SwapBaseIn(SwapInstructionBaseIn {
                amount_in,
                minimum_amount_out,
            }) => {
                buf.push(9);
                buf.extend_from_slice(&amount_in.to_le_bytes());
                buf.extend_from_slice(&minimum_amount_out.to_le_bytes());
            }
            _ => {}
        }
        Ok(buf)
    }
}

#[repr(C)]
#[derive(AnchorSerialize, AnchorDeserialize,Clone, Copy, Debug, Default, PartialEq)]
pub struct SwapInstructionBaseIn {
    // SOURCE amount to transfer, output to DESTINATION is based on the exchange rate
    pub amount_in: u64,
    /// Minimum amount of DESTINATION token to output, prevents excessive slippage
    pub minimum_amount_out: u64,
}
