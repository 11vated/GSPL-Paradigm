/**
 * Comprehensive test suite for @paradigm/social.
 * Covers: Marketplace, ReviewSystem, ReputationEngine, MessagingSystem,
 * CollaborationHub, and SocialEngine.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { UniversalSeed, GeneMap, SeedDomain } from '@paradigm/types';
import { DeterministicRNG } from '@paradigm/rng';
import {
  Marketplace,
  ReviewSystem,
  ReputationEngine,
  MessagingSystem,
  CollaborationHub,
  SocialEngine,
} from './index.js';
import type {
  SeedListing,
  ListSeedOptions,
  ListingFilter,
  ListingSortBy,
} from './index.js';

// ─────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────

/** Create a minimal valid UniversalSeed for testing. */
function makeSeed(overrides: Partial<{
  domain: SeedDomain;
  name: string;
  genes: GeneMap;
  fitness: number;
  creator: string;
  description: string;
  tags: string[];
  displayTags: string[];
}> = {}): UniversalSeed {
  const domain = overrides.domain ?? 'organism';
  const genes: GeneMap = overrides.genes ?? {
    strength: { type: 'scalar', value: 0.5, min: 0, max: 1 },
  };
  return {
    $gst: '4.0' as const,
    $domain: domain,
    $hash: `hash-${Math.random().toString(36).slice(2, 10)}`,
    $name: overrides.name ?? 'Test Seed',
    $lineage: {
      generation: 0,
      parents: [],
      timestamp: Date.now(),
    },
    genes,
    $fitness: overrides.fitness !== undefined ? { primary: overrides.fitness } : undefined,
    $metadata: {
      created: Date.now(),
      creator: overrides.creator,
      description: overrides.description,
      tags: overrides.tags,
    },
    $display: overrides.displayTags ? { tags: overrides.displayTags } : undefined,
  };
}

/** Default listing options for testing. */
function makeListOpts(overrides: Partial<ListSeedOptions> = {}): ListSeedOptions {
  return {
    title: overrides.title ?? 'Test Listing',
    description: overrides.description ?? 'A test listing',
    tags: overrides.tags ?? ['test', 'seed'],
    pricing: overrides.pricing ?? 'free',
    price: overrides.price ?? 0,
  };
}

// ─────────────────────────────────────────────
// 1. Marketplace
// ─────────────────────────────────────────────

describe('Marketplace', () => {
  let rng: DeterministicRNG;
  let market: Marketplace;

  beforeEach(() => {
    rng = new DeterministicRNG('test-market');
    market = new Marketplace(rng);
  });

  describe('listSeed', () => {
    it('creates a listing with correct fields', () => {
      const seed = makeSeed();
      const opts = makeListOpts({ title: 'My Seed', description: 'Desc', tags: ['a', 'b'], pricing: 'fixed', price: 100 });
      const listing = market.listSeed(seed, 'seller-1', opts);

      expect(listing.id).toBeTruthy();
      expect(listing.seed).toBe(seed);
      expect(listing.sellerId).toBe('seller-1');
      expect(listing.title).toBe('My Seed');
      expect(listing.description).toBe('Desc');
      expect(listing.tags).toEqual(['a', 'b']);
      expect(listing.pricing).toBe('fixed');
      expect(listing.price).toBe(100);
      expect(listing.downloads).toBe(0);
      expect(listing.rating).toBe(0);
      expect(listing.reviewCount).toBe(0);
      expect(listing.createdAt).toBeGreaterThan(0);
      expect(listing.updatedAt).toBeGreaterThan(0);
    });

    it('assigns unique IDs to each listing', () => {
      const s1 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      const s2 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      expect(s1.id).not.toBe(s2.id);
    });

    it('copies tags array (no shared reference)', () => {
      const tags = ['a', 'b'];
      const listing = market.listSeed(makeSeed(), 'seller', makeListOpts({ tags }));
      tags.push('c');
      expect(listing.tags).toEqual(['a', 'b']);
    });
  });

  describe('removeListing', () => {
    it('removes an existing listing and returns true', () => {
      const listing = market.listSeed(makeSeed(), 'seller', makeListOpts());
      expect(market.removeListing(listing.id)).toBe(true);
      expect(market.getListing(listing.id)).toBeUndefined();
    });

    it('returns false for unknown listing', () => {
      expect(market.removeListing('nonexistent')).toBe(false);
    });
  });

  describe('getListing', () => {
    it('returns listing by ID', () => {
      const listing = market.listSeed(makeSeed(), 'seller', makeListOpts());
      expect(market.getListing(listing.id)).toBe(listing);
    });

    it('returns undefined for unknown ID', () => {
      expect(market.getListing('nope')).toBeUndefined();
    });
  });

  describe('search', () => {
    let listings: SeedListing[];

    beforeEach(() => {
      listings = [
        market.listSeed(makeSeed({ domain: 'organism' }), 'seller-a', makeListOpts({ title: 'Alpha Warrior', tags: ['combat', 'rpg'], pricing: 'free', price: 0 })),
        market.listSeed(makeSeed({ domain: 'vehicle' }), 'seller-b', makeListOpts({ title: 'Beta Racer', tags: ['racing', 'fast'], pricing: 'fixed', price: 50 })),
        market.listSeed(makeSeed({ domain: 'organism' }), 'seller-a', makeListOpts({ title: 'Gamma Healer', tags: ['rpg', 'support'], pricing: 'donation', price: 10 })),
      ];
      // Set different ratings for testing
      listings[0]!.rating = 4.5;
      listings[1]!.rating = 3.0;
      listings[2]!.rating = 5.0;
      // Set different downloads
      listings[0]!.downloads = 100;
      listings[1]!.downloads = 50;
      listings[2]!.downloads = 200;
    });

    it('returns all listings with no filter', () => {
      const result = market.search();
      expect(result.total).toBe(3);
      expect(result.listings).toHaveLength(3);
    });

    it('filters by domain', () => {
      const result = market.search({ domain: 'organism' });
      expect(result.total).toBe(2);
      expect(result.listings.every((l) => l.seed.$domain === 'organism')).toBe(true);
    });

    it('filters by tag', () => {
      const result = market.search({ tags: ['rpg'] });
      expect(result.total).toBe(2);
    });

    it('filters by multiple tags (OR logic)', () => {
      const result = market.search({ tags: ['combat', 'racing'] });
      expect(result.total).toBe(2);
    });

    it('filters by query matching title', () => {
      const result = market.search({ query: 'alpha' });
      expect(result.total).toBe(1);
      expect(result.listings[0]!.title).toBe('Alpha Warrior');
    });

    it('filters by query matching description', () => {
      const result = market.search({ query: 'test listing' });
      expect(result.total).toBe(3);
    });

    it('filters by query matching tags', () => {
      const result = market.search({ query: 'fast' });
      expect(result.total).toBe(1);
    });

    it('filters by minRating', () => {
      const result = market.search({ minRating: 4.0 });
      expect(result.total).toBe(2);
    });

    it('filters by maxPrice', () => {
      const result = market.search({ maxPrice: 10 });
      expect(result.total).toBe(2);
    });

    it('filters by pricingModel', () => {
      const result = market.search({ pricingModel: 'fixed' });
      expect(result.total).toBe(1);
    });

    it('filters by sellerId', () => {
      const result = market.search({ sellerId: 'seller-a' });
      expect(result.total).toBe(2);
    });

    it('handles empty tags filter gracefully', () => {
      const result = market.search({ tags: [] });
      expect(result.total).toBe(3);
    });

    it('handles empty query string gracefully', () => {
      const result = market.search({ query: '' });
      expect(result.total).toBe(3);
    });

    it('combines multiple filters', () => {
      const result = market.search({ domain: 'organism', tags: ['rpg'], minRating: 4.5 });
      expect(result.total).toBe(2);
    });

    it('sorts by newest (descending createdAt)', () => {
      // Manually set createdAt to guarantee ordering since all may share same ms
      listings[0]!.createdAt = 1000;
      listings[1]!.createdAt = 2000;
      listings[2]!.createdAt = 3000;
      const result = market.search(undefined, 'newest');
      expect(result.listings[0]!.title).toBe('Gamma Healer');
      expect(result.listings[2]!.title).toBe('Alpha Warrior');
    });

    it('sorts by popular', () => {
      const result = market.search(undefined, 'popular');
      expect(result.listings[0]!.downloads).toBe(200);
    });

    it('sorts by highest_fitness', () => {
      // Give seeds different fitness
      listings[0]!.seed.$fitness = { primary: 0.3 };
      listings[1]!.seed.$fitness = { primary: 0.9 };
      listings[2]!.seed.$fitness = { primary: 0.6 };
      const result = market.search(undefined, 'highest_fitness');
      expect(result.listings[0]!.seed.$fitness?.primary).toBe(0.9);
    });

    it('sorts by highest_fitness with missing fitness', () => {
      listings[0]!.seed.$fitness = undefined;
      listings[1]!.seed.$fitness = { primary: 0.5 };
      const result = market.search(undefined, 'highest_fitness');
      expect(result.listings[0]!.seed.$fitness?.primary).toBe(0.5);
    });

    it('sorts by lowest_price', () => {
      const result = market.search(undefined, 'lowest_price');
      expect(result.listings[0]!.price).toBe(0);
      expect(result.listings[2]!.price).toBe(50);
    });

    it('sorts by best_rating', () => {
      const result = market.search(undefined, 'best_rating');
      expect(result.listings[0]!.rating).toBe(5.0);
    });

    it('sorts by trending', () => {
      const result = market.search(undefined, 'trending');
      // Trending combines downloads and recency. Since all are created nearly simultaneously,
      // the one with most downloads should come first
      expect(result.listings[0]!.downloads).toBe(200);
    });

    it('paginates with limit', () => {
      const result = market.search(undefined, 'newest', 2);
      expect(result.listings).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('paginates with offset', () => {
      const result = market.search(undefined, 'newest', 2, 1);
      expect(result.listings).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('paginates with offset beyond results', () => {
      const result = market.search(undefined, 'newest', 20, 100);
      expect(result.listings).toHaveLength(0);
      expect(result.total).toBe(3);
    });
  });

  describe('purchaseSeed', () => {
    it('increments downloads and returns seed', () => {
      const seed = makeSeed();
      const listing = market.listSeed(seed, 'seller', makeListOpts());
      const result = market.purchaseSeed(listing.id, 'buyer-1');
      expect(result.success).toBe(true);
      expect(result.seed).toBe(seed);
      expect(market.getListing(listing.id)!.downloads).toBe(1);
    });

    it('increments downloads on multiple purchases', () => {
      const listing = market.listSeed(makeSeed(), 'seller', makeListOpts());
      market.purchaseSeed(listing.id, 'buyer-1');
      market.purchaseSeed(listing.id, 'buyer-2');
      expect(market.getListing(listing.id)!.downloads).toBe(2);
    });

    it('returns false for missing listing', () => {
      const result = market.purchaseSeed('nonexistent', 'buyer');
      expect(result.success).toBe(false);
      expect(result.seed).toBeUndefined();
    });

    it('records purchase for buyer', () => {
      const listing = market.listSeed(makeSeed(), 'seller', makeListOpts());
      market.purchaseSeed(listing.id, 'buyer-1');
      expect(market.getPurchases('buyer-1')).toContain(listing.id);
    });

    it('records multiple purchases for same buyer', () => {
      const l1 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      const l2 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      market.purchaseSeed(l1.id, 'buyer-1');
      market.purchaseSeed(l2.id, 'buyer-1');
      expect(market.getPurchases('buyer-1')).toHaveLength(2);
    });

    it('returns empty purchases for unknown buyer', () => {
      expect(market.getPurchases('unknown')).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns zeros for empty marketplace', () => {
      const stats = market.getStats();
      expect(stats.totalListings).toBe(0);
      expect(stats.activeListings).toBe(0);
      expect(stats.totalDownloads).toBe(0);
      expect(stats.totalReviews).toBe(0);
      expect(stats.averageRating).toBe(0);
      expect(stats.trendingDomains).toEqual([]);
    });

    it('returns correct counts with listings', () => {
      const l1 = market.listSeed(makeSeed({ domain: 'organism' }), 'seller', makeListOpts());
      const l2 = market.listSeed(makeSeed({ domain: 'vehicle' }), 'seller', makeListOpts());
      l1.downloads = 10;
      l1.rating = 4.0;
      l1.reviewCount = 2;
      l2.downloads = 5;

      const stats = market.getStats();
      expect(stats.totalListings).toBe(2);
      expect(stats.activeListings).toBe(2);
      expect(stats.totalDownloads).toBe(15);
      expect(stats.totalReviews).toBe(2);
      expect(stats.averageRating).toBe(4.0);
      expect(stats.trendingDomains[0]).toBe('organism');
    });

    it('calculates averageRating only from rated listings', () => {
      const l1 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      const l2 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      l1.rating = 4.0;
      l2.rating = 0; // not rated
      const stats = market.getStats();
      expect(stats.averageRating).toBe(4.0);
    });

    it('trending domains sorted by downloads', () => {
      const l1 = market.listSeed(makeSeed({ domain: 'vehicle' }), 's', makeListOpts());
      const l2 = market.listSeed(makeSeed({ domain: 'organism' }), 's', makeListOpts());
      l1.downloads = 5;
      l2.downloads = 50;
      const stats = market.getStats();
      expect(stats.trendingDomains[0]).toBe('organism');
    });
  });
});

// ─────────────────────────────────────────────
// 2. ReviewSystem
// ─────────────────────────────────────────────

describe('ReviewSystem', () => {
  let rng: DeterministicRNG;
  let market: Marketplace;
  let reviews: ReviewSystem;
  let listingId: string;

  beforeEach(() => {
    rng = new DeterministicRNG('test-reviews');
    market = new Marketplace(rng);
    reviews = new ReviewSystem(market, rng);
    const listing = market.listSeed(makeSeed(), 'seller', makeListOpts());
    listingId = listing.id;
  });

  describe('addReview', () => {
    it('creates a review with correct fields', () => {
      const review = reviews.addReview(listingId, 'reviewer-1', 4, 'Great!', 'Very good seed.');
      expect(review.id).toBeTruthy();
      expect(review.listingId).toBe(listingId);
      expect(review.reviewerId).toBe('reviewer-1');
      expect(review.rating).toBe(4);
      expect(review.title).toBe('Great!');
      expect(review.body).toBe('Very good seed.');
      expect(review.helpfulVotes).toBe(0);
      expect(review.createdAt).toBeGreaterThan(0);
    });

    it('clamps rating below 1 to 1', () => {
      const review = reviews.addReview(listingId, 'r', -5, 'Bad', 'Terrible');
      expect(review.rating).toBe(1);
    });

    it('clamps rating above 5 to 5', () => {
      const review = reviews.addReview(listingId, 'r', 10, 'Amazing', 'Perfect');
      expect(review.rating).toBe(5);
    });

    it('rounds fractional ratings', () => {
      const review = reviews.addReview(listingId, 'r', 3.7, 'Good', 'Nice');
      expect(review.rating).toBe(4);
    });

    it('throws for non-existent listing', () => {
      expect(() => reviews.addReview('nonexistent', 'r', 3, 'X', 'Y')).toThrow('Listing not found');
    });

    it('assigns unique IDs to reviews', () => {
      const r1 = reviews.addReview(listingId, 'r1', 3, 'A', 'B');
      const r2 = reviews.addReview(listingId, 'r2', 4, 'C', 'D');
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('getReviews', () => {
    it('returns reviews for a listing', () => {
      reviews.addReview(listingId, 'r1', 4, 'A', 'B');
      reviews.addReview(listingId, 'r2', 5, 'C', 'D');
      const result = reviews.getReviews(listingId);
      expect(result.reviews).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('returns empty for unknown listing', () => {
      const result = reviews.getReviews('unknown');
      expect(result.reviews).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('paginates with limit', () => {
      reviews.addReview(listingId, 'r1', 3, 'A', 'B');
      reviews.addReview(listingId, 'r2', 4, 'C', 'D');
      reviews.addReview(listingId, 'r3', 5, 'E', 'F');
      const result = reviews.getReviews(listingId, 2);
      expect(result.reviews).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('paginates with offset', () => {
      reviews.addReview(listingId, 'r1', 3, 'A', 'B');
      reviews.addReview(listingId, 'r2', 4, 'C', 'D');
      reviews.addReview(listingId, 'r3', 5, 'E', 'F');
      const result = reviews.getReviews(listingId, 2, 1);
      expect(result.reviews).toHaveLength(2);
      expect(result.reviews[0]!.reviewerId).toBe('r2');
    });
  });

  describe('voteHelpful', () => {
    it('increments helpfulVotes', () => {
      const review = reviews.addReview(listingId, 'r1', 4, 'A', 'B');
      expect(reviews.voteHelpful(review.id)).toBe(true);
      expect(reviews.voteHelpful(review.id)).toBe(true);
      const fetched = reviews.getReviews(listingId).reviews[0]!;
      expect(fetched.helpfulVotes).toBe(2);
    });

    it('returns false for missing review', () => {
      expect(reviews.voteHelpful('nonexistent')).toBe(false);
    });
  });

  describe('getAverageRating', () => {
    it('returns 0 for no reviews', () => {
      expect(reviews.getAverageRating(listingId)).toBe(0);
    });

    it('computes correct average', () => {
      reviews.addReview(listingId, 'r1', 3, 'A', 'B');
      reviews.addReview(listingId, 'r2', 5, 'C', 'D');
      expect(reviews.getAverageRating(listingId)).toBe(4);
    });

    it('returns 0 for unknown listing', () => {
      expect(reviews.getAverageRating('unknown')).toBe(0);
    });
  });

  describe('getReviewCountByUser', () => {
    it('counts reviews across listings', () => {
      const l2 = market.listSeed(makeSeed(), 'seller', makeListOpts());
      reviews.addReview(listingId, 'reviewer-x', 3, 'A', 'B');
      reviews.addReview(l2.id, 'reviewer-x', 4, 'C', 'D');
      reviews.addReview(listingId, 'reviewer-y', 5, 'E', 'F');
      expect(reviews.getReviewCountByUser('reviewer-x')).toBe(2);
      expect(reviews.getReviewCountByUser('reviewer-y')).toBe(1);
      expect(reviews.getReviewCountByUser('nobody')).toBe(0);
    });
  });

  describe('listing rating update', () => {
    it('updates parent listing rating and reviewCount', () => {
      reviews.addReview(listingId, 'r1', 4, 'A', 'B');
      const listing = market.getListing(listingId)!;
      expect(listing.rating).toBe(4);
      expect(listing.reviewCount).toBe(1);

      reviews.addReview(listingId, 'r2', 2, 'C', 'D');
      expect(listing.rating).toBe(3);
      expect(listing.reviewCount).toBe(2);
    });

    it('updates updatedAt on listing when review is added', () => {
      const before = market.getListing(listingId)!.updatedAt;
      reviews.addReview(listingId, 'r1', 5, 'A', 'B');
      expect(market.getListing(listingId)!.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });
});

// ─────────────────────────────────────────────
// 3. ReputationEngine
// ─────────────────────────────────────────────

describe('ReputationEngine', () => {
  let rng: DeterministicRNG;
  let reputation: ReputationEngine;

  beforeEach(() => {
    rng = new DeterministicRNG('test-reputation');
    reputation = new ReputationEngine(rng);
  });

  describe('createProfile', () => {
    it('creates profile with all fields', () => {
      const profile = reputation.createProfile('user-1', 'Alice', 'A bio');
      expect(profile.id).toBe('user-1');
      expect(profile.displayName).toBe('Alice');
      expect(profile.bio).toBe('A bio');
      expect(profile.joinDate).toBeGreaterThan(0);
      expect(profile.badges).toEqual([]);
      expect(profile.seedsPublished).toBe(0);
      expect(profile.seedsPurchased).toBe(0);
      expect(profile.totalDownloads).toBe(0);
      expect(profile.reputation).toBe(0);
    });

    it('defaults bio to empty string', () => {
      const profile = reputation.createProfile('user-1', 'Bob');
      expect(profile.bio).toBe('');
    });

    it('throws for duplicate profile ID', () => {
      reputation.createProfile('user-1', 'Alice');
      expect(() => reputation.createProfile('user-1', 'Bob')).toThrow('Profile already exists');
    });
  });

  describe('getProfile', () => {
    it('returns profile by ID', () => {
      reputation.createProfile('user-1', 'Alice');
      const profile = reputation.getProfile('user-1');
      expect(profile).toBeDefined();
      expect(profile!.displayName).toBe('Alice');
    });

    it('returns undefined for unknown ID', () => {
      expect(reputation.getProfile('nonexistent')).toBeUndefined();
    });
  });

  describe('updateReputation', () => {
    it('adds positive delta to score', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.updateReputation('user-1', 10);
      expect(reputation.getProfile('user-1')!.reputation).toBe(10);
    });

    it('adds negative delta to score', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.updateReputation('user-1', -5);
      expect(reputation.getProfile('user-1')!.reputation).toBe(-5);
    });

    it('accumulates multiple updates', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.updateReputation('user-1', 10);
      reputation.updateReputation('user-1', 20);
      expect(reputation.getProfile('user-1')!.reputation).toBe(30);
    });

    it('throws for unknown profile', () => {
      expect(() => reputation.updateReputation('unknown', 10)).toThrow('Profile not found');
    });
  });

  describe('awardBadge', () => {
    it('awards badge to user', () => {
      reputation.createProfile('user-1', 'Alice');
      expect(reputation.awardBadge('user-1', 'pioneer')).toBe(true);
      expect(reputation.getProfile('user-1')!.badges).toContain('pioneer');
    });

    it('returns false for duplicate badge', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.awardBadge('user-1', 'pioneer');
      expect(reputation.awardBadge('user-1', 'pioneer')).toBe(false);
    });

    it('returns false for unknown profile', () => {
      expect(reputation.awardBadge('unknown', 'pioneer')).toBe(false);
    });

    it('awards multiple different badges', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.awardBadge('user-1', 'pioneer');
      reputation.awardBadge('user-1', 'seed_creator');
      expect(reputation.getProfile('user-1')!.badges).toHaveLength(2);
    });
  });

  describe('checkBadgeEligibility', () => {
    it('returns empty for unknown user', () => {
      expect(reputation.checkBadgeEligibility('unknown')).toEqual([]);
    });

    it('detects seed_creator when seedsPublished >= 5', () => {
      reputation.createProfile('user-1', 'Alice');
      const profile = reputation.getProfile('user-1')!;
      profile.seedsPublished = 5;
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).toContain('seed_creator');
    });

    it('does not detect seed_creator when seedsPublished < 5', () => {
      reputation.createProfile('user-1', 'Alice');
      const profile = reputation.getProfile('user-1')!;
      profile.seedsPublished = 4;
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).not.toContain('seed_creator');
    });

    it('detects evolution_master when reputation >= 100', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.updateReputation('user-1', 100);
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).toContain('evolution_master');
    });

    it('detects community_helper when reputation >= 50', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.updateReputation('user-1', 50);
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).toContain('community_helper');
    });

    it('detects top_seller when totalDownloads >= 100', () => {
      reputation.createProfile('user-1', 'Alice');
      const profile = reputation.getProfile('user-1')!;
      profile.totalDownloads = 100;
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).toContain('top_seller');
    });

    it('detects pioneer badge (profileIndex < 1000)', () => {
      reputation.createProfile('user-1', 'Alice');
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).toContain('pioneer');
    });

    it('excludes already-awarded badges', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.awardBadge('user-1', 'pioneer');
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).not.toContain('pioneer');
    });

    it('detects curator badge when reviewCount >= 10', () => {
      // Need a ReviewSystem-connected ReputationEngine for this
      const market = new Marketplace(rng);
      const reviewSys = new ReviewSystem(market, rng);
      const repWithReviews = new ReputationEngine(rng, reviewSys);
      repWithReviews.createProfile('user-1', 'Alice');

      // Create a listing and add 10 reviews by user-1
      const listing = market.listSeed(makeSeed(), 'seller', makeListOpts());
      for (let i = 0; i < 10; i++) {
        reviewSys.addReview(listing.id, 'user-1', 4, `Review ${i}`, 'Body');
      }

      const eligible = repWithReviews.checkBadgeEligibility('user-1');
      expect(eligible).toContain('curator');
    });

    it('does not detect curator without review system', () => {
      reputation.createProfile('user-1', 'Alice');
      const eligible = reputation.checkBadgeEligibility('user-1');
      expect(eligible).not.toContain('curator');
    });
  });

  describe('incrementSeedsPublished', () => {
    it('increments the counter', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.incrementSeedsPublished('user-1');
      expect(reputation.getProfile('user-1')!.seedsPublished).toBe(1);
    });

    it('does nothing for unknown user', () => {
      expect(() => reputation.incrementSeedsPublished('unknown')).not.toThrow();
    });
  });

  describe('incrementSeedsPurchased', () => {
    it('increments the counter', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.incrementSeedsPurchased('user-1');
      expect(reputation.getProfile('user-1')!.seedsPurchased).toBe(1);
    });

    it('does nothing for unknown user', () => {
      expect(() => reputation.incrementSeedsPurchased('unknown')).not.toThrow();
    });
  });

  describe('addDownloads', () => {
    it('adds to totalDownloads', () => {
      reputation.createProfile('user-1', 'Alice');
      reputation.addDownloads('user-1', 25);
      expect(reputation.getProfile('user-1')!.totalDownloads).toBe(25);
    });

    it('does nothing for unknown user', () => {
      expect(() => reputation.addDownloads('unknown', 10)).not.toThrow();
    });
  });

  describe('getProfileCount', () => {
    it('returns 0 initially', () => {
      expect(reputation.getProfileCount()).toBe(0);
    });

    it('increments with each profile', () => {
      reputation.createProfile('a', 'A');
      reputation.createProfile('b', 'B');
      expect(reputation.getProfileCount()).toBe(2);
    });
  });
});

// ─────────────────────────────────────────────
// 4. MessagingSystem
// ─────────────────────────────────────────────

describe('MessagingSystem', () => {
  let rng: DeterministicRNG;
  let messaging: MessagingSystem;

  beforeEach(() => {
    rng = new DeterministicRNG('test-messaging');
    messaging = new MessagingSystem(rng);
  });

  describe('sendMessage', () => {
    it('creates a message with correct fields', () => {
      const msg = messaging.sendMessage('alice', 'bob', 'Hello!');
      expect(msg.id).toBeTruthy();
      expect(msg.fromId).toBe('alice');
      expect(msg.toId).toBe('bob');
      expect(msg.content).toBe('Hello!');
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.read).toBe(false);
    });

    it('assigns unique IDs', () => {
      const m1 = messaging.sendMessage('alice', 'bob', 'Hi');
      const m2 = messaging.sendMessage('alice', 'bob', 'Hello');
      expect(m1.id).not.toBe(m2.id);
    });
  });

  describe('getMessages', () => {
    it('returns conversation between two users', () => {
      messaging.sendMessage('alice', 'bob', 'Hey');
      messaging.sendMessage('bob', 'alice', 'Hi');
      messaging.sendMessage('alice', 'charlie', 'Yo');

      const conversation = messaging.getMessages('alice', 'bob');
      expect(conversation).toHaveLength(2);
    });

    it('returns messages sorted by timestamp ascending', () => {
      messaging.sendMessage('alice', 'bob', 'First');
      messaging.sendMessage('bob', 'alice', 'Second');
      const msgs = messaging.getMessages('alice', 'bob');
      expect(msgs[0]!.content).toBe('First');
      expect(msgs[1]!.content).toBe('Second');
    });

    it('returns empty for no conversation', () => {
      expect(messaging.getMessages('alice', 'bob')).toEqual([]);
    });

    it('paginates with limit', () => {
      messaging.sendMessage('alice', 'bob', 'A');
      messaging.sendMessage('alice', 'bob', 'B');
      messaging.sendMessage('alice', 'bob', 'C');
      const msgs = messaging.getMessages('alice', 'bob', 2);
      expect(msgs).toHaveLength(2);
    });

    it('paginates with offset', () => {
      messaging.sendMessage('alice', 'bob', 'A');
      messaging.sendMessage('alice', 'bob', 'B');
      messaging.sendMessage('alice', 'bob', 'C');
      const msgs = messaging.getMessages('alice', 'bob', 2, 1);
      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.content).toBe('B');
    });
  });

  describe('markRead', () => {
    it('marks message as read and returns true', () => {
      const msg = messaging.sendMessage('alice', 'bob', 'Hi');
      expect(messaging.markRead(msg.id)).toBe(true);
      const conversation = messaging.getMessages('alice', 'bob');
      expect(conversation[0]!.read).toBe(true);
    });

    it('returns false for unknown message', () => {
      expect(messaging.markRead('nonexistent')).toBe(false);
    });
  });

  describe('getUnreadCount', () => {
    it('counts unread messages for user', () => {
      messaging.sendMessage('alice', 'bob', 'A');
      messaging.sendMessage('charlie', 'bob', 'B');
      messaging.sendMessage('bob', 'alice', 'C');
      expect(messaging.getUnreadCount('bob')).toBe(2);
    });

    it('decreases after markRead', () => {
      const msg = messaging.sendMessage('alice', 'bob', 'A');
      messaging.sendMessage('charlie', 'bob', 'B');
      expect(messaging.getUnreadCount('bob')).toBe(2);
      messaging.markRead(msg.id);
      expect(messaging.getUnreadCount('bob')).toBe(1);
    });

    it('returns 0 for user with no messages', () => {
      expect(messaging.getUnreadCount('nobody')).toBe(0);
    });
  });

  describe('createChannel', () => {
    it('creates a channel with correct fields', () => {
      const channel = messaging.createChannel('general', 'General talk', 'alice');
      expect(channel.id).toBeTruthy();
      expect(channel.name).toBe('general');
      expect(channel.topic).toBe('General talk');
      expect(channel.memberIds).toEqual(['alice']);
      expect(channel.messages).toEqual([]);
    });

    it('assigns unique channel IDs', () => {
      const c1 = messaging.createChannel('a', 'A', 'alice');
      const c2 = messaging.createChannel('b', 'B', 'alice');
      expect(c1.id).not.toBe(c2.id);
    });
  });

  describe('postToChannel', () => {
    it('adds message to channel', () => {
      const channel = messaging.createChannel('general', 'Topic', 'alice');
      const msg = messaging.postToChannel(channel.id, 'alice', 'Hello channel!');
      expect(msg.fromId).toBe('alice');
      expect(msg.toId).toBe(channel.id);
      expect(msg.content).toBe('Hello channel!');
    });

    it('throws for non-existent channel', () => {
      expect(() => messaging.postToChannel('fake', 'alice', 'Hi')).toThrow('Channel not found');
    });

    it('accumulates messages in channel', () => {
      const channel = messaging.createChannel('general', 'Topic', 'alice');
      messaging.postToChannel(channel.id, 'alice', 'First');
      messaging.postToChannel(channel.id, 'bob', 'Second');
      expect(channel.messages).toHaveLength(2);
    });
  });

  describe('getChannelMessages', () => {
    it('returns channel messages', () => {
      const channel = messaging.createChannel('general', 'Topic', 'alice');
      messaging.postToChannel(channel.id, 'alice', 'A');
      messaging.postToChannel(channel.id, 'bob', 'B');
      const msgs = messaging.getChannelMessages(channel.id);
      expect(msgs).toHaveLength(2);
    });

    it('paginates with limit and offset', () => {
      const channel = messaging.createChannel('general', 'Topic', 'alice');
      messaging.postToChannel(channel.id, 'alice', 'A');
      messaging.postToChannel(channel.id, 'alice', 'B');
      messaging.postToChannel(channel.id, 'alice', 'C');
      const msgs = messaging.getChannelMessages(channel.id, 2, 1);
      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.content).toBe('B');
    });

    it('returns empty for non-existent channel', () => {
      expect(messaging.getChannelMessages('fake')).toEqual([]);
    });
  });

  describe('getChannel', () => {
    it('returns channel by ID', () => {
      const channel = messaging.createChannel('general', 'Topic', 'alice');
      expect(messaging.getChannel(channel.id)).toBe(channel);
    });

    it('returns undefined for unknown ID', () => {
      expect(messaging.getChannel('fake')).toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────
// 5. CollaborationHub
// ─────────────────────────────────────────────

describe('CollaborationHub', () => {
  let rng: DeterministicRNG;
  let collab: CollaborationHub;

  beforeEach(() => {
    rng = new DeterministicRNG('test-collab');
    collab = new CollaborationHub(rng);
  });

  describe('createSession', () => {
    it('creates an active session with host as participant', () => {
      const session = collab.createSession('My Session', 'host-1');
      expect(session.id).toBeTruthy();
      expect(session.name).toBe('My Session');
      expect(session.hostId).toBe('host-1');
      expect(session.participantIds).toEqual(['host-1']);
      expect(session.seedIds).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.active).toBe(true);
    });

    it('assigns unique session IDs', () => {
      const s1 = collab.createSession('A', 'host');
      const s2 = collab.createSession('B', 'host');
      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('joinSession', () => {
    it('adds participant to session', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.joinSession(session.id, 'user-2')).toBe(true);
      expect(session.participantIds).toContain('user-2');
    });

    it('returns false for unknown session', () => {
      expect(collab.joinSession('fake', 'user')).toBe(false);
    });

    it('returns false for inactive session', () => {
      const session = collab.createSession('S', 'host');
      collab.endSession(session.id, 'host');
      expect(collab.joinSession(session.id, 'user')).toBe(false);
    });

    it('returns false if user already joined', () => {
      const session = collab.createSession('S', 'host');
      collab.joinSession(session.id, 'user-2');
      expect(collab.joinSession(session.id, 'user-2')).toBe(false);
    });

    it('returns false if host tries to re-join', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.joinSession(session.id, 'host')).toBe(false);
    });
  });

  describe('leaveSession', () => {
    it('removes participant', () => {
      const session = collab.createSession('S', 'host');
      collab.joinSession(session.id, 'user-2');
      expect(collab.leaveSession(session.id, 'user-2')).toBe(true);
      expect(session.participantIds).not.toContain('user-2');
    });

    it('host cannot leave', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.leaveSession(session.id, 'host')).toBe(false);
    });

    it('returns false for unknown session', () => {
      expect(collab.leaveSession('fake', 'user')).toBe(false);
    });

    it('returns false for non-participant', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.leaveSession(session.id, 'stranger')).toBe(false);
    });

    it('returns false for inactive session', () => {
      const session = collab.createSession('S', 'host');
      collab.joinSession(session.id, 'user-2');
      collab.endSession(session.id, 'host');
      expect(collab.leaveSession(session.id, 'user-2')).toBe(false);
    });
  });

  describe('addSeedToSession', () => {
    it('adds seed to session', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.addSeedToSession(session.id, 'seed-1')).toBe(true);
      expect(session.seedIds).toContain('seed-1');
    });

    it('returns false for duplicate seed', () => {
      const session = collab.createSession('S', 'host');
      collab.addSeedToSession(session.id, 'seed-1');
      expect(collab.addSeedToSession(session.id, 'seed-1')).toBe(false);
    });

    it('returns false for unknown session', () => {
      expect(collab.addSeedToSession('fake', 'seed-1')).toBe(false);
    });

    it('returns false for inactive session', () => {
      const session = collab.createSession('S', 'host');
      collab.endSession(session.id, 'host');
      expect(collab.addSeedToSession(session.id, 'seed-1')).toBe(false);
    });
  });

  describe('getActiveSession', () => {
    it('returns active session', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.getActiveSession(session.id)).toBe(session);
    });

    it('returns undefined for inactive session', () => {
      const session = collab.createSession('S', 'host');
      collab.endSession(session.id, 'host');
      expect(collab.getActiveSession(session.id)).toBeUndefined();
    });

    it('returns undefined for unknown session', () => {
      expect(collab.getActiveSession('fake')).toBeUndefined();
    });
  });

  describe('listActiveSessions', () => {
    it('returns only active sessions', () => {
      const s1 = collab.createSession('A', 'host');
      collab.createSession('B', 'host');
      collab.endSession(s1.id, 'host');
      const active = collab.listActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0]!.name).toBe('B');
    });

    it('returns empty when no sessions exist', () => {
      expect(collab.listActiveSessions()).toEqual([]);
    });
  });

  describe('endSession', () => {
    it('deactivates session', () => {
      const session = collab.createSession('S', 'host');
      expect(collab.endSession(session.id, 'host')).toBe(true);
      expect(session.active).toBe(false);
    });

    it('only host can end session', () => {
      const session = collab.createSession('S', 'host');
      collab.joinSession(session.id, 'user-2');
      expect(collab.endSession(session.id, 'user-2')).toBe(false);
      expect(session.active).toBe(true);
    });

    it('returns false for unknown session', () => {
      expect(collab.endSession('fake', 'host')).toBe(false);
    });

    it('returns false for already ended session', () => {
      const session = collab.createSession('S', 'host');
      collab.endSession(session.id, 'host');
      expect(collab.endSession(session.id, 'host')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
// 6. SocialEngine
// ─────────────────────────────────────────────

describe('SocialEngine', () => {
  let engine: SocialEngine;

  beforeEach(() => {
    engine = new SocialEngine(new DeterministicRNG('test-social'));
  });

  describe('constructor', () => {
    it('creates all subsystems', () => {
      expect(engine.marketplace).toBeInstanceOf(Marketplace);
      expect(engine.reviews).toBeInstanceOf(ReviewSystem);
      expect(engine.reputation).toBeInstanceOf(ReputationEngine);
      expect(engine.messaging).toBeInstanceOf(MessagingSystem);
      expect(engine.collaboration).toBeInstanceOf(CollaborationHub);
    });

    it('works with default RNG when none provided', () => {
      const defaultEngine = new SocialEngine();
      expect(defaultEngine.marketplace).toBeInstanceOf(Marketplace);
    });
  });

  describe('fromSeed', () => {
    it('creates marketplace listing from seed', () => {
      const seed = makeSeed({ name: 'My Warrior', domain: 'organism', creator: 'alice' });
      const listing = engine.fromSeed(seed);
      expect(listing.title).toBe('My Warrior');
      expect(listing.sellerId).toBe('alice');
      expect(listing.tags).toContain('organism');
    });

    it('uses anonymous when no creator or sellerId', () => {
      const seed = makeSeed({ name: 'Orphan' });
      const listing = engine.fromSeed(seed);
      expect(listing.sellerId).toBe('anonymous');
    });

    it('uses provided sellerId over seed creator', () => {
      const seed = makeSeed({ creator: 'alice' });
      const listing = engine.fromSeed(seed, 'bob');
      expect(listing.sellerId).toBe('bob');
    });

    it('generates title from domain when seed name is empty', () => {
      const seed = makeSeed({ name: '', domain: 'vehicle' });
      const listing = engine.fromSeed(seed);
      expect(listing.title).toBe('Vehicle Seed');
    });

    it('generates description from domain and gene count when no description', () => {
      const seed = makeSeed({ domain: 'weapon' });
      const listing = engine.fromSeed(seed);
      expect(listing.description).toContain('weapon');
      expect(listing.description).toContain('1 genes');
    });

    it('uses seed metadata description when available', () => {
      const seed = makeSeed({ description: 'Custom desc' });
      const listing = engine.fromSeed(seed);
      expect(listing.description).toBe('Custom desc');
    });

    it('extracts tags from metadata tags', () => {
      const seed = makeSeed({ tags: ['combat', 'magic'] });
      const listing = engine.fromSeed(seed);
      expect(listing.tags).toContain('combat');
      expect(listing.tags).toContain('magic');
    });

    it('extracts tags from display tags', () => {
      const seed = makeSeed({ displayTags: ['visual', 'shiny'] });
      const listing = engine.fromSeed(seed);
      expect(listing.tags).toContain('visual');
      expect(listing.tags).toContain('shiny');
    });

    it('extracts gene keys as tags (up to 5)', () => {
      const genes: GeneMap = {};
      for (let i = 0; i < 7; i++) {
        genes[`gene_${i}`] = { type: 'scalar', value: 0.5, min: 0, max: 1 };
      }
      const seed = makeSeed({ genes });
      const listing = engine.fromSeed(seed);
      // domain + up to 5 gene keys
      const geneTagCount = listing.tags.filter((t) => t.startsWith('gene_')).length;
      expect(geneTagCount).toBeLessThanOrEqual(5);
    });

    it('avoids duplicate tags', () => {
      const seed = makeSeed({ domain: 'organism', tags: ['organism'] });
      const listing = engine.fromSeed(seed);
      const orgCount = listing.tags.filter((t) => t === 'organism').length;
      expect(orgCount).toBe(1);
    });

    it('infers free pricing for simple low-fitness seeds', () => {
      const seed = makeSeed({ fitness: 0.1 });
      const listing = engine.fromSeed(seed);
      expect(listing.pricing).toBe('free');
      expect(listing.price).toBe(0);
    });

    it('infers auction pricing for high-fitness seeds', () => {
      const genes: GeneMap = {};
      for (let i = 0; i < 5; i++) {
        genes[`g${i}`] = { type: 'scalar', value: 0.5, min: 0, max: 1 };
      }
      const seed = makeSeed({ fitness: 0.95, genes });
      const listing = engine.fromSeed(seed);
      expect(listing.pricing).toBe('auction');
    });

    it('infers fixed pricing for seeds with > 10 genes', () => {
      const genes: GeneMap = {};
      for (let i = 0; i < 12; i++) {
        genes[`g${i}`] = { type: 'scalar', value: 0.5, min: 0, max: 1 };
      }
      const seed = makeSeed({ fitness: 0.7, genes });
      const listing = engine.fromSeed(seed);
      expect(listing.pricing).toBe('fixed');
    });

    it('infers donation pricing for medium seeds', () => {
      const genes: GeneMap = {};
      for (let i = 0; i < 5; i++) {
        genes[`g${i}`] = { type: 'scalar', value: 0.5, min: 0, max: 1 };
      }
      const seed = makeSeed({ fitness: 0.6, genes });
      const listing = engine.fromSeed(seed);
      expect(listing.pricing).toBe('donation');
    });

    it('increments seller seedsPublished in reputation', () => {
      engine.reputation.createProfile('alice', 'Alice');
      const seed = makeSeed({ creator: 'alice' });
      engine.fromSeed(seed);
      expect(engine.reputation.getProfile('alice')!.seedsPublished).toBe(1);
    });

    it('calculates price based on gene count and fitness', () => {
      const genes: GeneMap = {};
      for (let i = 0; i < 5; i++) {
        genes[`g${i}`] = { type: 'scalar', value: 0.5, min: 0, max: 1 };
      }
      // 5 genes, fitness 0.6 -> donation pricing
      // price = round(5 * 10 * (1 + 0.6 * 2)) = round(50 * 2.2) = 110
      const seed = makeSeed({ fitness: 0.6, genes });
      const listing = engine.fromSeed(seed);
      expect(listing.price).toBe(110);
    });
  });

  describe('purchase', () => {
    it('wires marketplace purchase and reputation updates', () => {
      engine.reputation.createProfile('seller-1', 'Seller');
      engine.reputation.createProfile('buyer-1', 'Buyer');

      const seed = makeSeed({ creator: 'seller-1' });
      const listing = engine.fromSeed(seed);

      const result = engine.purchase(listing.id, 'buyer-1');
      expect(result.success).toBe(true);
      expect(result.seed).toBe(seed);

      // Buyer reputation: +1 rep, +1 seedsPurchased
      const buyer = engine.reputation.getProfile('buyer-1')!;
      expect(buyer.seedsPurchased).toBe(1);
      expect(buyer.reputation).toBe(1);

      // Seller reputation: +2 rep, +1 totalDownloads
      const seller = engine.reputation.getProfile('seller-1')!;
      expect(seller.reputation).toBe(2);
      expect(seller.totalDownloads).toBe(1);
    });

    it('returns failure for non-existent listing', () => {
      const result = engine.purchase('nonexistent', 'buyer');
      expect(result.success).toBe(false);
      expect(result.seed).toBeUndefined();
    });

    it('does not update reputation on failed purchase', () => {
      engine.reputation.createProfile('buyer-1', 'Buyer');
      engine.purchase('nonexistent', 'buyer-1');
      expect(engine.reputation.getProfile('buyer-1')!.reputation).toBe(0);
    });

    it('throws when buyer profile does not exist for reputation update', () => {
      const seed = makeSeed();
      const listing = engine.marketplace.listSeed(seed, 'seller', makeListOpts());
      // updateReputation throws for unknown profiles
      expect(() => engine.purchase(listing.id, 'buyer')).toThrow('Profile not found');
    });

    it('accumulates reputation over multiple purchases', () => {
      engine.reputation.createProfile('seller', 'Seller');
      engine.reputation.createProfile('buyer', 'Buyer');

      const l1 = engine.fromSeed(makeSeed({ creator: 'seller' }));
      const l2 = engine.fromSeed(makeSeed({ creator: 'seller' }));

      engine.purchase(l1.id, 'buyer');
      engine.purchase(l2.id, 'buyer');

      expect(engine.reputation.getProfile('buyer')!.reputation).toBe(2);
      expect(engine.reputation.getProfile('buyer')!.seedsPurchased).toBe(2);
      expect(engine.reputation.getProfile('seller')!.reputation).toBe(4);
      expect(engine.reputation.getProfile('seller')!.totalDownloads).toBe(2);
    });
  });
});
