# Solana Action: Transfer SOL

## Source
https://github.com/solana-developers/solana-actions.git 

This example demonstrates a Solana Action built with Node.js using the Express
framework. It provides an API endpoint for transferring SOL.

## Setup

Navigate to `./examples/express`.

Install dependencies:

```
npm install
```

Start the application:

```
npm start
```

The server will start running on http://localhost:8080.

The endpoint for the Action is: nbv vt

You can test the Action on devnet as a Blink at https://dial.to/devnet:
https://www.dial.to/devnet?action=solana-action%3Ahttp%3A%2F%2Flocalhost%3A8080%2Fapi%2Factions%2Ftransfer-sol

## More

See:
https://drive.google.com/file/d/197h_LWWZM0Hxf_elG6j_wYA36E9JEM-c/view?usp=sharing

I will quickly explain the idea of the blink. It is the board that has 10 rows and 10 columns. Users can pay SOL to move cursor forward. Those pays stay in the vault. When the game is over - it is on 100th square, the SOL gathered in vault is distributed to one user based on the probability and amount the SOL that is staked. After each line 50% the vault is also distributed to one user.