import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaVault } from "../target/types/solana_vault";
import { SystemProgram } from "@solana/web3.js";
import assert from "assert";

describe("solana-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaVault as Program<SolanaVault>;

  // Vault PDA
  let vaultPDA: anchor.web3.PublicKey;
  let vaultBump: number;

  // Users
  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();

  it("Initializes the vault", async () => {
    // Derive the PDA for the vault
    [vaultPDA, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      program.programId
    );

    // Airdrop SOL to user1 and user2
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user1.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user2.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );

    // Initialize the vault
    await program.methods
      .initialize()
      .accounts({
        vault: vaultPDA,
        user: provider.wallet.publicKey, // Payer for the transaction
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch the vault account
    const vault = await program.account.vault.fetch(vaultPDA);

    // Check initial state
    assert.ok(vault.totalSol.toNumber() === 0);
    assert.ok(vault.contributors.length === 0);
    console.log("Vault bump:", vault.bump);
    console.log("Vault initialized successfully");
  });

  it("User1 deposits SOL into the vault", async () => {
    const depositAmount = 0.5 * anchor.web3.LAMPORTS_PER_SOL;

    await program.methods
      .depositSol(new anchor.BN(depositAmount))
      .accounts({
        vault: vaultPDA,
        user: user1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user1])
      .rpc();

    // Fetch the vault account
    const vault = await program.account.vault.fetch(vaultPDA);

    // Check updated state
    assert.ok(vault.totalSol.toNumber() === depositAmount);
    assert.ok(vault.contributors.length === 1);
    assert.ok(
      vault.contributors[0].address.toBase58() === user1.publicKey.toBase58()
    );
    assert.ok(vault.contributors[0].amount.toNumber() === depositAmount);

    console.log("User1 deposited SOL successfully");
    console.log("Vault total SOL:", vault.totalSol.toNumber());
    console.log(
      "Contributor:",
      vault.contributors[0].address.toBase58(),
      "Amount:",
      vault.contributors[0].amount.toNumber()
    );
  });

  it("User2 deposits SOL into the vault", async () => {
    const depositAmount = 0.3 * anchor.web3.LAMPORTS_PER_SOL;

    await program.methods
      .depositSol(new anchor.BN(depositAmount))
      .accounts({
        vault: vaultPDA,
        user: user2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user2])
      .rpc();

    // Fetch the vault account
    const vault = await program.account.vault.fetch(vaultPDA);

    // Check updated state
    const expectedTotal =
      0.5 * anchor.web3.LAMPORTS_PER_SOL + 0.3 * anchor.web3.LAMPORTS_PER_SOL;
    assert.ok(vault.totalSol.toNumber() === expectedTotal);
    assert.ok(vault.contributors.length === 2);

    // Find user2's contribution
    const contribIndex = vault.contributors.findIndex(
      (c) => c.address.toBase58() === user2.publicKey.toBase58()
    );
    assert.ok(contribIndex !== -1);
    assert.ok(
      vault.contributors[contribIndex].amount.toNumber() === depositAmount
    );

    console.log("User2 deposited SOL successfully");
    console.log("Vault total SOL:", vault.totalSol.toNumber());
    console.log(
      "Contributor:",
      vault.contributors[contribIndex].address.toBase58(),
      "Amount:",
      vault.contributors[contribIndex].amount.toNumber()
    );
  });

  it("Distributes 50% of the vault to a winner", async () => {
    // We know the winner will be user1 due to our adjusted selection logic
    const winner = user1;

    // Call the distribute_50 function
    await program.methods
      .distribute50()
      .accounts({
        vault: vaultPDA,
        winner: winner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch the vault account
    const vaultAfter = await program.account.vault.fetch(vaultPDA);

    // Expected vault total after distribution
    const expectedVaultTotal =
      (0.5 * anchor.web3.LAMPORTS_PER_SOL + 0.3 * anchor.web3.LAMPORTS_PER_SOL) /
      2;

    // Check updated state
    assert.ok(vaultAfter.totalSol.toNumber() === expectedVaultTotal);

    console.log("Distributed 50% of the vault successfully");
    console.log(
      "Vault total SOL after distribution:",
      vaultAfter.totalSol.toNumber()
    );
  });

  it("Distributes 100% of the vault to a winner", async () => {
    // The winner will again be user1
    const winner = user1;

    // Call the distribute_100 function
    await program.methods
      .distribute100()
      .accounts({
        vault: vaultPDA,
        winner: winner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch the vault account
    const vaultAfter = await program.account.vault.fetch(vaultPDA);

    // Check updated state
    assert.ok(vaultAfter.totalSol.toNumber() === 0);

    console.log("Distributed 100% of the vault successfully");
    console.log(
      "Vault total SOL after distribution:",
      vaultAfter.totalSol.toNumber()
    );
  });

  it("Checks the vault state", async () => {
    // Call the check_vault function
    await program.methods
      .checkVault()
      .accounts({
        vault: vaultPDA,
      })
      .rpc();

    // Fetch the vault account
    const vault = await program.account.vault.fetch(vaultPDA);

    // Check the state
    console.log("Vault total SOL:", vault.totalSol.toNumber());
    console.log("Contributors:");
    for (let contributor of vault.contributors) {
      console.log(
        "Address:",
        contributor.address.toBase58(),
        "Amount:",
        contributor.amount.toNumber()
      );
    }
  });
});
