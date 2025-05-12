// import * as anchor from "@coral-xyz/anchor";
// import { Program } from "@coral-xyz/anchor";
// import { Keypair } from "@solana/web3.js";
// import { assert } from "chai";
// import { TrinitySolana } from "../target/types/trinity_solana";

// describe("trinity-solana", () => {
//   // Set the provider to the default local validator
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);

//   const program = anchor.workspace.TrinitySolana as Program<TrinitySolana>;

//   const apiSigners: Keypair[] = [];
//   const moderatorSigners: Keypair[] = [];
//   const unauthorisedKeypair = Keypair.generate();

//   for (let i = 0; i < 10; i++) {
//     apiSigners.push(anchor.web3.Keypair.generate());
//     moderatorSigners.push(anchor.web3.Keypair.generate());
//   }

//   it("initializes the config", async () => {
//     await program.methods
//       .initializeConfig({
//         chainId: new Array(16).fill(0),
//         treasury: provider.wallet.publicKey,
//       })
//       .rpc();

//     // Use fetch with PDA auto-resolve
//     const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("config")],
//       program.programId
//     );
//     const config = await program.account.config.fetch(configPda);

//     assert.ok(config.admin.equals(provider.wallet.publicKey));
//     assert.equal(config.chainId.length, 16);
//     config.chainId.forEach((id) => {
//       assert.equal(id, 0);
//     });
//     assert.ok(config.treasury.equals(provider.wallet.publicKey));
//     assert.equal(config.apiSigners.length, 0);
//     assert.equal(config.moderatorSigners.length, 0);
//   });

//   it("should not allow multiple initializations", async () => {
//     // expect a generic error
//     try {
//       await program.methods
//         .initializeConfig({
//           chainId: new Array(16).fill(0),
//           treasury: provider.wallet.publicKey,
//         })
//         .rpc();
//       assert.fail("Expected error not thrown");
//     } catch (err) {
//       assert.include(err.message, "Transaction simulation failed");
//     }
//   });

//   describe("addApiSigner", () => {
//     it("should add an API signer", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       await program.methods.addApiSigner(apiSigners[0].publicKey).rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.apiSigners.length, 1);
//       assert.ok(config.apiSigners[0].equals(apiSigners[0].publicKey));
//     });

//     it("should succeed but not add same signer twice", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       await program.methods.addApiSigner(apiSigners[0].publicKey).rpc();
//       await program.methods.addApiSigner(apiSigners[0].publicKey).rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.apiSigners.length, 1);
//       assert.ok(config.apiSigners[0].equals(apiSigners[0].publicKey));
//     });

//     it("should not allow adding an API signer if not admin", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       try {
//         await program.methods
//           .addApiSigner(apiSigners[1].publicKey)
//           .accounts({
//             admin: unauthorisedKeypair.publicKey,
//           })
//           .signers([unauthorisedKeypair])
//           .rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Only the admin can perform this action");
//       }
//     });

//     it("should not allow adding more than 10 API signers", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       for (let i = 1; i < 10; i++) {
//         await program.methods.addApiSigner(apiSigners[i].publicKey).rpc();
//       }

//       try {
//         const eleventhSigner = new Keypair();
//         await program.methods.addApiSigner(eleventhSigner.publicKey).rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Too many signers");
//       }

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.apiSigners.length, 10);
//     });
//   });

//   describe("addModeratorSigner", () => {
//     it("should add a moderator signer", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       await program.methods
//         .addModeratorSigner(moderatorSigners[0].publicKey)
//         .rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.moderatorSigners.length, 1);
//       assert.ok(
//         config.moderatorSigners[0].equals(moderatorSigners[0].publicKey)
//       );
//     });

//     it("should succeed but not add same signer twice", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       await program.methods
//         .addModeratorSigner(moderatorSigners[0].publicKey)
//         .rpc();
//       await program.methods
//         .addModeratorSigner(moderatorSigners[0].publicKey)
//         .rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.moderatorSigners.length, 1);
//       assert.ok(
//         config.moderatorSigners[0].equals(moderatorSigners[0].publicKey)
//       );
//     });

//     it("should not allow adding a moderator signer if not admin", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       try {
//         await program.methods
//           .addModeratorSigner(moderatorSigners[1].publicKey)
//           .accounts({
//             admin: unauthorisedKeypair.publicKey,
//           })
//           .signers([unauthorisedKeypair])
//           .rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Only the admin can perform this action");
//       }
//     });

//     it("should not allow adding more than 10 moderator signers", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       for (let i = 1; i < 10; i++) {
//         await program.methods
//           .addModeratorSigner(moderatorSigners[i].publicKey)
//           .rpc();
//       }

//       try {
//         const eleventhSigner = new Keypair();
//         await program.methods
//           .addModeratorSigner(eleventhSigner.publicKey)
//           .rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Too many signers");
//       }
//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.moderatorSigners.length, 10);
//     });
//   });

//   describe("removeApiSigner", () => {
//     it("should remove an API signer", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       assert.equal(
//         (await program.account.config.fetch(configPda)).apiSigners.length,
//         10
//       );

//       // Attempt to remove the signer
//       await program.methods.removeApiSigner(apiSigners[9].publicKey).rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.apiSigners.length, 9);
//     });

//     it("should not allow removing an API signer if not admin", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       try {
//         await program.methods
//           .removeApiSigner(apiSigners[1].publicKey)
//           .accounts({
//             admin: unauthorisedKeypair.publicKey,
//           })
//           .signers([unauthorisedKeypair])
//           .rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Only the admin can perform this action");
//       }
//     });
//   });

//   describe("removeModeratorSigner", () => {
//     it("should remove a moderator signer", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       assert.equal(
//         (await program.account.config.fetch(configPda)).moderatorSigners.length,
//         10
//       );

//       // Attempt to remove the signer
//       await program.methods
//         .removeModeratorSigner(moderatorSigners[9].publicKey)
//         .rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.equal(config.moderatorSigners.length, 9);
//     });

//     it("should not allow removing a moderator signer if not admin", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       try {
//         await program.methods
//           .removeModeratorSigner(moderatorSigners[1].publicKey)
//           .accounts({
//             admin: unauthorisedKeypair.publicKey,
//           })
//           .signers([unauthorisedKeypair])
//           .rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Only the admin can perform this action");
//       }
//     });
//   });

//   describe("updateTreasury", () => {
//     after(async () => {
//       // Reset the treasury to the original value
//       await program.methods.updateTreasury(provider.wallet.publicKey).rpc();
//     });

//     it("should update the treasury", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       const newTreasury = Keypair.generate();

//       await program.methods.updateTreasury(newTreasury.publicKey).rpc();

//       const config = await program.account.config.fetch(configPda);
//       assert.ok(config.treasury.equals(newTreasury.publicKey));
//     });

//     it("should not allow updating the treasury if not admin", async () => {
//       const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
//         [Buffer.from("config")],
//         program.programId
//       );

//       try {
//         await program.methods
//           .updateTreasury(unauthorisedKeypair.publicKey)
//           .accounts({
//             admin: unauthorisedKeypair.publicKey,
//           })
//           .signers([unauthorisedKeypair])
//           .rpc();
//         assert.fail("Expected error not thrown");
//       } catch (err) {
//         assert.include(err.message, "Only the admin can perform this action");
//       }
//     });
//   });
// });
