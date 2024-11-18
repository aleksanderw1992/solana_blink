use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

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
        let ix = system_instruction::transfer(&user.key(), &vault.key(), amount);
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
        if let Some(contributor) = vault
            .contributors
            .iter_mut()
            .find(|c| c.address == contributor_pubkey)
        {
            contributor.amount += amount;
        } else {
            vault.contributors.push(Contributor {
                address: contributor_pubkey,
                amount,
            });
        }

        // Log the contribution
        msg!(
            "Deposit: {} contributed {} lamports",
            contributor_pubkey,
            amount
        );

        Ok(())
    }

    pub fn distribute_50(ctx: Context<Distribute>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let winner_account = &mut ctx.accounts.winner;

        if vault.total_sol == 0 {
            return Err(ErrorCode::VaultEmpty.into());
        }

        let amount_to_distribute = vault.total_sol / 2;

        // Select a winner based on weighted contributions
        let selected_winner_pubkey = select_winner(&vault.contributors)?;
        msg!("Winner selected: {}", selected_winner_pubkey);

        // Verify that the winner account matches the selected winner
        require_keys_eq!(
            winner_account.key(),
            selected_winner_pubkey,
            ErrorCode::InvalidWinner
        );

        // Log the probabilities
        log_probabilities(&vault.contributors)?;

        // Transfer SOL from vault to winner by adjusting lamports directly
        **vault.to_account_info().try_borrow_mut_lamports()? -= amount_to_distribute;
        **winner_account.try_borrow_mut_lamports()? += amount_to_distribute;

        // Update vault state
        vault.total_sol -= amount_to_distribute;

        // Log the distribution
        msg!(
            "Distributed {} lamports to winner: {}",
            amount_to_distribute,
            winner_account.key()
        );

        Ok(())
    }

    pub fn distribute_100(ctx: Context<Distribute>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let winner_account = &mut ctx.accounts.winner;

        if vault.total_sol == 0 {
            return Err(ErrorCode::VaultEmpty.into());
        }

        let amount_to_distribute = vault.total_sol;

        // Select a winner based on weighted contributions
        let selected_winner_pubkey = select_winner(&vault.contributors)?;
        msg!("Winner selected: {}", selected_winner_pubkey);

        // Verify that the winner account matches the selected winner
        require_keys_eq!(
            winner_account.key(),
            selected_winner_pubkey,
            ErrorCode::InvalidWinner
        );

        // Log the probabilities
        log_probabilities(&vault.contributors)?;

        // Transfer SOL from vault to winner by adjusting lamports directly
        **vault.to_account_info().try_borrow_mut_lamports()? -= amount_to_distribute;
        **winner_account.try_borrow_mut_lamports()? += amount_to_distribute;

        // Reset vault state
        vault.total_sol = 0;

        // Log the distribution
        msg!(
            "Distributed {} lamports to winner: {}",
            amount_to_distribute,
            winner_account.key()
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
        space = 8 + 1 + 8 + 4 + (40 * 100),
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
    #[account(mut)]
    pub winner: AccountInfo<'info>,
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
    #[msg("Invalid winner.")]
    InvalidWinner,
    #[msg("No winner.")]
    NoWinner,
}

// Helper Functions
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
