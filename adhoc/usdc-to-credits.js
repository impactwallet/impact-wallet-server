const mongoose = require('mongoose');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAssociatedTokenAddressSync, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError, createAssociatedTokenAccountInstruction, createMintToInstruction, createTransferInstruction } = require('@solana/spl-token');
const { delay } = require('bluebird');
const axios = require('axios');
const { get, isNil, isEmpty } = require('lodash');
const { decode } = require('bs58');

const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

let rootPk;
let feePayerPk;

mongoose.connect(process.env.MONGODB_URI, null, async (err) => {
  if (err) {
    console.error(err);
    return;
  }
  const rootOrg = await mongoose.connection.collection('orgs').findOne({ wallet: process.env.ROOT_PUBKEY });
  rootPk = await getPK(rootOrg.wallet, rootOrg.password);
  feePayerPk = await getPK(
    process.env.FEE_PAYER,
    process.env.FEE_PAYER_PWD,
  );
  // await processUsers();
  // console.log('users done');
  await processOrgs();
  console.log('orgs done');

  mongoose.disconnect();
});

async function processUsers() {
  const usersCol = mongoose.connection.collection('users');
  
  const usersStream = usersCol.find().stream();
  await new Promise((resolve) => {
    usersStream.on('end', resolve);
    usersStream.on('data', async (user) => {
      try {
        usersStream.pause();

        balance = await getBalance(user.wallet);
        balance = Number.parseInt(balance.amount);
        if (balance > 0) {
          const senderPk = await getPK(user.wallet, user.password);
          await transfer(process.env.USDC_MINT, [{ senderPk, wallet: process.env.ROOT_PUBKEY, amount: balance }]);
          await mintToken(process.env.CREDITS_MINT, rootPk, [{ wallet: user.wallet, amount: balance }]);
        }
      } finally {
        usersStream.resume();
      }
    });
  });
}

async function processOrgs() {
  const orgsCol = mongoose.connection.collection('orgs');
  
  const orgsStream = orgsCol.find().stream();
  await new Promise((resolve) => {
    orgsStream.on('end', resolve);
    orgsStream.on('data', async (org) => {
      try {
        if (org.wallet !== process.env.ROOT_PUBKEY) {
          orgsStream.pause();

          balance = await getBalance(org.wallet);
          balance = Number.parseInt(balance.amount);
          if (balance > 0) {
            const senderPk = await getPK(org.wallet, org.password);
            await transfer(process.env.USDC_MINT, [{ senderPk, wallet: process.env.ROOT_PUBKEY, amount: balance }]);
            await mintToken(process.env.CREDITS_MINT, rootPk, [{ wallet: org.wallet, amount: balance }]);
          }
        }
      } finally {
        orgsStream.resume();
      }
    });
  });
}

async function getBalance(wallet) {
  try {
    await delay(1000);
    const associatedAddress = await getAssociatedTokenAddress(
      new PublicKey(process.env.USDC_MINT),
      new PublicKey(wallet),
    );
    const balance = await connection.getTokenAccountBalance(
      associatedAddress,
    );
    return balance.value;
  } catch (err) {
    if (err.code === -32602) {
      return { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' };
    } else {
      console.log(`Error getting token balance: ${err.message}`);
      return { amount: '0', decimals: 0, uiAmount: 0, uiAmountString: '0' };
    }
  }
}

async function getPK(wallet, password) {
  const config = {
    headers: {
      'x-api-key': process.env.SHYFT_KEY,
    },
    params: {
      wallet,
      password,
    },
  };

  try {
    const response = await axios.get(`https://api.shyft.to/sol/v1/semi_wallet/get_keypair`, config);
    return get(response, 'data.result.secretKey');
  } catch (err) {
    err.message = `Error getting wallet PK: ${err.message}`;
    console.log(JSON.stringify(get(err, 'response.data', err)));
    throw err;
  }
}

async function mintToken(
  mint,
  authorityPk,
  receivers,
) {
  try {
    if (isEmpty(receivers)) {
      return;
    }
    const authorityKeypair = Keypair.fromSecretKey(decode(authorityPk));
    const payer = new PublicKey(process.env.FEE_PAYER);
    const txn = new Transaction();
    const promises = receivers.map(async ({ wallet, amount }) => {
      console.log('mint amount:', amount);
      console.log('mint to wallet:', wallet);
      const associatedTokenAddress = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(wallet),
      );
      try {
        await getAccount(connection, associatedTokenAddress);
      } catch (error) {
        if (
          error instanceof TokenAccountNotFoundError ||
          error instanceof TokenInvalidAccountOwnerError
        ) {
          txn.add(
            createAssociatedTokenAccountInstruction(
              payer,
              associatedTokenAddress,
              new PublicKey(wallet),
              new PublicKey(mint),
            ),
          );
        }
      }
      txn.add(
        createMintToInstruction(
          new PublicKey(mint),
          associatedTokenAddress,
          new PublicKey(authorityKeypair.publicKey),
          amount,
        ),
      );
    });
    await Promise.all(promises);
    const blockhash = connection.getLatestBlockhash('finalized');
    txn.recentBlockhash = blockhash.blockhash;
    txn.feePayer = payer;
    const txnHash = await sendTxn(txn, [
      authorityKeypair,
      Keypair.fromSecretKey(decode(feePayerPk)),
    ]);
    return txnHash;
  } catch (err) {
    err.message = `Error minting token: ${err.message}`;
    throw err;
  }
}

async function sendTxn(txn, signers) {
  try {
    const txnHash = await sendAndConfirmTransaction(
      connection,
      txn,
      signers,
    );
    return txnHash;
  } catch (err) {
    err.message = `Error sending transaction: ${err.message}`;
    throw err;
  }
}

async function transfer(
  mint,
  recepients,
) {
  try {
    const txn = new Transaction();
    const transferInstructions = await createTransferInstructions(
      mint,
      recepients,
    );
    transferInstructions.forEach((instruction) => {
      txn.add(instruction);
    });

    const blockhash = await connection.getLatestBlockhash('finalized');
    txn.recentBlockhash = blockhash.blockhash;
    txn.feePayer = new PublicKey(process.env.FEE_PAYER);

    const signers = recepients.map(({ senderPk }) =>
      Keypair.fromSecretKey(decode(senderPk)),
    );
    const signature = await sendTxn(txn, [
      ...signers,
      Keypair.fromSecretKey(decode(feePayerPk)),
    ]);
    return signature;
  } catch (err) {
    err.message = `Error transferring tokens: ${err.message}`;
    throw err;
  }
}

async function createTransferInstructions(
  mint,
  recepients,
) {
  const mintPublicKey = new PublicKey(mint);
  const instructionsPromises = recepients.map(
    async ({ senderPk, wallet, amount }) => {
      const senderKeypair = Keypair.fromSecretKey(decode(senderPk));
      const senderAssociatedTokenAddress = await getAssociatedTokenAddress(
        mintPublicKey,
        senderKeypair.publicKey,
      );
      const recipientPublicKey = new PublicKey(wallet);

      const recipientAssociatedTokenAddress = await getAssociatedTokenAddress(
        mintPublicKey,
        recipientPublicKey,
      );

      return createTransferInstruction(
        senderAssociatedTokenAddress,
        recipientAssociatedTokenAddress,
        senderKeypair.publicKey,
        amount,
      );
    },
  );
  return Promise.all(instructionsPromises);
}