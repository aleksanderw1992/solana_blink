use anchor_lang::prelude::*;
use anchor_lang::solana_program::{hash::hash, system_instruction};

declare_id!("AH4vTxcx557pVqWXsdXp9mqxb73SayXrb1gf9ugbWp9W");

#[program]
pub mod solana_vault {
    use super::*;

    pub fn initialize(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.bump = ctx.bumps.vault;
        vault.total_sol = 0;
        vault.contributors = Vec::new();
        msg!("Vault initialized with bump {}", vault.bump);
        Ok(())
    }

    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let user = &ctx.accounts.user;
        let vault = &mut ctx.accounts.vault;
        msg!("Depositing SOL, vault bump is {}", vault.bump);

        // Transfer SOL from user to vault PDA
        let ix = system_instruction::transfer(
            &user.key(),
            &vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                user.to_account_info(),
                vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Update vault state
        vault.total_sol += amount;

        // Update contributors list
        let contributor_pubkey = user.key();
        if let Some(contributor) = vault.contributors.iter_mut().find(|c| c.address == contributor_pubkey) {
            contributor.amount += amount;
        } else {
            vault.contributors.push(Contributor {
                address: contributor_pubkey,
                amount,
            });
        }

        // Log the contribution
        msg!("Deposit: {} contributed {} lamports", contributor_pubkey, amount);

        Ok(())
    }

    pub fn distribute_50(ctx: Context<Distribute>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        if vault.total_sol == 0 {
            return Err(ErrorCode::VaultEmpty.into());
        }

        let amount_to_distribute = vault.total_sol / 2;

        // Select a winner based on weighted contributions
        let winner_pubkey = select_winner(&vault.contributors)?;
        msg!("Winner selected: {}", winner_pubkey);

        // Log the probabilities
        log_probabilities(&vault.contributors)?;

        // Transfer SOL from vault to winner
        let ix = system_instruction::transfer(
            &vault.key(),
            &winner_pubkey,
            amount_to_distribute,
        );
        let vault_seeds = &[b"vault".as_ref(), &[vault.bump]];
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[vault_seeds],
        )?;

        // Update vault state
        vault.total_sol -= amount_to_distribute;

        // Log the distribution
        msg!(
            "Distributed {} lamports to winner: {}",
            amount_to_distribute,
            winner_pubkey
        );

        Ok(())
    }

    pub fn distribute_100(ctx: Context<Distribute>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        if vault.total_sol == 0 {
            return Err(ErrorCode::VaultEmpty.into());
        }

        let amount_to_distribute = vault.total_sol;

        // Select a winner based on weighted contributions
        let winner_pubkey = select_winner(&vault.contributors)?;
        msg!("Winner selected: {}", winner_pubkey);

        // Log the probabilities
        log_probabilities(&vault.contributors)?;

        // Transfer SOL from vault to winner
        let ix = system_instruction::transfer(
            &vault.key(),
            &winner_pubkey,
            amount_to_distribute,
        );
        let vault_seeds = &[b"vault".as_ref(), &[vault.bump]];
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &[
                vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[vault_seeds],
        )?;

        // Reset vault state
        vault.total_sol = 0;

        // Log the distribution
        msg!(
            "Distributed {} lamports to winner: {}",
            amount_to_distribute,
            winner_pubkey
        );

        Ok(())
    }

    pub fn check_vault(ctx: Context<CheckVault>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        msg!("Total SOL in Vault: {}", vault.total_sol);

        for contrib in &vault.contributors {
            msg!(
                "Contributor: {}, Amount: {} lamports",
                contrib.address,
                contrib.amount
            );
        }

        // Log the probabilities
        log_probabilities(&vault.contributors)?;

        Ok(())
    }
}

// Data Structures
#[account]
pub struct Vault {
    pub bump: u8,
    pub total_sol: u64,
    pub contributors: Vec<Contributor>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Contributor {
    pub address: Pubkey,
    pub amount: u64,
}

// Contexts
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 1 + 8 + 4 + (40 * 100), // 8 for discriminator, 1 for bump, 8 for total_sol, 4 for vec length, 40 per contributor (32+8)
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckVault<'info> {
    #[account(seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

// Error Codes
#[error_code]
pub enum ErrorCode {
    #[msg("The vault is empty.")]
    VaultEmpty,
}

// Helper Functions
fn select_winner(contributors: &Vec<Contributor>) -> Result<Pubkey> {
    let total_contribution: u64 = contributors.iter().map(|c| c.amount).sum();

    if total_contribution == 0 {
        return Err(ErrorCode::VaultEmpty.into());
    }

    // Get a random seed from the recent blockhash
    let clock = Clock::get()?;
    let seed = clock.unix_timestamp as u64;

    // Create a weighted distribution
    let mut cumulative_weights = Vec::new();
    let mut cumulative = 0u64;
    for c in contributors {
        cumulative += c.amount;
        cumulative_weights.push((c.address, cumulative));
    }

    // Generate a random number between 0 and total_contribution
    let hash_input = seed.to_le_bytes();
    let hash = hash(&hash_input);
    let random_number = u64::from_le_bytes(hash.to_bytes()[..8].try_into().unwrap()) % total_contribution;

    // Find the winner based on the random number
    for (address, weight) in cumulative_weights {
        if random_number < weight {
            return Ok(address);
        }
    }

    // Fallback
    Ok(contributors.last().unwrap().address)
}

fn log_probabilities(contributors: &Vec<Contributor>) -> Result<()> {
    let total_contribution: u64 = contributors.iter().map(|c| c.amount).sum();

    if total_contribution == 0 {
        return Ok(());
    }

    for c in contributors {
        let probability = (c.amount as f64 / total_contribution as f64) * 100.0;
        msg!(
            "Contributor: {}, Probability: {:.2}%",
            c.address,
            probability
        );
    }

    Ok(())
}
