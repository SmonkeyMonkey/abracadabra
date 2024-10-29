use anchor_lang::prelude::*;

#[constant]
pub const BENTOBOX_SEED_PART: &[u8] = b"bentobox";
#[constant]
pub const CAULDRON_SEED_PART: &[u8] = b"cauldron";
#[constant]
pub const STRATEGY_SEED_PART: &[u8] = b"strategy";
#[constant]
pub const EXECUTOR_INFO_SEED: &[u8] = b"executorinfo";
#[constant]
pub const STRATEGY_VAULT_SEED_PART: &[u8] = b"strategyvaultkey";
#[constant]
pub const TOTAL_VAULT_KEY_SEED_PART: &[u8] = b"bentoboxtotalvaultkey";
#[constant]
pub const DISCRIMINATOR_BYTES: usize = 8;
