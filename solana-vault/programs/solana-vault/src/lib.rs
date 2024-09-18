use anchor_lang::prelude::*;

declare_id!("AH4vTxcx557pVqWXsdXp9mqxb73SayXrb1gf9ugbWp9W");

#[program]
pub mod solana_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
