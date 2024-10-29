use crate::errors::ErrorCode;
use anchor_lang::{prelude::*, Result};

use std::convert::TryInto;

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct Rebase {
    pub base: u128,
    pub elastic: u128,
}

impl Rebase {
    pub const SIZE: usize = 16 + 16;

    /// Calculates the base value in relationship to `elastic` and `total`.
    pub fn to_base(&self, elastic: u64, round_up: bool) -> Result<u64> {
        if self.elastic == 0 {
            Ok(elastic.into())
        } else {
            let mut base = self
                .base
                .checked_mul(elastic.into())
                .ok_or(ErrorCode::WrongIntegerMultiplication)?
                .checked_div(self.elastic)
                .ok_or(ErrorCode::WrongIntegerDivision)?;

            let temp = base
                .checked_mul(self.elastic)
                .ok_or(ErrorCode::WrongIntegerMultiplication)?
                .checked_div(self.base)
                .ok_or(ErrorCode::WrongIntegerDivision)?;

            if round_up && temp < elastic.into() {
                base = base.checked_add(1).ok_or(ErrorCode::WrongIntegerAddition)?;
            }

            Ok(base
                .try_into()
                .map_err(|_| ErrorCode::TryIntoConversionError)?)
        }
    }

    /// Calculates the elastic value in relationship to `base` and `total`.
    pub fn to_elastic(&self, base: u64, round_up: bool) -> Result<u64> {
        if self.base == 0 {
            Ok(base.into())
        } else {
            let mut elastic = self
                .elastic
                .checked_mul(base.into())
                .ok_or(ErrorCode::WrongIntegerMultiplication)?
                .checked_div(self.base)
                .ok_or(ErrorCode::WrongIntegerDivision)?;

            let temp = elastic
                .checked_mul(self.base)
                .ok_or(ErrorCode::WrongIntegerMultiplication)?
                .checked_div(self.elastic)
                .ok_or(ErrorCode::WrongIntegerDivision)?;

            if round_up && temp < base.into() {
                elastic = elastic
                    .checked_add(1)
                    .ok_or(ErrorCode::WrongIntegerAddition)?;
            }

            Ok(elastic
                .try_into()
                .map_err(|_| ErrorCode::TryIntoConversionError)?)
        }
    }

    /// Add `elastic` to `total` and doubles `total.base`.
    /// Return Rebase. The new total.
    /// base in relationship to `elastic`.
    pub fn add_e(&mut self, elastic: u64, round_up: bool) -> Result<(Rebase, u64)> {
        let base = self.to_base(elastic, round_up)?;
        self.elastic = self
            .elastic
            .checked_add(elastic.into())
            .ok_or(error!(ErrorCode::WrongIntegerAddition))?;

        self.base = self
            .base
            .checked_add(base.into())
            .ok_or(error!(ErrorCode::WrongIntegerAddition))?;

        return Ok((self.clone(), elastic));
    }

    // Add `elastic` and `base` to `total`.
    pub fn add_e_b(&mut self, elastic: u64, base: u64) -> Result<Rebase> {
        self.elastic = self
            .elastic
            .checked_add(elastic.into())
            .ok_or(error!(ErrorCode::WrongIntegerAddition))?;

        self.base = self
            .base
            .checked_add(base.into())
            .ok_or(error!(ErrorCode::WrongIntegerAddition))?;

        return Ok(self.clone());
    }

    /// Sub `base` from `total` and update `total.elastic`.
    /// Return Rebase. The new total.
    /// elastic in relationship to `base`.
    pub fn sub_e(&mut self, base: u64, round_up: bool) -> Result<(Rebase, u64)> {
        let elastic = self.to_elastic(base, round_up)?;

        self.elastic = self
            .elastic
            .checked_sub(elastic.into())
            .ok_or(error!(ErrorCode::WrongIntegerSubtraction))?;

        self.base = self
            .base
            .checked_sub(base.into())
            .ok_or(error!(ErrorCode::WrongIntegerSubtraction))?;

        return Ok((self.clone(), elastic));
    }

    /// Subtract `elastic` and `base` to `total`.
    pub fn sub_e_b(&mut self, elastic: u64, base: u64) -> Result<Rebase> {
        self.elastic = self
            .elastic
            .checked_sub(elastic.into())
            .ok_or(error!(ErrorCode::WrongIntegerSubtraction))?;

        self.base = self
            .base
            .checked_sub(base.into())
            .ok_or(error!(ErrorCode::WrongIntegerSubtraction))?;

        return Ok(self.clone());
    }
}
