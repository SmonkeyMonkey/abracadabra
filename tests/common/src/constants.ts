import { PublicKey } from '@solana/web3.js';
import { BN } from "@coral-xyz/anchor";
import BigNumber from 'bignumber.js';

export const DEVNET_URL = 'https://api.devnet.solana.com'

export const LENDING_PROGRAM_ID = new PublicKey('EgTDgwiLzN6b3fLfaSpYBDq68j4wjtSYzGorSwudEcMU');
export const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID: PublicKey = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
    
// export const RAY = new PublicKey("FSRvxBNrQWX2Fy2qvKMLL3ryEdRtE3PUTZBcdKwASZTU");
export const RAY = new PublicKey("aa1VApKQ21Dn9zrfTLvEHLeg2HSS9zKcnZuHeMKQsxS");

// export const USDC = new PublicKey("BEcGFQK1T1tSu3kvHC17cyCkQ5dvXqAJ7ExB2bb5Do7a");
export const USDC = new PublicKey("bbecLrVvtAyGx55BZSxbs5Eoum2V7BHzXCfWmDHeh2i");

// export const RAY_USDC_POOL = new PublicKey("ELSGBb45rAQNsMTVzwjUqL8vBophWhPn4rNbqwxenmqY");
export const RAY_USDC_POOL = new PublicKey("ELSGBb45rAQNsMTVzwjUqL8vBophWhPn4rNbqwxenmqY");

// Switchboard data feed accounts on devnet
// export const TEST_PRICE = new PublicKey("Ep6Ro8sugN5tMT8p7AihWWKJBYQnyk8wwfBZ6Q5eo8WM");
export const TEST_PRICE = new PublicKey("EYnKu34B81dVw1SYjyCxthGu833uGhu4MHQvFZKZJG7N");
export const TEST_PRICE_UPPER = new PublicKey("6wASgqabW4LXJq6q5HWbN46azmzVWsh2smq67JyE5eTW");

export const ORCA_SOL = new PublicKey("B4dChEv7QGsAz8HrX4TroDijzYtMRGuTDz3uaq61kag");
export const ORCA_SOL_UPPER = new PublicKey("RccwKTKsPtetk5LqMhNqfzzpc1LEUAdpDjpTG6VgnXf");

// export const SOL_USD = new PublicKey("DfZxR1TKfDMvjCLM1Si3BDDSS283jba8HTd1cewhNAnN");
export const SOL_USD = new PublicKey("8g6zZtZFLJCRBm85rZbMws3ce2oqzzDKEGBj9wQGp1kY");

// export const USDC_RAY = new PublicKey("419L5BpAmyNjm6M3BHFxsNyJrt1E3e2FYokBVegXi8Jk");
// Replaced to USD
export const USD_RAY = new PublicKey("2Vw5U3KRpVZJ7BnTeNhhMHuep4Ksxh1ohQBeKbKpsG7y");
export const USDC_RAY_UPPER = new PublicKey("DeRvyYFQVzUGCiDbGZ3ZzTWfGcwtKp3Efs1Ms2LNc4ik");

// Switchboard programs
export const SWITCHBOARD_MAINNET_V2 = new PublicKey('SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f');
export const SWITCHBOARD_DEVNET_V2 = new PublicKey('2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG');

/** @internal */        
export const ORACLE_PROGRAM_ID = new PublicKey('gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s');

/** @internal */
export const WAD = new BigNumber('1e+18');

/** @internal */
export const WAD_BigInt = BigInt(WAD.toString());

export const U64_MAX: BigInt = BigInt("18446744073709551615"); // rust u64 max

// constants for bentobox initialize
export const MINIMUM_SHARE_BALANCE: BN = new BN(1000);
export const MAX_TARGET_PERCENTAGE: BN = new BN(95);

// constants for cauldron initialize
export const INTEREST_PER_SECOND: BN = new BN(10000); // 1e4

export const COLLATERIZATION_RATE: BN = new BN(10000); // 1e4
export const COLLATERIZATION_RATE_PRECISION: BN = new BN(100000); // 1e5

export const LIQUIDATION_MULTIPLIER: BN = new BN(112500);
export const LIQUIDATION_MULTIPLIER_PRECISION: BN = new BN(100000); // 1e5

export const DISTRIBUTION_PART: BN = new BN(10);
export const DISTRIBUTION_PRECISION: BN = new BN(100);

export const STALE_AFTER_SLOTS_ELAPSED: BN = new BN(250);

export const BORROW_OPENING_FEE: BN = new BN(1000);
export const BORROW_OPENING_FEE_PRECISION: BN = new BN(100000); // 1e5

export const ONE_PERCENT_RATE: BN = new BN(317097920);
export const COMPLETE_LIQUIDATION_DURATION: BN = new BN(60)

// Constants for orca swap
export const SOL_TOKEN = new PublicKey("So11111111111111111111111111111111111111112")
export const ORCA_TOKEN = new PublicKey("orcarKHSqC5CDDsGbho8GKvwExejWHxTqGzXgcewB9L")
export const ORCA_TOKEN_SWAP_ID_DEVNET: PublicKey = new PublicKey("3xQ8SWv2GaFXXpHZNqkXsdxq5DZciHBz6ZFoPPfbFd7U");

export class OrcaSolPool {
    poolAddress: PublicKey = new PublicKey("B4v9urCKnrdCMWt7rEPyA5xyuEeYQv4aDpCfGFVaCvox");
    authority: PublicKey = new PublicKey("38Q2148y3BKU6pDUfv1zpeEeKNuDHBH34WdEwo5EiTfe");
    poolTokenMint: PublicKey = new PublicKey("CmDdQhusZWyi9fue27VSktYgkHefm3JXNdzc9kCpyvYi");
    poolTokenDecimals: 6;
    poolSource: PublicKey = new PublicKey("3coXPvurzHQ6sYLrYi8zGWG7SLVv9mHnbqmchjKgPEmz");
    poolDestination: PublicKey = new PublicKey("HsGXFtv1uBTtWuPCEJWpxZS4QkcHwAhdPaMVSvS4fhtv");
    feeAccount: PublicKey = new PublicKey("EEWAuP2d1KbwX14dgHwxXspPMYfxXvgf4CNRYvMakPHg");
    tokenIds: [PublicKey, PublicKey] = [SOL_TOKEN, ORCA_TOKEN];
    tokens: Map<String, PublicKey> = new Map([
        [SOL_TOKEN.toBase58(), new PublicKey("3coXPvurzHQ6sYLrYi8zGWG7SLVv9mHnbqmchjKgPEmz")],
        [ORCA_TOKEN.toBase58(), new PublicKey("HsGXFtv1uBTtWuPCEJWpxZS4QkcHwAhdPaMVSvS4fhtv")],
    ])
};