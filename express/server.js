import express from "express";
import {
  Connection,
  Keypair,
  PublicKey,
  // SystemProgram,
  TransactionInstruction,
  Transaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createPostResponse, actionCorsMiddleware } from "@solana/actions";

const DEFAULT_SOL_ADDRESS = Keypair.generate().publicKey;
const DEFAULT_SOL_AMOUNT = 1;
const connection = new Connection(clusterApiUrl("devnet"));

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;

// Express app setup
const app = express();
app.use(express.json());
// available at http://localhost:8080/static/board_1.jpg
app.use('/static', express.static('jpges'))
let index = 0;

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
    if((index+1)%10 ==0 && (index+1 != 100)) {
      actions.push(
      { label: "Send 0.01 SOL and distribute 50% of vault to one of users", href: `${baseHref}&amount=0.01&distribute=true` },
      { label: "Send 0.05 SOL and distribute 50% of vault to one of users", href: `${baseHref}&amount=0.05&distribute=true` },
      { label: "Send 0.1 SOL and distribute 50% of vault to one of users", href: `${baseHref}&amount=0.1&distribute=true` },)
    }
    // reset will occur very rare and no more than once every 10 games
    if(index==2) {
      actions.push({ label: "Reset for 0.1 fee", href: `${baseHref}&amount=0.01&reset=true` });
    }
    const payload = {
      type: "action",
      title: "Actions Example - Transfer Native SOL",
      icon: `${BASE_URL}/static/board_${index+1}.jpg`,
      description: "Transfer SOL to another Solana wallet",
      links: {
        actions: actions,
      },
    };

    res.json(payload);
  } catch (err) {
    console.error(err);
    // handleError(res, err);
    res.status(500).json({ message: err?.message || err });
  }
}

const PROGRAM_ID = new PublicKey("AH4vTxcx557pVqWXsdXp9mqxb73SayXrb1gf9ugbWp9W");
const VAULT_PUBKEY = new PublicKey("CpSBsBdSB53d8cVs1GePTVPJp6Ejxzx6wWRng6p8zdGn");

async function postTransferSol(req, res) {
  try {
    const { amount, toPubkey, distribute, reset } = validatedQueryParams(req.query);
    const { account } = req.body;

    if (!account) {
      throw new Error('Invalid "account" provided');
    }

    const fromPubkey = new PublicKey(account);
    const minimumBalance = await connection.getMinimumBalanceForRentExemption(0);

    console.log('amount, actual, distribute, reset', amount, amount * LAMPORTS_PER_SOL, distribute, reset);
    if (amount * LAMPORTS_PER_SOL < minimumBalance) {
      throw new Error(`Account may not be rent exempt: ${toPubkey.toBase58()}`);
    }

    if (reset) {
      index = 0; // Reset the index without calling the contract
      return res.json({ message: "Index reset to 0" });
    }

    let transaction;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    if (distribute) {
      // Call `distribute_50` from the Solana program
      console.log("Distributing 50% of the vault");
      transaction = new Transaction({
        feePayer: fromPubkey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        new TransactionInstruction({
          programId: PROGRAM_ID, // Use the constant program ID
          keys: [
            { pubkey: VAULT_PUBKEY, isSigner: false, isWritable: true }, // Vault account
            { pubkey: fromPubkey, isSigner: true, isWritable: true }, // Sender who is also the winner
          ],
          data: Buffer.from([1]), // Call `distribute_50` (this instruction will correspond to the `distribute_50` method)
        })
      );
    } else if (index === 99) {
      // Call `distribute_100` from the Solana program
      console.log("Distributing 100% of the vault");
      transaction = new Transaction({
        feePayer: fromPubkey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: VAULT_PUBKEY, isSigner: false, isWritable: true }, // Vault account
            { pubkey: fromPubkey, isSigner: true, isWritable: true }, // Sender who is also the winner
          ],
          data: Buffer.from([2]), // Call `distribute_100` (this instruction will correspond to the `distribute_100` method)
        })
      );
    } else {
      // Call `deposit_sol` from the Solana program (default action)
      console.log("Depositing SOL to the vault");
      transaction = new Transaction({
        feePayer: fromPubkey,
        blockhash,
        lastValidBlockHeight,
      }).add(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: VAULT_PUBKEY, isSigner: false, isWritable: true }, // Vault account
            { pubkey: fromPubkey, isSigner: true, isWritable: true }, // Sender
          ],
          data: Buffer.from([0, ...new Uint8Array(new BN(amount).toArray("le", 8))]),
          // Call `deposit_sol` with the amount
        })
      );
    }

    const payload = await createPostResponse({
      fields: {
        transaction,
        message: `Processed ${distribute ? "distribute" : "deposit"} action`,
      },
    });

    index++;
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message || "An unknown error occurred" });
  }
}


function validatedQueryParams(query) {
  let toPubkey = DEFAULT_SOL_ADDRESS;
  let amount = DEFAULT_SOL_AMOUNT;
  console.log('validatedQueryParams', query)
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
  let distribute = query.distribute ? query.distribute === 'true': false;
  let reset = query.reset ? query.reset === 'true': false;
  return { amount, toPubkey, distribute, reset };
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
