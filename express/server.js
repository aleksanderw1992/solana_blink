// server.js

import express from "express";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
  setProvider,
  web3,
} from "@coral-xyz/anchor";
import BN from "bn.js"; // Import BN from 'bn.js'
import { createPostResponse, actionCorsMiddleware } from "@solana/actions";

const DEFAULT_SOL_ADDRESS = Keypair.generate().publicKey;
const DEFAULT_SOL_AMOUNT = 1;

// **Connect to Local Solana Validator**
const connection = new Connection("http://127.0.0.1:8899"); // Local validator URL

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

// **Anchor Program Setup**
const PROGRAM_ID = new PublicKey(
  "AH4vTxcx557pVqWXsdXp9mqxb73SayXrb1gf9ugbWp9W"
);
const VAULT_SEED = "vault";

// **Your Program's IDL**
const idl = {
  // Ensure this IDL matches your deployed program
  "version": "0.0.0",
  "name": "solana_vault",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "vault", "isMut": true, "isSigner": false },
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "depositSol",
      "accounts": [
        { "name": "vault", "isMut": true, "isSigner": false },
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [{ "name": "amount", "type": "u64" }]
    },
    {
      "name": "distribute50",
      "accounts": [
        { "name": "vault", "isMut": true, "isSigner": false },
        { "name": "winner", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "distribute100",
      "accounts": [
        { "name": "vault", "isMut": true, "isSigner": false },
        { "name": "winner", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "checkVault",
      "accounts": [{ "name": "vault", "isMut": false, "isSigner": false }],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "bump", "type": "u8" },
          { "name": "totalSol", "type": "u64" },
          {
            "name": "contributors",
            "type": { "vec": { "defined": "Contributor" } }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "Contributor",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "address", "type": "publicKey" },
          { "name": "amount", "type": "u64" }
        ]
      }
    }
  ],
  "errors": [
    { "code": 6000, "name": "VaultEmpty", "msg": "The vault is empty." },
    { "code": 6001, "name": "InvalidWinner", "msg": "Invalid winner." }
  ],
  "metadata": {
    "address": "AH4vTxcx557pVqWXsdXp9mqxb73SayXrb1gf9ugbWp9W"
  }
};

// **Define a Dummy Wallet**
const dummyWallet = {
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
  publicKey: new PublicKey("11111111111111111111111111111111"), // Using a placeholder public key
};

// **Set Up Anchor Provider and Program**
const provider = new AnchorProvider(
  connection,
  dummyWallet,
  AnchorProvider.defaultOptions()
);
setProvider(provider);
const program = new Program(idl, PROGRAM_ID, provider);

// Express app setup
const app = express();
app.use(express.json());
let index = 0;

// **Serve Static Images**
// Available at http://localhost:8080/static/board_1.jpg
app.use("/static", express.static("jpges"));

/**
 * The `actionCorsMiddleware` middleware will provide the correct CORS settings for Action APIs
 * so you do not need to use an additional `cors` middleware if you do not require it for other reasons
 */
app.use(actionCorsMiddleware());

// Routes
app.get("/actions.json", getActionsJson);
app.get("/api/actions/transfer-sol", getTransferSol);
app.post("/api/actions/transfer-sol", postTransferSol);

// Route handlers
function getActionsJson(req, res) {
  const payload = {
    rules: [
      { pathPattern: "/*", apiPath: "/api/actions/*" },
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  };
  res.json(payload);
}

async function getTransferSol(req, res) {
  try {
    const { toPubkey } = validatedQueryParams(req.query);
    const baseHref = `${BASE_URL}/api/actions/transfer-sol?to=${toPubkey.toBase58()}`;

    let actions = [
      { label: "Send 0.01 SOL", href: `${baseHref}&amount=0.01` },
      { label: "Send 0.05 SOL", href: `${baseHref}&amount=0.05` },
      { label: "Send 0.1 SOL", href: `${baseHref}&amount=0.1` },
    ];
    if ((index + 1) % 10 == 0 && index + 1 != 100) {
      actions.push(
        {
          label: "Send 0.01 SOL and distribute 50% of vault to one of users",
          href: `${baseHref}&amount=0.01&distribute=true`,
        },
        {
          label: "Send 0.05 SOL and distribute 50% of vault to one of users",
          href: `${baseHref}&amount=0.05&distribute=true`,
        },
        {
          label: "Send 0.1 SOL and distribute 50% of vault to one of users",
          href: `${baseHref}&amount=0.1&distribute=true`,
        }
      );
    }
    if (index == 2) {
      actions.push({
        label: "Reset for 0.1 fee",
        href: `${baseHref}&amount=0.01&reset=true`,
      });
    }
    const payload = {
      type: "action",
      title: "Actions Example - Transfer Native SOL",
      icon: `${BASE_URL}/static/board_${(index % 100) + 1}.jpg`,
      description: "Transfer SOL to another Solana wallet",
      links: {
        actions: actions,
      },
    };

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || err });
  }
}

async function postTransferSol(req, res) {
  try {
    const { amount, toPubkey, distribute, reset } = validatedQueryParams(
      req.query
    );
    const { account } = req.body;

    if (!account) {
      throw new Error('Invalid "account" provided');
    }

    const fromPubkey = new PublicKey(account);
    const minimumBalance = await connection.getMinimumBalanceForRentExemption(0);

    console.log(
      "amount, actual, distribute, reset",
      amount,
      amount * LAMPORTS_PER_SOL,
      distribute,
      reset
    );
    if (amount * LAMPORTS_PER_SOL < minimumBalance) {
      throw new Error(
        `Account may not be rent exempt: ${toPubkey.toBase58()}`
      );
    }

    if (reset) {
      index = 0; // Reset the index without calling the contract
      return res.json({ message: "Index reset to 0" });
    }

    // Derive the vault PDA
    const [vaultPDA, vaultBump] = await PublicKey.findProgramAddress(
      [Buffer.from(VAULT_SEED)],
      PROGRAM_ID
    );

    let transaction = new Transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    if (distribute) {
      // **Call `distribute_50` from the Solana program**
      console.log("Distributing 50% of the vault");

      // Fetch vault account data
      const vaultAccount = await program.account.vault.fetchNullable(vaultPDA);
      if (!vaultAccount) {
        throw new Error("Vault is not initialized.");
      }
      const contributors = vaultAccount.contributors;

      if (contributors.length === 0) {
        throw new Error("No contributors found in the vault.");
      }

      // Assuming the winner is the first contributor (as per your selection logic)
      const winnerPubkey = new PublicKey(contributors[0].address);

      // Create the instruction
      const instruction = program.instruction.distribute50({
        accounts: {
          vault: vaultPDA,
          winner: winnerPubkey,
        },
      });

      transaction.add(instruction);
    } else if (index === 99) {
      // **Call `distribute_100` from the Solana program**
      console.log("Distributing 100% of the vault");

      // Fetch vault account data
      const vaultAccount = await program.account.vault.fetchNullable(vaultPDA);
      if (!vaultAccount) {
        throw new Error("Vault is not initialized.");
      }
      const contributors = vaultAccount.contributors;

      if (contributors.length === 0) {
        throw new Error("No contributors found in the vault.");
      }

      // Assuming the winner is the first contributor
      const winnerPubkey = new PublicKey(contributors[0].address);

      // Create the instruction
      const instruction = program.instruction.distribute100({
        accounts: {
          vault: vaultPDA,
          winner: winnerPubkey,
        },
      });

      transaction.add(instruction);
    } else {
      // **Call `deposit_sol` from the Solana program (default action)**
      console.log("Depositing SOL to the vault");

      // Check if the vault account exists, if not, initialize it
      const vaultAccount = await program.account.vault.fetchNullable(vaultPDA);
      if (!vaultAccount) {
        console.log("Initializing the vault");
        const initializeInstruction = program.instruction.initialize({
          accounts: {
            vault: vaultPDA,
            user: fromPubkey,
            systemProgram: web3.SystemProgram.programId,
          },
        });
        transaction.add(initializeInstruction);
      }

      const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      const depositInstruction = program.instruction.depositSol(
        new BN(amountLamports), // Using BN from 'bn.js'
        {
          accounts: {
            vault: vaultPDA,
            user: fromPubkey,
            systemProgram: web3.SystemProgram.programId,
          },
        }
      );

      transaction.add(depositInstruction);
    }

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const base64Transaction = serializedTransaction.toString("base64");

    const payload = await createPostResponse({
      fields: {
        transaction: base64Transaction,
        message: `Processed ${distribute ? "distribute" : "deposit"} action`,
      },
    });

    index++;
    res.json(payload);
  } catch (err) {
    console.error(err);
    res
      .status(400)
      .json({ error: err.message || "An unknown error occurred" });
  }
}

function validatedQueryParams(query) {
  let toPubkey = DEFAULT_SOL_ADDRESS;
  let amount = DEFAULT_SOL_AMOUNT;
  console.log("validatedQueryParams", query);
  if (query.to) {
    try {
      toPubkey = new PublicKey(query.to);
    } catch (err) {
      throw new Error("Invalid input query parameter: to");
    }
  }

  try {
    if (query.amount) {
      amount = parseFloat(query.amount);
    }
    if (amount <= 0) throw new Error("amount is too small");
  } catch (err) {
    throw new Error("Invalid input query parameter: amount");
  }
  let distribute = query.distribute ? query.distribute === "true" : false;
  let reset = query.reset ? query.reset === "true" : false;
  return { amount, toPubkey, distribute, reset };
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
