import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaVault } from "../target/types/solana_vault";
import { Keypair, SystemProgram } from "@solana/web3.js";

describe("solana-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaVault as Program<SolanaVault>;
  const vaultAccount = Keypair.generate();

  it("Is initialized!", async () => {
    // Initialize the vault account
    const tx = await program.methods
      .initialize()
      .accounts({
        vault: vaultAccount.publicKey,
        user: provider.wallet.publicKey, // Payer for the transaction
        systemProgram: SystemProgram.programId,
      })
      .signers([vaultAccount]) // Signer for the vault account
      .rpc();

    console.log("Your transaction signature", tx);

    // Fetch and verify the vault account state
    const vault = await program.account.vault.fetch(vaultAccount.publicKey);
    console.log("Vault total SOL:", vault.totalSol.toString());
  });
});
