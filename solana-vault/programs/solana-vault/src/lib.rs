use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, clock::Clock, hash::hash};
use anchor_lang::solana_program::sysvar::rent::Rent;
use anchor_lang::solana_program::system_instruction::transfer;
use std::collections::VecDeque;
declare_id!("AH4vTxcx557pVqWXsdXp9mqxb73SayXrb1gf9ugbWp9W");

#[program]
pub mod solana_vault {
    use super::*;

    pub fn initialize(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.total_sol = 0;
        vault.contributors = Vec::new(); // Initialize empty vector
        Ok(())
    }

    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let contributor = ctx.accounts.user.key();

        // Record the SOL sent and update the vault
        vault.total_sol += amount;

        let mut found = false;
        for contrib in &mut vault.contributors {
            if contrib.address == contributor {
                contrib.amount += amount;
                found = true;
                break;
            }
        }

        if !found {
            vault.contributors.push(Contributor {
                address: contributor,
                amount,
            });
        }

        // Transfer SOL to the vault
        let ix = solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;
        Ok(())
    }

pub fn distribute_50(ctx: Context<Distribute>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let rent = Rent::get()?;

    // Ensure vault has sufficient balance
    if vault.total_sol == 0 {
        return Err(error!(ErrorCode::NoWinner));
    }

    let amount_to_distribute = vault.total_sol / 2;

    // Get the winner's public key before any mutable borrow occurs
    let winner_key = ctx.accounts.winner.key();
    let winner_lamports = **ctx.accounts.winner.try_borrow_lamports()?;

    // Ensure the winner remains rent-exempt after receiving SOL
    let minimum_balance = rent.minimum_balance(ctx.accounts.winner.data_len());
    if winner_lamports + amount_to_distribute < minimum_balance {
        return Err(ProgramError::InsufficientFunds.into());
    }

    // Transfer 50% of the vault to the winner
    vault.total_sol -= amount_to_distribute;
    **ctx.accounts.winner.try_borrow_mut_lamports()? += amount_to_distribute;

    let transfer_ix = transfer(
        &ctx.accounts.vault.key(),
        &winner_key, // Use pre-extracted winner public key
        amount_to_distribute,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[ctx.accounts.vault.to_account_info(), ctx.accounts.winner.to_account_info()],
    )?;

    Ok(())
}

pub fn distribute_100(ctx: Context<Distribute>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let rent = Rent::get()?;

    // Ensure vault has sufficient balance
    if vault.total_sol == 0 {
        return Err(error!(ErrorCode::NoWinner));
    }

    let amount_to_distribute = vault.total_sol;

    // Get the winner's public key before any mutable borrow occurs
    let winner_key = ctx.accounts.winner.key();
    let winner_lamports = **ctx.accounts.winner.try_borrow_lamports()?;

    // Ensure the winner remains rent-exempt after receiving SOL
    let minimum_balance = rent.minimum_balance(ctx.accounts.winner.data_len());
    if winner_lamports + amount_to_distribute < minimum_balance {
        return Err(ProgramError::InsufficientFunds.into());
    }

    // Transfer 100% of the vault to the winner
    vault.total_sol = 0;
    **ctx.accounts.winner.try_borrow_mut_lamports()? += amount_to_distribute;

    let transfer_ix = transfer(
        &ctx.accounts.vault.key(),
        &winner_key, // Use pre-extracted winner public key
        amount_to_distribute,
    );
    anchor_lang::solana_program::program::invoke(
        &transfer_ix,
        &[ctx.accounts.vault.to_account_info(), ctx.accounts.winner.to_account_info()],
    )?;

    Ok(())
}

    pub fn check_vault(ctx: Context<CheckVault>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        msg!("Total SOL in Vault: {}", vault.total_sol);

        for contrib in &vault.contributors {
            msg!("Contributor Address: {}, Contribution: {}", contrib.address, contrib.amount);
        }

        Ok(())
    }
}

// Data structures
#[account]
pub struct Vault {
    pub total_sol: u64,
    pub contributors: Vec<Contributor>, // List of contributors
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Contributor {
    pub address: Pubkey,
    pub amount: u64,
}

// Context structs
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(init, payer = user, space = 8 + 64 + (32 + 8) * 100)] // Allocate space for 100 contributors
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub winner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckVault<'info> {
    pub vault: Account<'info, Vault>,
}

// Error handling
#[error_code]
pub enum ErrorCode {
    #[msg("No winner found")]
    NoWinner,
}

// Winner selection based on blockhash randomness
fn select_winner(contributors: &Vec<Contributor>) -> Result<Pubkey> {
    if contributors.is_empty() {
        return Err(ErrorCode::NoWinner.into());
    }

    // Get the current block timestamp as a source of randomness
    let current_timestamp = Clock::get()?.unix_timestamp;

    // Create a hash from the current timestamp
    let hash_result = hash(&current_timestamp.to_be_bytes());

    // Convert the hash result into a large integer for random selection
    let random_number = u64::from_le_bytes(hash_result.to_bytes()[..8].try_into().unwrap());

    // Sort contributors by amount in descending order
    let mut sorted_contributors = contributors.clone();
    sorted_contributors.sort_by(|a, b| b.amount.cmp(&a.amount));

    // Calculate weighted chances based on their contributions
    let total_contributors = sorted_contributors.len();
    let mut weighted_contributors: VecDeque<Pubkey> = VecDeque::new();

    let mut weight = total_contributors as u64;
    for contrib in sorted_contributors.iter() {
        let chances = if weight > 0 { weight } else { 1 };
        for _ in 0..chances {
            weighted_contributors.push_back(contrib.address);
        }
        weight /= 2; // Reduce the chances by half for the next contributor
    }

    // Select a winner based on the random number and the weighted contributors
    let winner_index = (random_number as usize) % weighted_contributors.len();
    Ok(weighted_contributors[winner_index])
}
