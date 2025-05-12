import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  getAccount,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { assert } from "chai";
import { TrinitySolana } from "../target/types/trinity_solana";
import { mintNftTo } from "./utils";

// Tests for the happy path of the program
// This test suite will cover the following scenarios:
// Two users participating in a challenge and p1 winning
// Service fee is paid to treasury address
describe("happy-path", () => {
  // Set the provider to the default local validator
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrinitySolana as Program<TrinitySolana>;

  const apiSigners: Keypair[] = [];
  const moderatorSigners: Keypair[] = [];
  const unauthorisedKeypair = Keypair.generate();

  const chainId = new Array(16).fill(0);

  const challengeId = 0; // u64
  const p1Fee = 5000000; // u64
  const p2Fee = 5000000; // u64
  const p1 = Keypair.generate();
  const p2 = Keypair.generate();

  const treasury = Keypair.generate();

  let p1Nft: Awaited<ReturnType<typeof mintNftTo>>;
  let p2Nft: Awaited<ReturnType<typeof mintNftTo>>;

  for (let i = 0; i < 10; i++) {
    apiSigners.push(anchor.web3.Keypair.generate());
    moderatorSigners.push(anchor.web3.Keypair.generate());
  }

  const TEN_SOL = 10000000000;

  before(async () => {
    // Airdrop some SOL to the unauthorised address
    provider.connection.requestAirdrop(unauthorisedKeypair.publicKey, TEN_SOL);

    // Set up the program
    await program.methods
      .initializeConfig({
        chainId,
        treasury: treasury.publicKey,
      })
      .rpc();

    // Add an API signer
    await program.methods.addApiSigner(apiSigners[0].publicKey).rpc();

    // Add 4 moderator signers
    for (let i = 0; i < 4; i++) {
      await program.methods
        .addModeratorSigner(moderatorSigners[i].publicKey)
        .rpc();
    }

    // Airdrop some SOL to the API signers and moderator signers
    await Promise.all(
      apiSigners.map((signer) =>
        provider.connection.requestAirdrop(signer.publicKey, TEN_SOL)
      )
    );
    await Promise.all(
      moderatorSigners.map((signer) =>
        provider.connection.requestAirdrop(signer.publicKey, TEN_SOL)
      )
    );
    await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      1000000000
    );
    await provider.connection.requestAirdrop(p1.publicKey, TEN_SOL);
    await provider.connection.requestAirdrop(p2.publicKey, TEN_SOL);

    // Mint an NFT to p1
    p1Nft = await mintNftTo(provider, p1.publicKey, provider.wallet.payer);
    // Mint an NFT to p2
    p2Nft = await mintNftTo(provider, p2.publicKey, provider.wallet.payer);
  });

  describe("preparation", () => {
    it("should have set up correctly", async () => {
      const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        program.programId
      );
      const config = await program.account.config.fetch(configPda);
      assert.equal(config.treasury.toBase58(), treasury.publicKey.toBase58());
      assert.equal(config.chainId.length, 16);
      assert.equal(config.apiSigners.length, 1);
      assert.equal(config.moderatorSigners.length, 4);

      // Check that the API signers and moderator signers are correct
      assert.equal(
        config.apiSigners[0].toBase58(),
        apiSigners[0].publicKey.toBase58()
      );
      assert.equal(
        config.moderatorSigners[0].toBase58(),
        moderatorSigners[0].publicKey.toBase58()
      );
      assert.equal(
        config.moderatorSigners[1].toBase58(),
        moderatorSigners[1].publicKey.toBase58()
      );
      assert.equal(
        config.moderatorSigners[2].toBase58(),
        moderatorSigners[2].publicKey.toBase58()
      );
      assert.equal(
        config.moderatorSigners[3].toBase58(),
        moderatorSigners[3].publicKey.toBase58()
      );

      // Check balance of api signers and moderator signers
      const apiSignerBalance = await provider.connection.getBalance(
        apiSigners[0].publicKey
      );
      const moderatorSignerBalance = await provider.connection.getBalance(
        moderatorSigners[0].publicKey
      );
      assert.equal(apiSignerBalance, TEN_SOL);
      assert.equal(moderatorSignerBalance, TEN_SOL);

      // Check balance of p1 and p2
      const p1Balance = await provider.connection.getBalance(p1.publicKey);
      const p2Balance = await provider.connection.getBalance(p2.publicKey);
      assert.equal(p1Balance, TEN_SOL);
      assert.equal(p2Balance, TEN_SOL);

      // Check p1 and p2 have NFTs
      const p1NftAccount =
        await program.provider.connection.getParsedAccountInfo(
          p1Nft.tokenAccount
        );
      const p2NftAccount =
        await program.provider.connection.getParsedAccountInfo(
          p2Nft.tokenAccount
        );
      assert.equal(
        (p1NftAccount.value?.data as any).parsed.info.owner,
        p1.publicKey.toBase58()
      );
      assert.equal(
        (p2NftAccount.value?.data as any).parsed.info.owner,
        p2.publicKey.toBase58()
      );
    });
  });

  describe("initializeChallenge", () => {
    it("should fail if api signer is not authorized", async () => {
      try {
        await program.methods
          .initializeChallenge(
            new anchor.BN(challengeId),
            new anchor.BN(p1Fee),
            new anchor.BN(p2Fee),
            p1Nft.mint,
            p2Nft.mint
          )
          .accounts({
            p1: p1.publicKey,
            p2: p2.publicKey,
            apiSigner: unauthorisedKeypair.publicKey,
          })
          .signers([p1, unauthorisedKeypair])
          .rpc();
        assert.fail("Challenge should not have initialized");
      } catch (error) {
        assert.include(
          error.message,
          "Signer is not in the trusted API signer list"
        );
      }
    });

    it("should initialize a challenge successfully", async () => {
      try {
        await program.methods
          .initializeChallenge(
            new anchor.BN(challengeId),
            new anchor.BN(p1Fee),
            new anchor.BN(p2Fee),
            p1Nft.mint,
            p2Nft.mint
          )
          .accounts({
            p1: p1.publicKey,
            p2: p2.publicKey,
            apiSigner: apiSigners[0].publicKey,
          })
          .signers([p1, apiSigners[0]])
          .rpc();

        // Check that the challenge was initialized successfully
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const challenge = await program.account.challenge.fetch(challengePda);

        assert.exists(challenge, "Challenge account should exist");
        assert.equal(challenge.p1.toBase58(), p1.publicKey.toBase58());
        assert.equal(challenge.p2.toBase58(), p2.publicKey.toBase58());
        assert.equal(challenge.challengeId.toString(), challengeId.toString());
        assert.equal(challenge.p1Fee.toString(), p1Fee.toString());
        assert.equal(challenge.p2Fee.toString(), p2Fee.toString());
        assert.equal(challenge.p1Paid, false);
        assert.equal(challenge.p2Paid, false);
        assert.equal(challenge.nft1Mint.toBase58(), p1Nft.mint.toBase58());
        assert.equal(challenge.nft2Mint.toBase58(), p2Nft.mint.toBase58());
        assert.equal(
          JSON.stringify(challenge.nft1Status),
          JSON.stringify({ notDeposited: {} })
        );
        assert.equal(
          JSON.stringify(challenge.nft2Status),
          JSON.stringify({ notDeposited: {} })
        );
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ pendingFee: {} })
        );
        assert.equal(challenge.winner, null);
        assert.equal(challenge.moderatorVotes.length, 0);
        assert.equal(challenge.votesForP1, 0);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 0);
      } catch (error) {
        console.error("Error initializing challenge:", error);
        assert.fail("Failed to initialize challenge");
      }
    });

    it("should fail if challenge already exists", async () => {
      try {
        await program.methods
          .initializeChallenge(
            new anchor.BN(challengeId),
            new anchor.BN(p1Fee),
            new anchor.BN(p2Fee),
            p1Nft.mint,
            p2Nft.mint
          )
          .accounts({
            p1: p1.publicKey,
            p2: p2.publicKey,
            apiSigner: apiSigners[0].publicKey,
          })
          .signers([p1, apiSigners[0]])
          .rpc();
        assert.fail("Challenge should not have initialized");
      } catch (error) {
        assert.isTrue(true, "Challenge already exists");
      }
    });

    it("should success and set fee as paid if fees are 0", async () => {
      try {
        await program.methods
          .initializeChallenge(
            new anchor.BN(challengeId + 1),
            new anchor.BN(0),
            new anchor.BN(0),
            p1Nft.mint,
            p2Nft.mint
          )
          .accounts({
            p1: p1.publicKey,
            p2: p2.publicKey,
            apiSigner: apiSigners[0].publicKey,
          })
          .signers([p1, apiSigners[0]])
          .rpc();

        // Check that the challenge was initialized successfully
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId + 1).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const challenge = await program.account.challenge.fetch(challengePda);

        assert.exists(challenge, "Challenge account should exist");
        assert.equal(challenge.p1Fee.toString(), "0");
        assert.equal(challenge.p2Fee.toString(), "0");
        assert.equal(challenge.p1Paid, true);
        assert.equal(challenge.p2Paid, true);

        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ pendingEscrow: {} })
        );
      } catch (error) {
        console.error("Error initializing challenge:", error);
        assert.fail("Failed to initialize challenge");
      }
    });
  });

  describe("payServiceFee", () => {
    it("should fail if called by unauthorised user", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("config")],
          program.programId
        );
        const config = await program.account.config.fetch(configPda);

        await program.methods
          .payServiceFee()
          .accountsPartial({
            payer: unauthorisedKeypair.publicKey,
            challenge: challengePda,
            treasury: config.treasury.toBase58(),
          })
          .signers([unauthorisedKeypair])
          .rpc();
        assert.fail("Service fee should not have been paid");
      } catch (error) {
        assert.include(error.message, "Invalid payer");
      }
    });

    it("should succeed if called by p1", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("config")],
          program.programId
        );
        const config = await program.account.config.fetch(configPda);

        await program.methods
          .payServiceFee()
          .accountsPartial({
            payer: p1.publicKey,
            challenge: challengePda,
            treasury: config.treasury.toBase58(),
          })
          .signers([p1])
          .rpc();

        // Check that the service fee was paid successfully
        const challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.p1Paid, true);
        assert.equal(challenge.p2Paid, false);

        // Check fee was transferred to treasury
        const treasuryBalance = await provider.connection.getBalance(
          config.treasury
        );
        assert.equal(
          treasuryBalance,
          p1Fee,
          "Treasury balance should be updated"
        );
      } catch (error) {
        console.error("Error paying service fee:", error);
        assert.fail("Failed to pay service fee");
      }
    });

    it("should succeed if called by p2", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("config")],
          program.programId
        );
        const config = await program.account.config.fetch(configPda);

        await program.methods
          .payServiceFee()
          .accountsPartial({
            payer: p2.publicKey,
            challenge: challengePda,
            treasury: config.treasury.toBase58(),
          })
          .signers([p2])
          .rpc();

        // Check that the service fee was paid successfully
        const challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.p1Paid, true);
        assert.equal(challenge.p2Paid, true);
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ pendingEscrow: {} })
        );

        // Check fee was transferred to treasury
        const treasuryBalance = await provider.connection.getBalance(
          config.treasury
        );
        assert.equal(
          treasuryBalance,
          p1Fee + p2Fee,
          "Treasury balance should be updated"
        );
      } catch (error) {
        console.error("Error paying service fee:", error);
        assert.fail("Failed to pay service fee");
      }
    });
  });

  describe("depositNft", () => {
    it("should fail if called by unauthorised user", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        // Derive the escrow PDA with same seeds used in your program
        const [escrowTokenAccount] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p1Nft.mint.toBuffer(),
            ],
            program.programId
          );

        await program.methods
          .depositNft()
          .accountsPartial({
            depositor: unauthorisedKeypair.publicKey,
            challenge: challengePda,
            fromTokenAccount: p1Nft.tokenAccount,
            escrowTokenAccount,
            nftMint: p1Nft.mint,
          })
          .signers([unauthorisedKeypair])
          .rpc();
        assert.fail("NFT should not have been deposited");
      } catch (error) {
        assert.include(error.message, "Invalid payer");
      }
    });

    it("should succeed if called by p1", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        // Derive the escrow PDA with same seeds used in your program
        const [escrowTokenAccount] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p1Nft.mint.toBuffer(),
            ],
            program.programId
          );

        await program.methods
          .depositNft()
          .accountsPartial({
            depositor: p1.publicKey,
            challenge: challengePda,
            fromTokenAccount: p1Nft.tokenAccount,
            escrowTokenAccount,
            nftMint: p1Nft.mint,
          })
          .signers([p1])
          .rpc();

        // Check that the NFT was deposited successfully
        const challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(
          JSON.stringify(challenge.nft1Status),
          JSON.stringify({ deposited: {} })
        );

        const escrow = await getAccount(
          provider.connection,
          escrowTokenAccount
        );
        assert.equal(escrow.owner.toBase58(), challengePda.toBase58());
        assert.equal(escrow.amount, BigInt(1));
      } catch (error) {
        console.error("Error depositing NFT:", error);
        assert.fail("Failed to deposit NFT");
      }
    });

    it("should succeed if called by p2", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        // Derive the escrow PDA with same seeds used in your program
        const [escrowTokenAccount] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p2Nft.mint.toBuffer(),
            ],
            program.programId
          );

        await program.methods
          .depositNft()
          .accountsPartial({
            depositor: p2.publicKey,
            challenge: challengePda,
            fromTokenAccount: p2Nft.tokenAccount,
            escrowTokenAccount,
            nftMint: p2Nft.mint,
          })
          .signers([p2])
          .rpc();

        // Check that the NFT was deposited successfully
        const challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(
          JSON.stringify(challenge.nft2Status),
          JSON.stringify({ deposited: {} })
        );

        // Check that the challenge status is updated
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ ready: {} })
        );

        const escrow = await getAccount(
          provider.connection,
          escrowTokenAccount
        );
        assert.equal(escrow.owner.toBase58(), challengePda.toBase58());
        assert.equal(escrow.amount, BigInt(1));
      } catch (error) {
        console.error("Error depositing NFT:", error);
        assert.fail("Failed to deposit NFT");
      }
    });
  });

  describe("resolveChallenge", () => {
    it("should fail if called by unauthorised user", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        await program.methods
          .resolveChallenge(
            1 // 1 for p1, 2 for p2, 3 for cancel
          )
          .accountsPartial({
            moderator: unauthorisedKeypair.publicKey,
            challenge: challengePda,
          })
          .signers([unauthorisedKeypair])
          .rpc();
        assert.fail("Challenge should not have been resolved");
      } catch (error) {
        assert.include(
          error.message,
          "Signer is not in the trusted moderator signer list"
        );
      }
    });

    it("should fail if unknown challenge is in wrong state", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId + 1).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        // check ChallengeId + 1 is not in the right state
        const challenge = await program.account.challenge.fetch(challengePda);
        assert.notEqual(
          JSON.stringify(challenge.status),
          JSON.stringify({ ready: {} })
        );

        await program.methods
          .resolveChallenge(
            1 // 1 for p1, 2 for p2, 3 for cancel
          )
          .accountsPartial({
            moderator: moderatorSigners[0].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[0]])
          .rpc();
        assert.fail("Challenge should not have been resolved");
      } catch (error) {
        assert.include(error.message, "Invalid challenge state");
      }
    });

    it("should allow cancellation of an unready challenge", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId + 1).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        // Check that the challenge is in the correct state
        let challenge = await program.account.challenge.fetch(challengePda);
        assert.notEqual(
          JSON.stringify(challenge.status),
          JSON.stringify({ ready: {} })
        );

        const originalStatus = challenge.status;

        await program.methods
          .resolveChallenge(3) // 1 for p1, 2 for p2, 3 for cancel
          .accountsPartial({
            moderator: moderatorSigners[0].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[0]])
          .rpc();

        // Check that the challenge was resolved successfully
        challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.winner, null);
        assert.equal(challenge.votesForP1, 0);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 1);
        // Challenge status should not have changed yet
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify(originalStatus)
        );

        // vote to cancel with second moderator
        await program.methods
          .resolveChallenge(3) // 1 for p1, 2 for p2, 3 for cancel
          .accountsPartial({
            moderator: moderatorSigners[1].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[1]])
          .rpc();

        // Check that the state was changed successfully
        challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.winner, null);
        assert.equal(challenge.votesForP1, 0);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 2);
        // Challenge status should not have changed yet
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify(originalStatus)
        );

        //* vote to cancel with third moderator
        await program.methods
          .resolveChallenge(3) // 1 for p1, 2 for p2, 3 for cancel
          .accountsPartial({
            moderator: moderatorSigners[2].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[2]])
          .rpc();

        // Check that the state was changed successfully
        challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.winner, null);
        assert.equal(challenge.votesForP1, 0);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 3);
        // Challenge status should be cancelled
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ cancelled: {} })
        );
      } catch (error) {
        console.error("Error resolving challenge:", error);
        assert.fail("Failed to resolve challenge");
      }
    });

    it("should allow p1 to win", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );

        // Check that the challenge is in the correct state
        let challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ ready: {} })
        );

        await program.methods
          .resolveChallenge(1) // 1 for p1, 2 for p2, 3 for cancel
          .accountsPartial({
            moderator: moderatorSigners[0].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[0]])
          .rpc();

        // Check that the challenge was resolved successfully
        challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.winner, null);
        assert.equal(challenge.votesForP1, 1);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 0);

        //* Check that a moderator cant vote twice
        try {
          await program.methods
            .resolveChallenge(1) // 1 for p1, 2 for p2, 3 for cancel
            .accountsPartial({
              moderator: moderatorSigners[0].publicKey,
              challenge: challengePda,
            })
            .signers([moderatorSigners[0]])
            .rpc();
          assert.fail("Challenge should not have been resolved");
        } catch (error) {
          assert.include(error.message, "Already voted");
        }

        // vote with moderator 2 and 3
        await program.methods
          .resolveChallenge(1) // 1 for p1, 2 for p2, 3 for cancel
          .accountsPartial({
            moderator: moderatorSigners[1].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[1]])
          .rpc();
        challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.winner, null);
        assert.equal(challenge.votesForP1, 2);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 0);

        await program.methods
          .resolveChallenge(1) // 1 for p1, 2 for p2, 3 for cancel
          .accountsPartial({
            moderator: moderatorSigners[2].publicKey,
            challenge: challengePda,
          })
          .signers([moderatorSigners[2]])
          .rpc();

        challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(challenge.winner.toBase58(), p1.publicKey.toBase58());
        assert.equal(challenge.votesForP1, 3);
        assert.equal(challenge.votesForP2, 0);
        assert.equal(challenge.votesToCancel, 0);
        // Check that the challenge status is updated
        assert.equal(
          JSON.stringify(challenge.status),
          JSON.stringify({ completed: {} })
        );

        //* Check that it doesn't allow more votes
        try {
          await program.methods
            .resolveChallenge(1) // 1 for p1, 2 for p2, 3 for cancel
            .accountsPartial({
              moderator: moderatorSigners[3].publicKey,
              challenge: challengePda,
            })
            .signers([moderatorSigners[3]])
            .rpc();
          assert.fail("Challenge should not have been resolved");
        } catch (error) {
          assert.include(error.message, "Invalid challenge state");
        }
      } catch (error) {
        console.error("Error resolving challenge:", error);
        assert.fail("Failed to resolve challenge");
      }
    });
  });

  describe("claimRefundNft", () => {
    // TODO!
  });

  describe("claimWinnerNfts", () => {
    it("should fail if called by non-winner", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const [escrowNft1Account] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p1Nft.mint.toBuffer(),
            ],
            program.programId
          );
        const [escrowNft2Account] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p2Nft.mint.toBuffer(),
            ],
            program.programId
          );
        const winnerNft1Account = await getAssociatedTokenAddress(
          p1Nft.mint,
          p2.publicKey
        );
        const winnerNft2Account = await getAssociatedTokenAddress(
          p2Nft.mint,
          p2.publicKey
        );

        await program.methods
          .claimWinnerNfts()
          .accountsPartial({
            claimer: p2.publicKey,
            challenge: challengePda,
            escrowNft1Account,
            escrowNft2Account,
            winnerNft1Account,
            winnerNft2Account,
            nft1Mint: p1Nft.mint,
            nft2Mint: p2Nft.mint,
          })
          .signers([p2])
          .rpc();
        assert.fail("NFT should not have been claimed");
      } catch (error) {
        assert.include(error.message, "Invalid payer");
      }
    });

    it("should succeed if called by winner", async () => {
      try {
        const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("challenge"),
            p1.publicKey.toBuffer(),
            new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        );
        const [escrowNft1Account] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p1Nft.mint.toBuffer(),
            ],
            program.programId
          );
        const [escrowNft2Account] =
          anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("escrow"),
              challengePda.toBuffer(),
              p2Nft.mint.toBuffer(),
            ],
            program.programId
          );
        const winnerNft1Account = getAssociatedTokenAddressSync(
          p1Nft.mint,
          p1.publicKey
        );
        const winnerNft2Account = getAssociatedTokenAddressSync(
          p2Nft.mint,
          p1.publicKey
        );

        await program.methods
          .claimWinnerNfts()
          .accountsPartial({
            claimer: p1.publicKey,
            challenge: challengePda,
            escrowNft1Account,
            escrowNft2Account,
            nft1Mint: p1Nft.mint,
            nft2Mint: p2Nft.mint,
            winnerNft1Account,
            winnerNft2Account,
          })
          .signers([p1])
          .rpc();

        // Check that the NFTs were claimed successfully
        const winnerNft1AccountData = await getAccount(
          provider.connection,
          winnerNft1Account
        );
        const winnerNft2AccountData = await getAccount(
          provider.connection,
          winnerNft2Account
        );
        assert.equal(winnerNft1AccountData.amount, BigInt(1));
        assert.equal(winnerNft2AccountData.amount, BigInt(1));

        // Check that the escrow accounts are empty
        const escrowNft1AccountData = await getAccount(
          provider.connection,
          escrowNft1Account
        );
        const escrowNft2AccountData = await getAccount(
          provider.connection,
          escrowNft2Account
        );
        assert.equal(escrowNft1AccountData.amount, BigInt(0));
        assert.equal(escrowNft2AccountData.amount, BigInt(0));

        // Check that the NFT statuses are updated to claimed
        const challenge = await program.account.challenge.fetch(challengePda);
        assert.equal(
          JSON.stringify(challenge.nft1Status),
          JSON.stringify({ claimed: {} })
        );
        assert.equal(
          JSON.stringify(challenge.nft2Status),
          JSON.stringify({ claimed: {} })
        );
      } catch (error) {
        console.error("Error claiming winner NFTs:", error);
        assert.fail("Failed to claim winner NFTs");
      }
    });

    //     it("should fail if called by winner again", async () => {
    //       try {
    //         const [challengePda] = anchor.web3.PublicKey.findProgramAddressSync(
    //           [
    //             Buffer.from("challenge"),
    //             p1.publicKey.toBuffer(),
    //             new anchor.BN(challengeId).toArrayLike(Buffer, "le", 8),
    //           ],
    //           program.programId
    //         );
    //         const [escrowNft1Account] =
    //           anchor.web3.PublicKey.findProgramAddressSync(
    //             [
    //               Buffer.from("escrow"),
    //               challengePda.toBuffer(),
    //               p1Nft.mint.toBuffer(),
    //             ],
    //             program.programId
    //           );
    //         const [escrowNft2Account] =
    //           anchor.web3.PublicKey.findProgramAddressSync(
    //             [
    //               Buffer.from("escrow"),
    //               challengePda.toBuffer(),
    //               p2Nft.mint.toBuffer(),
    //             ],
    //             program.programId
    //           );
    //         const winnerNft1Account = await getAssociatedTokenAddress(
    //           p1Nft.mint,
    //           p1.publicKey
    //         );
    //         const winnerNft2Account = await getAssociatedTokenAddress(
    //           p2Nft.mint,
    //           p1.publicKey
    //         );

    //         await program.methods
    //           .claimWinnerNfts()
    //           .accountsPartial({
    //             claimer: p1.publicKey,
    //             challenge: challengePda,
    //             escrowNft1Account,
    //             escrowNft2Account,
    //             winnerNft1Account,
    //             winnerNft2Account,
    //             nft1Mint: p1Nft.mint,
    //             nft2Mint: p2Nft.mint,
    //           })
    //           .signers([p1])
    //           .rpc();
    //         assert.fail("NFT should not have been claimed");
    //       } catch (error) {
    //         console.error("Error claiming winner NFTs:", error);
    //         assert.include(error.message, "Invalid challenge state");
    //       }
    //     });
  });
});
