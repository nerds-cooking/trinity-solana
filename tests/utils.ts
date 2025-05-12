import * as anchor from "@coral-xyz/anchor";
// import {
//   createCreateMetadataAccountV3Instruction,
//   DataV2,
//   PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
// } from "@metaplex-foundation/mpl-token-metadata";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

/**
 * Mints a 0-decimal token (NFT) to a recipient and sets metadata using Metaplex v2.
 */
export async function mintNftTo(
  provider: anchor.AnchorProvider,
  recipient: PublicKey,
  payer: Keypair,
  name = "Test NFT",
  symbol = "TEST",
  uri = "https://example.com/metadata.json"
): Promise<{ mint: PublicKey; tokenAccount: PublicKey }> {
  const connection = provider.connection;

  const mint = await createMint(
    provider.connection,
    payer, // Keypair
    payer.publicKey, // mint authority
    null,
    0 // decimals = NFT
  );

  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    mint,
    recipient
  );

  const sig = await mintTo(
    provider.connection,
    payer,
    mint,
    ata.address,
    payer,
    1
  );

  return {
    mint,
    tokenAccount: ata.address,
  };

  //   // 1. Create a new mint
  //   const mint = await createMint(
  //     connection,
  //     payer,
  //     payer.publicKey,
  //     null,
  //     0 // decimals = 0 for NFT
  //   );

  //   // 2. Get or create ATA for the recipient
  //   const tokenAccount = await getOrCreateAssociatedTokenAccount(
  //     connection,
  //     payer,
  //     mint,
  //     recipient
  //   );

  //   // 3. Mint 1 token to recipient
  //   await mintTo(connection, payer, mint, tokenAccount.address, payer, 1);

  //   // 4. Create metadata account
  //   const [metadataPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("metadata"), mpx.PROGRAM_ID.toBuffer(), mint.toBuffer()],
  //     mpx.PROGRAM_ID
  //   );

  //   const metadata: mpx.DataV2 = {
  //     name,
  //     symbol,
  //     uri,
  //     sellerFeeBasisPoints: 0,
  //     creators: null,
  //     collection: null,
  //     uses: null,
  //   };

  //   const ix = mpx.createCreateMetadataAccountV3Instruction(
  //     {
  //       metadata: metadataPda,
  //       mint,
  //       mintAuthority: payer.publicKey,
  //       payer: payer.publicKey,
  //       updateAuthority: payer.publicKey,
  //     },
  //     {
  //       createMetadataAccountArgsV3: {
  //         data: metadata,
  //         isMutable: true,
  //         collectionDetails: null,
  //       },
  //     }
  //   );

  //   const tx = new Transaction().add(ix);
  //   await provider.sendAndConfirm(tx, [payer]);

  //   return {
  //     mint,
  //     tokenAccount: tokenAccount.address,
  //   };
}
