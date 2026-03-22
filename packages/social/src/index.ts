/**
 * @paradigm/social — Seed marketplace, user profiles, reputation, messaging,
 * and collaboration system for GSPL Paradigm (Layer 5: Social + Behavior).
 *
 * Zero external dependencies beyond @paradigm/types and @paradigm/rng.
 * All randomness is deterministic via DeterministicRNG.
 *
 * @packageDocumentation
 */

import type { UniversalSeed, Gene, GeneMap, SeedDomain } from '@paradigm/types';
import { DeterministicRNG, computeQuickHash } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Types and Interfaces
// ─────────────────────────────────────────────

/** Pricing strategy for seed listings. */
export type PricingModel = 'free' | 'fixed' | 'auction' | 'donation';

/** Sort options for marketplace search. */
export type ListingSortBy =
  | 'newest'
  | 'popular'
  | 'highest_fitness'
  | 'lowest_price'
  | 'best_rating'
  | 'trending';

/** Reputation badges awarded based on user activity thresholds. */
export type ReputationBadge =
  | 'seed_creator'
  | 'evolution_master'
  | 'community_helper'
  | 'top_seller'
  | 'curator'
  | 'pioneer';

/** A seed listed for sale or sharing on the marketplace. */
export interface SeedListing {
  id: string;
  seed: UniversalSeed;
  sellerId: string;
  title: string;
  description: string;
  tags: string[];
  pricing: PricingModel;
  price: number;
  downloads: number;
  rating: number;
  reviewCount: number;
  createdAt: number;
  updatedAt: number;
}

/** A user review of a marketplace listing. */
export interface Review {
  id: string;
  listingId: string;
  reviewerId: string;
  rating: number;
  title: string;
  body: string;
  helpfulVotes: number;
  createdAt: number;
}

/** A user's public profile and reputation data. */
export interface UserProfile {
  id: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  joinDate: number;
  badges: ReputationBadge[];
  seedsPublished: number;
  seedsPurchased: number;
  totalDownloads: number;
  reputation: number;
}

/** A direct message between two users. */
export interface Message {
  id: string;
  fromId: string;
  toId: string;
  content: string;
  timestamp: number;
  read: boolean;
}

/** A group messaging channel. */
export interface Channel {
  id: string;
  name: string;
  topic: string;
  memberIds: string[];
  messages: Message[];
}

/** A collaborative seed editing session. */
export interface CollaborativeSession {
  id: string;
  name: string;
  hostId: string;
  participantIds: string[];
  seedIds: string[];
  createdAt: number;
  active: boolean;
}

/** Aggregate marketplace statistics. */
export interface MarketplaceStats {
  totalListings: number;
  activeListings: number;
  totalDownloads: number;
  totalReviews: number;
  averageRating: number;
  trendingDomains: string[];
}

/** Filter criteria for marketplace search. */
export interface ListingFilter {
  domain?: string;
  tags?: string[];
  minRating?: number;
  maxPrice?: number;
  pricingModel?: PricingModel;
  sellerId?: string;
  query?: string;
}

// ─────────────────────────────────────────────
// ID Generation
// ─────────────────────────────────────────────

/** Generate a deterministic unique ID from a prefix and RNG state. */
function generateId(prefix: string, rng: DeterministicRNG): string {
  return computeQuickHash(`${prefix}:${Date.now()}:${rng.next()}`);
}

// ─────────────────────────────────────────────
// Marketplace — Core marketplace engine
// ─────────────────────────────────────────────

/** Options for creating a new seed listing. */
export interface ListSeedOptions {
  title: string;
  description: string;
  tags: string[];
  pricing: PricingModel;
  price: number;
}

/**
 * Core marketplace engine for listing, searching, purchasing, and managing seeds.
 * All listings are stored in-memory indexed by listing ID.
 */
export class Marketplace {
  private readonly listings: Map<string, SeedListing> = new Map();
  private readonly purchases: Map<string, string[]> = new Map(); // buyerId -> listingIds
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng.fork('marketplace');
  }

  /**
   * List a seed on the marketplace.
   * @param seed - The seed to list.
   * @param sellerId - The seller's user ID.
   * @param opts - Listing options (title, description, tags, pricing, price).
   * @returns The created SeedListing.
   */
  listSeed(seed: UniversalSeed, sellerId: string, opts: ListSeedOptions): SeedListing {
    const now = Date.now();
    const listing: SeedListing = {
      id: generateId('listing', this.rng),
      seed,
      sellerId,
      title: opts.title,
      description: opts.description,
      tags: [...opts.tags],
      pricing: opts.pricing,
      price: opts.price,
      downloads: 0,
      rating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.listings.set(listing.id, listing);
    return listing;
  }

  /**
   * Remove a listing from the marketplace.
   * @param listingId - The listing to remove.
   * @returns True if the listing existed and was removed.
   */
  removeListing(listingId: string): boolean {
    return this.listings.delete(listingId);
  }

  /**
   * Retrieve a single listing by ID.
   * @param listingId - The listing ID.
   * @returns The listing, or undefined if not found.
   */
  getListing(listingId: string): SeedListing | undefined {
    return this.listings.get(listingId);
  }

  /**
   * Search marketplace listings with optional filters and sorting.
   * @param filter - Optional filter criteria.
   * @param sortBy - Sort order (default: 'newest').
   * @param limit - Maximum results to return (default: 20).
   * @param offset - Number of results to skip (default: 0).
   * @returns Matching listings and total count.
   */
  search(
    filter?: ListingFilter,
    sortBy: ListingSortBy = 'newest',
    limit: number = 20,
    offset: number = 0,
  ): { listings: SeedListing[]; total: number } {
    let results = Array.from(this.listings.values());

    if (filter !== undefined) {
      results = this.applyFilter(results, filter);
    }

    results = this.applySort(results, sortBy);

    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    return { listings: paginated, total };
  }

  /**
   * Purchase a seed from the marketplace.
   * Increments download count and records the purchase.
   * @param listingId - The listing to purchase.
   * @param buyerId - The buyer's user ID.
   * @returns Success status and the seed if successful.
   */
  purchaseSeed(
    listingId: string,
    buyerId: string,
  ): { success: boolean; seed?: UniversalSeed } {
    const listing = this.listings.get(listingId);
    if (listing === undefined) {
      return { success: false };
    }

    listing.downloads += 1;
    listing.updatedAt = Date.now();

    const buyerPurchases = this.purchases.get(buyerId) ?? [];
    buyerPurchases.push(listingId);
    this.purchases.set(buyerId, buyerPurchases);

    return { success: true, seed: listing.seed };
  }

  /**
   * Get aggregate marketplace statistics.
   * @returns MarketplaceStats with totals and trending domains.
   */
  getStats(): MarketplaceStats {
    const allListings = Array.from(this.listings.values());
    const totalListings = allListings.length;
    const activeListings = totalListings;

    let totalDownloads = 0;
    let totalReviews = 0;
    let ratingSum = 0;
    let ratedCount = 0;
    const domainDownloads = new Map<string, number>();

    for (const listing of allListings) {
      totalDownloads += listing.downloads;
      totalReviews += listing.reviewCount;
      if (listing.rating > 0) {
        ratingSum += listing.rating;
        ratedCount += 1;
      }
      const domain = listing.seed.$domain;
      const prev = domainDownloads.get(domain) ?? 0;
      domainDownloads.set(domain, prev + listing.downloads);
    }

    const averageRating = ratedCount > 0 ? ratingSum / ratedCount : 0;

    const trendingDomains = Array.from(domainDownloads.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((entry) => entry[0]);

    return {
      totalListings,
      activeListings,
      totalDownloads,
      totalReviews,
      averageRating,
      trendingDomains,
    };
  }

  /**
   * Get all purchase records for a buyer.
   * @param buyerId - The buyer's user ID.
   * @returns Array of listing IDs purchased.
   */
  getPurchases(buyerId: string): string[] {
    return this.purchases.get(buyerId) ?? [];
  }

  /** Apply filter criteria to a list of listings. */
  private applyFilter(listings: SeedListing[], filter: ListingFilter): SeedListing[] {
    let results = listings;

    if (filter.domain !== undefined) {
      results = results.filter((l) => l.seed.$domain === filter.domain);
    }

    if (filter.tags !== undefined && filter.tags.length > 0) {
      const filterTags = new Set(filter.tags);
      results = results.filter((l) =>
        l.tags.some((tag) => filterTags.has(tag)),
      );
    }

    if (filter.minRating !== undefined) {
      const minRating = filter.minRating;
      results = results.filter((l) => l.rating >= minRating);
    }

    if (filter.maxPrice !== undefined) {
      const maxPrice = filter.maxPrice;
      results = results.filter((l) => l.price <= maxPrice);
    }

    if (filter.pricingModel !== undefined) {
      const model = filter.pricingModel;
      results = results.filter((l) => l.pricing === model);
    }

    if (filter.sellerId !== undefined) {
      const sellerId = filter.sellerId;
      results = results.filter((l) => l.sellerId === sellerId);
    }

    if (filter.query !== undefined && filter.query.length > 0) {
      const queryLower = filter.query.toLowerCase();
      results = results.filter(
        (l) =>
          l.title.toLowerCase().includes(queryLower) ||
          l.description.toLowerCase().includes(queryLower) ||
          l.tags.some((tag) => tag.toLowerCase().includes(queryLower)),
      );
    }

    return results;
  }

  /** Sort listings by the specified criterion. */
  private applySort(listings: SeedListing[], sortBy: ListingSortBy): SeedListing[] {
    const sorted = [...listings];
    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'popular':
        sorted.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'highest_fitness': {
        sorted.sort((a, b) => {
          const fa = a.seed.$fitness?.primary ?? 0;
          const fb = b.seed.$fitness?.primary ?? 0;
          return fb - fa;
        });
        break;
      }
      case 'lowest_price':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'best_rating':
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case 'trending':
        // Trending = high recent downloads weighted by recency
        sorted.sort((a, b) => {
          const now = Date.now();
          const recencyA = 1 / (1 + (now - a.updatedAt) / 86400000);
          const recencyB = 1 / (1 + (now - b.updatedAt) / 86400000);
          const scoreA = a.downloads * recencyA;
          const scoreB = b.downloads * recencyB;
          return scoreB - scoreA;
        });
        break;
    }
    return sorted;
  }
}

// ─────────────────────────────────────────────
// ReviewSystem — Rating and reviews
// ─────────────────────────────────────────────

/**
 * Manages reviews and ratings for marketplace listings.
 * Updates parent listing rating/reviewCount when reviews are added.
 */
export class ReviewSystem {
  private readonly reviewsByListing: Map<string, Review[]> = new Map();
  private readonly reviewsById: Map<string, Review> = new Map();
  private readonly marketplace: Marketplace;
  private readonly rng: DeterministicRNG;

  constructor(marketplace: Marketplace, rng: DeterministicRNG) {
    this.marketplace = marketplace;
    this.rng = rng.fork('reviews');
  }

  /**
   * Add a review to a listing. Updates the listing's rating and reviewCount.
   * Rating is clamped to [1, 5].
   * @param listingId - The listing to review.
   * @param reviewerId - The reviewer's user ID.
   * @param rating - Rating from 1 to 5.
   * @param title - Review title.
   * @param body - Review body text.
   * @returns The created Review.
   * @throws Error if the listing does not exist.
   */
  addReview(
    listingId: string,
    reviewerId: string,
    rating: number,
    title: string,
    body: string,
  ): Review {
    const listing = this.marketplace.getListing(listingId);
    if (listing === undefined) {
      throw new Error(`Listing not found: ${listingId}`);
    }

    const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));

    const review: Review = {
      id: generateId('review', this.rng),
      listingId,
      reviewerId,
      rating: clampedRating,
      title,
      body,
      helpfulVotes: 0,
      createdAt: Date.now(),
    };

    const listingReviews = this.reviewsByListing.get(listingId) ?? [];
    listingReviews.push(review);
    this.reviewsByListing.set(listingId, listingReviews);
    this.reviewsById.set(review.id, review);

    // Update listing aggregate rating
    this.updateListingRating(listing, listingReviews);

    return review;
  }

  /**
   * Get reviews for a listing with pagination.
   * @param listingId - The listing ID.
   * @param limit - Maximum reviews to return (default: 20).
   * @param offset - Number of reviews to skip (default: 0).
   * @returns Paginated reviews and total count.
   */
  getReviews(
    listingId: string,
    limit: number = 20,
    offset: number = 0,
  ): { reviews: Review[]; total: number } {
    const all = this.reviewsByListing.get(listingId) ?? [];
    const total = all.length;
    const paginated = all.slice(offset, offset + limit);
    return { reviews: paginated, total };
  }

  /**
   * Vote a review as helpful. Increments the review's helpfulVotes counter.
   * @param reviewId - The review to upvote.
   * @returns True if the review was found and voted on.
   */
  voteHelpful(reviewId: string): boolean {
    const review = this.reviewsById.get(reviewId);
    if (review === undefined) {
      return false;
    }
    review.helpfulVotes += 1;
    return true;
  }

  /**
   * Get the average rating for a listing.
   * @param listingId - The listing ID.
   * @returns Average rating, or 0 if no reviews exist.
   */
  getAverageRating(listingId: string): number {
    const reviews = this.reviewsByListing.get(listingId);
    if (reviews === undefined || reviews.length === 0) {
      return 0;
    }
    let sum = 0;
    for (const review of reviews) {
      sum += review.rating;
    }
    return sum / reviews.length;
  }

  /**
   * Get the total number of reviews written by a specific user.
   * @param reviewerId - The reviewer's user ID.
   * @returns Total review count across all listings.
   */
  getReviewCountByUser(reviewerId: string): number {
    let count = 0;
    for (const reviews of this.reviewsByListing.values()) {
      for (const review of reviews) {
        if (review.reviewerId === reviewerId) {
          count += 1;
        }
      }
    }
    return count;
  }

  /** Recalculate and update a listing's aggregate rating and review count. */
  private updateListingRating(listing: SeedListing, reviews: Review[]): void {
    if (reviews.length === 0) {
      listing.rating = 0;
      listing.reviewCount = 0;
      return;
    }
    let sum = 0;
    for (const review of reviews) {
      sum += review.rating;
    }
    listing.rating = sum / reviews.length;
    listing.reviewCount = reviews.length;
    listing.updatedAt = Date.now();
  }
}

// ─────────────────────────────────────────────
// ReputationEngine — User profiles and badges
// ─────────────────────────────────────────────

/** Badge eligibility checker function signature. */
type BadgeCheck = (profile: UserProfile, ctx: ReputationContext) => boolean;

/** Thresholds for automatic badge eligibility detection. */
const BADGE_THRESHOLDS: Record<ReputationBadge, BadgeCheck> = {
  seed_creator: (p: UserProfile) => p.seedsPublished >= 5,
  evolution_master: (p: UserProfile) => p.reputation >= 100,
  community_helper: (p: UserProfile) => p.reputation >= 50,
  top_seller: (p: UserProfile) => p.totalDownloads >= 100,
  curator: (_p: UserProfile, ctx: ReputationContext) => ctx.reviewCount >= 10,
  pioneer: (_p: UserProfile, ctx: ReputationContext) => ctx.profileIndex < 1000,
};

/** Context data for badge eligibility checks beyond the profile itself. */
interface ReputationContext {
  reviewCount: number;
  profileIndex: number;
}

/**
 * Manages user profiles, reputation scores, and badge awards.
 * Tracks profile creation order for pioneer badge eligibility.
 */
export class ReputationEngine {
  private readonly profiles: Map<string, UserProfile> = new Map();
  private readonly profileOrder: string[] = [];
  private readonly reviewSystem: ReviewSystem | null;
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG, reviewSystem?: ReviewSystem) {
    this.rng = rng.fork('reputation');
    this.reviewSystem = reviewSystem ?? null;
  }

  /**
   * Create a new user profile.
   * @param id - Unique user ID.
   * @param displayName - Display name.
   * @param bio - Optional biography text.
   * @returns The created UserProfile.
   * @throws Error if a profile with this ID already exists.
   */
  createProfile(id: string, displayName: string, bio?: string): UserProfile {
    if (this.profiles.has(id)) {
      throw new Error(`Profile already exists: ${id}`);
    }

    const profile: UserProfile = {
      id,
      displayName,
      bio: bio ?? '',
      joinDate: Date.now(),
      badges: [],
      seedsPublished: 0,
      seedsPurchased: 0,
      totalDownloads: 0,
      reputation: 0,
    };

    this.profiles.set(id, profile);
    this.profileOrder.push(id);
    return profile;
  }

  /**
   * Retrieve a user profile by ID.
   * @param id - The user ID.
   * @returns The profile, or undefined if not found.
   */
  getProfile(id: string): UserProfile | undefined {
    return this.profiles.get(id);
  }

  /**
   * Adjust a user's reputation score.
   * @param userId - The user ID.
   * @param delta - Amount to add (positive) or subtract (negative).
   * @throws Error if the profile does not exist.
   */
  updateReputation(userId: string, delta: number): void {
    const profile = this.profiles.get(userId);
    if (profile === undefined) {
      throw new Error(`Profile not found: ${userId}`);
    }
    profile.reputation += delta;
  }

  /**
   * Manually award a badge to a user.
   * @param userId - The user ID.
   * @param badge - The badge to award.
   * @returns False if the user already has the badge or profile not found; true if awarded.
   */
  awardBadge(userId: string, badge: ReputationBadge): boolean {
    const profile = this.profiles.get(userId);
    if (profile === undefined) {
      return false;
    }
    if (profile.badges.includes(badge)) {
      return false;
    }
    profile.badges.push(badge);
    return true;
  }

  /**
   * Detect which badges a user is eligible for but has not yet received.
   * @param userId - The user ID.
   * @returns Array of newly eligible badges.
   */
  checkBadgeEligibility(userId: string): ReputationBadge[] {
    const profile = this.profiles.get(userId);
    if (profile === undefined) {
      return [];
    }

    const profileIndex = this.profileOrder.indexOf(userId);
    const reviewCount = this.reviewSystem !== null
      ? this.reviewSystem.getReviewCountByUser(userId)
      : 0;

    const ctx: ReputationContext = { reviewCount, profileIndex };
    const eligible: ReputationBadge[] = [];

    const allBadges: ReputationBadge[] = [
      'seed_creator',
      'evolution_master',
      'community_helper',
      'top_seller',
      'curator',
      'pioneer',
    ];

    for (const badge of allBadges) {
      if (profile.badges.includes(badge)) {
        continue;
      }
      const check: BadgeCheck | undefined = BADGE_THRESHOLDS[badge];
      if (check !== undefined && check(profile, ctx)) {
        eligible.push(badge);
      }
    }

    return eligible;
  }

  /**
   * Increment a user's seedsPublished counter.
   * @param userId - The user ID.
   */
  incrementSeedsPublished(userId: string): void {
    const profile = this.profiles.get(userId);
    if (profile !== undefined) {
      profile.seedsPublished += 1;
    }
  }

  /**
   * Increment a user's seedsPurchased counter.
   * @param userId - The user ID.
   */
  incrementSeedsPurchased(userId: string): void {
    const profile = this.profiles.get(userId);
    if (profile !== undefined) {
      profile.seedsPurchased += 1;
    }
  }

  /**
   * Add to a user's total download count.
   * @param userId - The user ID.
   * @param count - Number of downloads to add.
   */
  addDownloads(userId: string, count: number): void {
    const profile = this.profiles.get(userId);
    if (profile !== undefined) {
      profile.totalDownloads += count;
    }
  }

  /**
   * Get total number of registered profiles.
   * @returns The count of all profiles.
   */
  getProfileCount(): number {
    return this.profiles.size;
  }
}

// ─────────────────────────────────────────────
// MessagingSystem — Direct messages and channels
// ─────────────────────────────────────────────

/**
 * Manages direct messages between users and group channels.
 * All messages are stored in-memory with full read-tracking.
 */
export class MessagingSystem {
  private readonly messages: Map<string, Message> = new Map();
  private readonly channels: Map<string, Channel> = new Map();
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng.fork('messaging');
  }

  /**
   * Send a direct message from one user to another.
   * @param fromId - Sender user ID.
   * @param toId - Recipient user ID.
   * @param content - Message text content.
   * @returns The created Message.
   */
  sendMessage(fromId: string, toId: string, content: string): Message {
    const message: Message = {
      id: generateId('msg', this.rng),
      fromId,
      toId,
      content,
      timestamp: Date.now(),
      read: false,
    };
    this.messages.set(message.id, message);
    return message;
  }

  /**
   * Get direct messages between two users, ordered by timestamp ascending.
   * @param userId - One participant's user ID.
   * @param otherId - The other participant's user ID.
   * @param limit - Maximum messages to return (default: 50).
   * @param offset - Number of messages to skip (default: 0).
   * @returns Paginated array of messages.
   */
  getMessages(
    userId: string,
    otherId: string,
    limit: number = 50,
    offset: number = 0,
  ): Message[] {
    const conversation: Message[] = [];
    for (const msg of this.messages.values()) {
      if (
        (msg.fromId === userId && msg.toId === otherId) ||
        (msg.fromId === otherId && msg.toId === userId)
      ) {
        conversation.push(msg);
      }
    }
    conversation.sort((a, b) => a.timestamp - b.timestamp);
    return conversation.slice(offset, offset + limit);
  }

  /**
   * Mark a message as read.
   * @param messageId - The message ID.
   * @returns True if the message was found and marked read.
   */
  markRead(messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (message === undefined) {
      return false;
    }
    message.read = true;
    return true;
  }

  /**
   * Count unread messages for a user across all conversations.
   * @param userId - The user ID to check.
   * @returns Number of unread messages addressed to this user.
   */
  getUnreadCount(userId: string): number {
    let count = 0;
    for (const msg of this.messages.values()) {
      if (msg.toId === userId && !msg.read) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Create a new group channel.
   * @param name - Channel name.
   * @param topic - Channel topic description.
   * @param creatorId - The creating user's ID (auto-joined as first member).
   * @returns The created Channel.
   */
  createChannel(name: string, topic: string, creatorId: string): Channel {
    const channel: Channel = {
      id: generateId('chan', this.rng),
      name,
      topic,
      memberIds: [creatorId],
      messages: [],
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  /**
   * Post a message to a group channel.
   * @param channelId - The channel to post to.
   * @param fromId - The sender's user ID.
   * @param content - Message text content.
   * @returns The created Message.
   * @throws Error if the channel does not exist.
   */
  postToChannel(channelId: string, fromId: string, content: string): Message {
    const channel = this.channels.get(channelId);
    if (channel === undefined) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const message: Message = {
      id: generateId('cmsg', this.rng),
      fromId,
      toId: channelId,
      content,
      timestamp: Date.now(),
      read: false,
    };

    channel.messages.push(message);
    return message;
  }

  /**
   * Get messages from a channel with pagination.
   * @param channelId - The channel ID.
   * @param limit - Maximum messages to return (default: 50).
   * @param offset - Number of messages to skip (default: 0).
   * @returns Paginated array of channel messages.
   */
  getChannelMessages(
    channelId: string,
    limit: number = 50,
    offset: number = 0,
  ): Message[] {
    const channel = this.channels.get(channelId);
    if (channel === undefined) {
      return [];
    }
    return channel.messages.slice(offset, offset + limit);
  }

  /**
   * Get a channel by ID.
   * @param channelId - The channel ID.
   * @returns The channel, or undefined if not found.
   */
  getChannel(channelId: string): Channel | undefined {
    return this.channels.get(channelId);
  }
}

// ─────────────────────────────────────────────
// CollaborationHub — Shared editing sessions
// ─────────────────────────────────────────────

/**
 * Manages collaborative seed editing sessions.
 * Users can create, join, leave, and share seeds within sessions.
 */
export class CollaborationHub {
  private readonly sessions: Map<string, CollaborativeSession> = new Map();
  private readonly rng: DeterministicRNG;

  constructor(rng: DeterministicRNG) {
    this.rng = rng.fork('collaboration');
  }

  /**
   * Create a new collaborative session.
   * @param name - Session name.
   * @param hostId - The host user's ID.
   * @returns The created CollaborativeSession.
   */
  createSession(name: string, hostId: string): CollaborativeSession {
    const session: CollaborativeSession = {
      id: generateId('session', this.rng),
      name,
      hostId,
      participantIds: [hostId],
      seedIds: [],
      createdAt: Date.now(),
      active: true,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Join an existing active session.
   * @param sessionId - The session to join.
   * @param userId - The user joining.
   * @returns True if successfully joined; false if session not found, inactive, or user already joined.
   */
  joinSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) {
      return false;
    }
    if (session.participantIds.includes(userId)) {
      return false;
    }
    session.participantIds.push(userId);
    return true;
  }

  /**
   * Leave a session. The host cannot leave (must end session instead).
   * @param sessionId - The session to leave.
   * @param userId - The user leaving.
   * @returns True if successfully left; false if session not found or user not a participant.
   */
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) {
      return false;
    }
    if (userId === session.hostId) {
      return false;
    }
    const index = session.participantIds.indexOf(userId);
    if (index === -1) {
      return false;
    }
    session.participantIds.splice(index, 1);
    return true;
  }

  /**
   * Add a seed to a session's shared workspace.
   * @param sessionId - The session ID.
   * @param seedId - The seed hash/ID to add.
   * @returns True if successfully added; false if session not found, inactive, or seed already present.
   */
  addSeedToSession(sessionId: string, seedId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) {
      return false;
    }
    if (session.seedIds.includes(seedId)) {
      return false;
    }
    session.seedIds.push(seedId);
    return true;
  }

  /**
   * Get an active session by ID.
   * @param sessionId - The session ID.
   * @returns The session if found and active, or undefined.
   */
  getActiveSession(sessionId: string): CollaborativeSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) {
      return undefined;
    }
    return session;
  }

  /**
   * List all currently active sessions.
   * @returns Array of active CollaborativeSessions.
   */
  listActiveSessions(): CollaborativeSession[] {
    const active: CollaborativeSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.active) {
        active.push(session);
      }
    }
    return active;
  }

  /**
   * End a session. Only the host can end their session.
   * @param sessionId - The session ID.
   * @param hostId - The host user ID (must match session host).
   * @returns True if session was ended; false if not found or unauthorized.
   */
  endSession(sessionId: string, hostId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || !session.active) {
      return false;
    }
    if (session.hostId !== hostId) {
      return false;
    }
    session.active = false;
    return true;
  }
}

// ─────────────────────────────────────────────
// SocialEngine — Top-level entry point
// ─────────────────────────────────────────────

/**
 * Top-level social engine that wires together all subsystems:
 * marketplace, reviews, reputation, messaging, and collaboration.
 *
 * Provides a `fromSeed` convenience method to auto-list seeds with
 * sensible defaults derived from the seed's genes and domain.
 */
export class SocialEngine {
  /** Core marketplace for listing and purchasing seeds. */
  readonly marketplace: Marketplace;
  /** Review and rating system for marketplace listings. */
  readonly reviews: ReviewSystem;
  /** User profile and reputation management. */
  readonly reputation: ReputationEngine;
  /** Direct messaging and group channels. */
  readonly messaging: MessagingSystem;
  /** Collaborative seed editing sessions. */
  readonly collaboration: CollaborationHub;

  private readonly rng: DeterministicRNG;

  /**
   * Create a new SocialEngine with all subsystems wired together.
   * @param rng - Optional deterministic RNG instance. Defaults to seed 'social-engine'.
   */
  constructor(rng?: DeterministicRNG) {
    this.rng = rng ?? new DeterministicRNG('social-engine');

    this.marketplace = new Marketplace(this.rng);
    this.reviews = new ReviewSystem(this.marketplace, this.rng);
    this.reputation = new ReputationEngine(this.rng, this.reviews);
    this.messaging = new MessagingSystem(this.rng);
    this.collaboration = new CollaborationHub(this.rng);
  }

  /**
   * Auto-create a marketplace listing from a seed with sensible defaults.
   * Extracts title, description, tags, and pricing from the seed's metadata,
   * domain, and gene structure.
   *
   * @param seed - The UniversalSeed to list.
   * @param sellerId - Optional seller ID (defaults to seed creator or 'anonymous').
   * @returns The created SeedListing.
   */
  fromSeed(seed: UniversalSeed, sellerId?: string): SeedListing {
    const resolvedSellerId = sellerId ?? seed.$metadata.creator ?? 'anonymous';

    const title = seed.$name || `${capitalize(seed.$domain)} Seed`;
    const description =
      seed.$metadata.description ??
      `A ${seed.$domain} seed with ${countGenes(seed.genes)} genes.`;

    const tags = this.extractTags(seed);
    const pricing = this.inferPricing(seed);
    const price = pricing === 'free' ? 0 : this.inferPrice(seed);

    const listing = this.marketplace.listSeed(seed, resolvedSellerId, {
      title,
      description,
      tags,
      pricing,
      price,
    });

    // Wire: update seller's reputation profile if it exists
    this.reputation.incrementSeedsPublished(resolvedSellerId);

    return listing;
  }

  /**
   * Purchase a seed and update reputation for both buyer and seller.
   * Delegates to marketplace.purchaseSeed and wires reputation updates.
   *
   * @param listingId - The listing to purchase.
   * @param buyerId - The buyer's user ID.
   * @returns Purchase result with success status and seed.
   */
  purchase(
    listingId: string,
    buyerId: string,
  ): { success: boolean; seed?: UniversalSeed } {
    const result = this.marketplace.purchaseSeed(listingId, buyerId);

    if (result.success) {
      const listing = this.marketplace.getListing(listingId);
      if (listing !== undefined) {
        // Update buyer reputation
        this.reputation.incrementSeedsPurchased(buyerId);
        this.reputation.updateReputation(buyerId, 1);

        // Update seller reputation
        this.reputation.addDownloads(listing.sellerId, 1);
        this.reputation.updateReputation(listing.sellerId, 2);
      }
    }

    return result;
  }

  /** Extract tags from a seed's metadata, domain, and gene keys. */
  private extractTags(seed: UniversalSeed): string[] {
    const tags: string[] = [seed.$domain];

    if (seed.$metadata.tags !== undefined) {
      for (const tag of seed.$metadata.tags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }

    if (seed.$display?.tags !== undefined) {
      for (const tag of seed.$display.tags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }

    // Add up to 5 gene keys as tags
    const geneKeys = Object.keys(seed.genes);
    let added = 0;
    for (const key of geneKeys) {
      if (added >= 5) break;
      if (!tags.includes(key)) {
        tags.push(key);
        added += 1;
      }
    }

    return tags;
  }

  /** Infer a pricing model based on seed characteristics. */
  private inferPricing(seed: UniversalSeed): PricingModel {
    const geneCount = countGenes(seed.genes);
    const fitness = seed.$fitness?.primary ?? 0;

    if (geneCount <= 3 && fitness < 0.5) {
      return 'free';
    }
    if (fitness >= 0.9) {
      return 'auction';
    }
    if (geneCount > 10) {
      return 'fixed';
    }
    return 'donation';
  }

  /** Infer a price based on seed complexity and fitness. */
  private inferPrice(seed: UniversalSeed): number {
    const geneCount = countGenes(seed.genes);
    const fitness = seed.$fitness?.primary ?? 0;
    const basePrice = geneCount * 10;
    const fitnessMultiplier = 1 + fitness * 2;
    return Math.round(basePrice * fitnessMultiplier);
  }
}

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

/** Capitalize the first letter of a string. */
function capitalize(str: string): string {
  if (str.length === 0) return str;
  const first = str[0];
  if (first === undefined) return str;
  return first.toUpperCase() + str.slice(1);
}

/** Count the number of genes in a GeneMap. */
function countGenes(genes: GeneMap): number {
  return Object.keys(genes).length;
}
