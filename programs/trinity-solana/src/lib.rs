use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Mint, Token, TokenAccount},
    associated_token::AssociatedToken,
};

declare_id!("8tsvXCJwKZhNwe3U2MVWdP1n4EkgDVAq4sQCM4Ry2XqS");


#[error_code]
pub enum CustomError {
    #[msg("Only the admin can perform this action.")]
    Unauthorized,
    #[msg("Signer is not in the trusted API signer list.")]
    UnauthorizedApiSigner,
    #[msg("Signer is not in the trusted moderator signer list.")]
    UnauthorizedModeratorSigner,
    #[msg("Challenge already exists.")]
    ChallengeAlreadyExists,
    #[msg("Service fee already paid.")]
    FeeAlreadyPaid,
    #[msg("Fee must be greater than zero.")]
    InvalidFeeAmount,
    #[msg("Invalid payer")]
    InvalidPayer,
    #[msg("NFT already deposited.")]
    AlreadyDeposited,
    #[msg("Invalid challenge state")]
    InvalidChallengeState,
    #[msg("Too many signers")]
    TooManySigners,
    #[msg("Unknown vote type")]
    UnknownVoteType,
    #[msg("Already voted.")]
    AlreadyVoted,
}

#[program]
pub mod trinity_solana {
    use super::*;

    /**
     * Initialize the config account.
     * Only callable once
     */
    pub fn initialize_config(ctx: Context<InitializeConfig>, params: InitConfigParams) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.bump = ctx.bumps.config;
        config.chain_id = params.chain_id;
        config.treasury = params.treasury;
        config.api_signers = vec![];
        config.moderator_signers = vec![];
        Ok(())
    }

    /**
     * Update the config.
     * Only the admin can call this function.
     */
    pub fn add_api_signer(ctx: Context<UpdateConfig>, signer: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(ctx.accounts.admin.key() == config.admin, CustomError::Unauthorized);
        require!(
            config.api_signers.len() < Config::MAX_SIGNERS,
            CustomError::TooManySigners
        );
        if !config.api_signers.contains(&signer) {
            config.api_signers.push(signer);
        }
        Ok(())
    }

    /**
     * Remove an API signer from the config.
     * Only the admin can call this function.
     */
    pub fn remove_api_signer(ctx: Context<UpdateConfig>, signer: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(ctx.accounts.admin.key() == config.admin, CustomError::Unauthorized);
        config.api_signers.retain(|s| s != &signer);
        Ok(())
    }

    /**
     * Add a moderator signer to the config.
     * Only the admin can call this function.
     */
    pub fn add_moderator_signer(ctx: Context<UpdateConfig>, signer: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(ctx.accounts.admin.key() == config.admin, CustomError::Unauthorized);
        require!(
            config.moderator_signers.len() < Config::MAX_SIGNERS,
            CustomError::TooManySigners
        );
        if !config.moderator_signers.contains(&signer) {
            config.moderator_signers.push(signer);
        }
        Ok(())
    }

    /**
     * Remove a moderator signer from the config.
     * Only the admin can call this function.
     */
    pub fn remove_moderator_signer(ctx: Context<UpdateConfig>, signer: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(ctx.accounts.admin.key() == config.admin, CustomError::Unauthorized);
        config.moderator_signers.retain(|s| s != &signer);
        Ok(())
    }

    /**
     * Update the treasury address.
     * Only the admin can call this function.
     */
    pub fn update_treasury(ctx: Context<UpdateConfig>, new_treasury: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(ctx.accounts.admin.key() == config.admin, CustomError::Unauthorized);
        config.treasury = new_treasury;
        Ok(())
    }

    pub fn initialize_challenge(
        ctx: Context<InitializeChallenge>,
        challenge_id: u64,
        p1_fee: u64,
        p2_fee: u64,
        nft1_mint: Pubkey,
        nft2_mint: Pubkey,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            config.api_signers.contains(&ctx.accounts.api_signer.key()),
            CustomError::UnauthorizedApiSigner
        );

        let challenge = &mut ctx.accounts.challenge;
        challenge.p1 = ctx.accounts.p1.key();
        challenge.p2 = ctx.accounts.p2.key();
        challenge.challenge_id = challenge_id;
        challenge.p1_fee = p1_fee;
        challenge.p2_fee = p2_fee;
        challenge.p1_paid = p1_fee == 0; // Mark as paid if fee is 0
        challenge.p2_paid = p2_fee == 0; // Mark as paid if fee is 0
        challenge.nft1_mint = nft1_mint;
        challenge.nft2_mint = nft2_mint;
        challenge.bump = ctx.bumps.challenge;
        challenge.status = if challenge.p1_paid && challenge.p2_paid {
            ChallengeStatus::PendingEscrow
        } else {
            ChallengeStatus::PendingFee
        };
        challenge.nft1_status = NFTStatus::NotDeposited;
        challenge.nft2_status = NFTStatus::NotDeposited;
        challenge.winner = None;

        Ok(())
    }

    pub fn pay_service_fee(ctx: Context<PayServiceFee>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        let payer = ctx.accounts.payer.key();

        if payer == challenge.p1 {
            require!(!challenge.p1_paid, CustomError::FeeAlreadyPaid);
            // If the fee is 0, we don't need to transfer anything and it should be marked as already paid
            if challenge.p1_fee > 0 {
                let ix = anchor_lang::solana_program::system_instruction::transfer(
                    ctx.accounts.payer.key,
                    ctx.accounts.treasury.key,
                    challenge.p1_fee,
                );
                anchor_lang::solana_program::program::invoke(
                    &ix,
                    &[
                        ctx.accounts.payer.to_account_info(),
                        ctx.accounts.treasury.to_account_info(),
                    ],
                )?;
            }
            challenge.p1_paid = true;
        } else if payer == challenge.p2 {
            require!(!challenge.p2_paid, CustomError::FeeAlreadyPaid);
            // If the fee is 0, we don't need to transfer anything and it should be marked as already paid
            if challenge.p2_fee > 0 {
                let ix = anchor_lang::solana_program::system_instruction::transfer(
                    ctx.accounts.payer.key,
                    ctx.accounts.treasury.key,
                    challenge.p2_fee,
                );
                anchor_lang::solana_program::program::invoke(
                    &ix,
                    &[
                        ctx.accounts.payer.to_account_info(),
                        ctx.accounts.treasury.to_account_info(),
                    ],
                )?;
            }
            challenge.p2_paid = true;
        } else {
            return err!(CustomError::InvalidPayer);
        }

        if challenge.p1_paid && challenge.p2_paid {
            challenge.status = ChallengeStatus::PendingEscrow;
        }

        Ok(())
    }

    pub fn deposit_nft(ctx: Context<DepositNft>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        let depositor = ctx.accounts.depositor.key();
    
        if depositor == challenge.p1 {
            require!(
                challenge.nft1_status == NFTStatus::NotDeposited,
                CustomError::AlreadyDeposited
            );
            challenge.nft1_status = NFTStatus::Deposited;
        } else if depositor == challenge.p2 {
            require!(
                challenge.nft2_status == NFTStatus::NotDeposited,
                CustomError::AlreadyDeposited
            );
            challenge.nft2_status = NFTStatus::Deposited;
        } else {
            return err!(CustomError::InvalidPayer);
        }
    
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), 1)?;

        if challenge.nft1_status == NFTStatus::Deposited
            && challenge.nft2_status == NFTStatus::Deposited
        {
            challenge.status = ChallengeStatus::Ready;
        }
    
        Ok(())
    }

    pub fn resolve_challenge(
        ctx: Context<ResolveChallenge>,
        vote: u8 // 1 = p1, 2 = p2, 3 = cancel
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let challenge = &mut ctx.accounts.challenge;
        let mod_key = &ctx.accounts.moderator.key();
    
        // Validate signer is in the list of trusted moderators
        require!(
            config.moderator_signers.contains(mod_key),
            CustomError::UnauthorizedModeratorSigner
        );
    
        // Ensure the moderator hasn't already voted
        require!(
            !challenge.moderator_votes.contains(mod_key),
            CustomError::AlreadyVoted
        );
    
        if vote != 3 {
            // Must be in Ready state if not cancelling
            require!(
                challenge.status == ChallengeStatus::Ready,
                CustomError::InvalidChallengeState
            );
        }
    
        // Record the vote
        challenge.moderator_votes.push(mod_key.clone());
        match vote {
            1 => challenge.votes_for_p1 += 1,
            2 => challenge.votes_for_p2 += 1,
            3 => challenge.votes_to_cancel += 1,
            _ => return err!(CustomError::UnknownVoteType),
        }
    
        // Apply resolution threshold
        let threshold = 3;
        if challenge.votes_for_p1 >= threshold {
            challenge.status = ChallengeStatus::Completed;
            challenge.winner = Some(challenge.p1);
        } else if challenge.votes_for_p2 >= threshold {
            challenge.status = ChallengeStatus::Completed;
            challenge.winner = Some(challenge.p2);
        } else if challenge.votes_to_cancel >= threshold {
            challenge.status = ChallengeStatus::Cancelled;
            challenge.cancelled = true;
        }
    
        Ok(())
    }

    pub fn claim_winner_nfts(ctx: Context<ClaimWinnerNfts>) -> Result<()> {
        let claimer = ctx.accounts.claimer.key();
    
        require!(
            ctx.accounts.challenge.status == ChallengeStatus::Completed,
            CustomError::InvalidChallengeState
        );
        require!(
            Some(claimer) == ctx.accounts.challenge.winner,
            CustomError::InvalidPayer
        );
        require!(
            ctx.accounts.challenge.nft1_status == NFTStatus::Deposited
                && ctx.accounts.challenge.nft2_status == NFTStatus::Deposited,
            CustomError::InvalidChallengeState
        );

        let challenge_seeds = &[
            b"challenge",
            ctx.accounts.challenge.p1.as_ref(),
            &ctx.accounts.challenge.challenge_id.to_le_bytes(),
            &[ctx.accounts.challenge.bump],
        ];
        let signer = &[&challenge_seeds[..]];
    
        // Transfer NFT1
        let cpi_accounts1 = token::Transfer {
            from: ctx.accounts.escrow_nft1_account.to_account_info(),
            to: ctx.accounts.winner_nft1_account.to_account_info(),
            authority: ctx.accounts.challenge.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(
            CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts1, signer),
            1
        )?;
    
        // Transfer NFT2
        let cpi_accounts2 = token::Transfer {
            from: ctx.accounts.escrow_nft2_account.to_account_info(),
            to: ctx.accounts.winner_nft2_account.to_account_info(),
            authority: ctx.accounts.challenge.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                cpi_program, cpi_accounts2, signer
            ),
            1
        )?;
    
        let challenge = &mut ctx.accounts.challenge;
        challenge.nft1_status = NFTStatus::Claimed;
        challenge.nft2_status = NFTStatus::Claimed;
    
        Ok(())
    }

    pub fn claim_refund_nft(ctx: Context<ClaimRefundNft>) -> Result<()> {
        let claimer = ctx.accounts.claimer.key();
    
        require!(
            ctx.accounts.challenge.status == ChallengeStatus::Cancelled,
            CustomError::InvalidChallengeState
        );
        require!(
            ctx.accounts.destination_token_account.owner == claimer,
            CustomError::InvalidPayer
        );
    
        if claimer == ctx.accounts.challenge.p1 {
            require!(
                ctx.accounts.challenge.nft1_status == NFTStatus::Deposited,
                CustomError::InvalidChallengeState
            );
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.escrow_nft_account.to_account_info(),
                        to: ctx.accounts.destination_token_account.to_account_info(),
                        authority: ctx.accounts.challenge.to_account_info(),
                    },
                ),
                1,
            )?;

            let challenge = &mut ctx.accounts.challenge;
            challenge.nft1_status = NFTStatus::Refunded;
        } else if claimer == ctx.accounts.challenge.p2 {
            require!(
                ctx.accounts.challenge.nft2_status == NFTStatus::Deposited,
                CustomError::InvalidChallengeState
            );
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.escrow_nft_account.to_account_info(),
                        to: ctx.accounts.destination_token_account.to_account_info(),
                        authority: ctx.accounts.challenge.to_account_info(),
                    },
                ),
                1,
            )?;

            let challenge = &mut ctx.accounts.challenge;
            challenge.nft2_status = NFTStatus::Refunded;
        } else {
            return err!(CustomError::InvalidPayer);
        }
    
        Ok(())
    }


}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub bump: u8,
    pub treasury: Pubkey,
    pub chain_id: [u8; 16], // chain identifier (16 bytes)
    pub api_signers: Vec<Pubkey>,
    pub moderator_signers: Vec<Pubkey>,
}

impl Config {
    pub const MAX_SIGNERS: usize = 10;
    pub const MAX_SIZE: usize = 32 + 1 + 32 + 16 + (32 * Self::MAX_SIGNERS * 2) + (4 * 2);
}

#[account]
pub struct Challenge {
    pub p1: Pubkey,
    pub p2: Pubkey,
    pub challenge_id: u64,
    pub p1_fee: u64,
    pub p2_fee: u64,
    pub p1_paid: bool,
    pub p2_paid: bool,
    pub nft1_mint: Pubkey,
    pub nft2_mint: Pubkey,
    pub nft1_status: NFTStatus,
    pub nft2_status: NFTStatus,
    pub bump: u8,
    pub status: ChallengeStatus,
    pub winner: Option<Pubkey>,
    pub cancelled: bool,
    pub moderator_votes: Vec<Pubkey>,
    pub votes_for_p1: u8,
    pub votes_for_p2: u8,
    pub votes_to_cancel: u8,
}

impl Challenge {
    pub const LEN: usize = 555;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum ChallengeStatus {
    PendingFee,
    PendingEscrow,
    Ready,
    Completed,
    Cancelled
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum NFTStatus {
    NotDeposited,
    Deposited,
    Claimed,
    Refunded
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::MAX_SIZE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitConfigParams {
    pub chain_id: [u8; 16],
    pub treasury: Pubkey,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(challenge_id: u64)]
pub struct InitializeChallenge<'info> {
    #[account(mut)]
    pub p1: Signer<'info>,
    /// CHECK: Only stored, not used
    pub p2: UncheckedAccount<'info>,
    /// CHECK: Must be a signer and in the list of trusted API wallets
    #[account()]
    pub api_signer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = p1,
        space = 8 + Challenge::LEN,
        seeds = [b"challenge", p1.key().as_ref(), &challenge_id.to_le_bytes()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayServiceFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"challenge", challenge.p1.as_ref(), &challenge.challenge_id.to_le_bytes()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,

    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: Treasury account passed in must match config.treasury
    #[account(
        mut,
        address = config.treasury
    )]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositNft<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"challenge", challenge.p1.as_ref(), &challenge.challenge_id.to_le_bytes()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,

    /// User's token account that holds the NFT to be transferred
    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,

    /// Escrow token account that will hold the NFT
    #[account(
        init_if_needed,
        payer = depositor,
        seeds = [b"escrow", challenge.key().as_ref(), nft_mint.key().as_ref()],
        bump,
        token::mint = nft_mint,
        token::authority = challenge
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub nft_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ResolveChallenge<'info> {
    #[account(mut)]
    pub moderator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"challenge", challenge.p1.as_ref(), &challenge.challenge_id.to_le_bytes()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct ClaimWinnerNfts<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"challenge", challenge.p1.as_ref(), &challenge.challenge_id.to_le_bytes()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,

    #[account(
        mut,
        seeds = [b"escrow", challenge.key().as_ref(), nft1_mint.key().as_ref()],
        bump,
        token::mint = nft1_mint,
        token::authority = challenge
    )]
    pub escrow_nft1_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"escrow", challenge.key().as_ref(), nft2_mint.key().as_ref()],
        bump,
        token::mint = nft2_mint,
        token::authority = challenge
    )]
    pub escrow_nft2_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = nft1_mint,
        associated_token::authority = claimer
    )]
    pub winner_nft1_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = nft2_mint,
        associated_token::authority = claimer
    )]
    pub winner_nft2_account: Account<'info, TokenAccount>,

    pub nft1_mint: Account<'info, Mint>,
    pub nft2_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimRefundNft<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"challenge", challenge.p1.as_ref(), &challenge.challenge_id.to_le_bytes()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,

    #[account(mut)]
    pub escrow_nft_account: Account<'info, TokenAccount>,

    /// Token account to return the NFT to (must be owned by `claimer`)
    #[account(mut)]
    pub destination_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}