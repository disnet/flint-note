# Subscription & Monetization Strategy

**← Previous:** [Future Enhancements](./09-FUTURE-ENHANCEMENTS.md)

---

## Overview

This document outlines the strategy for implementing a paid subscription tier for Flint sync using Stripe. While infrastructure costs are low (~$0.03/user/month), a premium tier enables sustainable growth and advanced features.

**Key Principle:** Free tier remains generous. Premium tier is for power users who need more storage and advanced features.

---

## Tier Structure

### Free Tier

**Target:** Individual users with basic sync needs

| Feature | Limit |
|---------|-------|
| Storage | 1 GB |
| Devices | Unlimited |
| Notes | Unlimited |
| Sync frequency | Every 30 seconds |
| Version history | 7 days |
| Support | Community |

**Cost to Flint:** ~$0.03/user/month

### Pro Tier

**Target:** Power users, professionals, heavy note-takers

**Price:** $5/month or $48/year (20% discount)

| Feature | Limit |
|---------|-------|
| Storage | 50 GB |
| Devices | Unlimited |
| Notes | Unlimited |
| Sync frequency | Real-time |
| Version history | 90 days |
| Support | Email (48h response) |
| Early access | Beta features |

**Cost to Flint:** ~$0.10-0.20/user/month (including higher storage/operations)

**Margin:** ~$4.80/user/month (96% margin)

### Team Tier (Future)

**Target:** Small teams, collaborators

**Price:** $10/user/month

| Feature | Limit |
|---------|-------|
| Everything in Pro | ✅ |
| Shared vaults | Unlimited |
| Admin controls | User management |
| Team version history | 1 year |
| Support | Priority email (24h) |

---

## Technical Implementation

### 1. Backend Database Schema

Add subscription tracking to the Flint Sync Service (Cloudflare Worker + D1):

```sql
-- Subscriptions table
CREATE TABLE subscriptions (
  did TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'team')),
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end BOOLEAN DEFAULT 0,
  trial_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_tier ON subscriptions(tier);

-- Update quotas table to use tier-based limits
ALTER TABLE quotas ADD COLUMN tier TEXT DEFAULT 'free';

-- Create tier limits lookup
CREATE TABLE tier_limits (
  tier TEXT PRIMARY KEY,
  storage_limit_bytes INTEGER NOT NULL,
  sync_frequency_seconds INTEGER NOT NULL,
  version_history_days INTEGER NOT NULL
);

INSERT INTO tier_limits VALUES
  ('free', 1073741824, 30, 7),      -- 1GB, 30s, 7 days
  ('pro', 53687091200, 5, 90),      -- 50GB, 5s, 90 days
  ('team', 107374182400, 1, 365);   -- 100GB, 1s, 365 days

-- Subscription events log
CREATE TABLE subscription_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  did TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  metadata TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subscription_events_did ON subscription_events(did);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
```

### 2. API Endpoints

Add to Flint Sync Service (Cloudflare Worker):

#### POST /subscription/create-checkout

Create Stripe Checkout session for new subscription.

**Request:**
```typescript
interface CreateCheckoutRequest {
  did: string;
  tier: 'pro' | 'team';
  interval: 'month' | 'year';
  dpopToken: string;
}

// Headers
{
  "Content-Type": "application/json",
  "DPoP": "<dpop-proof-jwt>"
}
```

**Response:**
```typescript
interface CreateCheckoutResponse {
  checkoutUrl: string;  // Redirect user to this URL
  sessionId: string;
}
```

#### POST /subscription/create-portal

Create Stripe Customer Portal session for managing subscription.

**Request:**
```typescript
interface CreatePortalRequest {
  did: string;
  dpopToken: string;
  returnUrl: string;  // Where to redirect after portal
}
```

**Response:**
```typescript
interface CreatePortalResponse {
  portalUrl: string;
}
```

#### GET /subscription/status/:did

Get current subscription status.

**Response:**
```typescript
interface SubscriptionStatus {
  did: string;
  tier: 'free' | 'pro' | 'team';
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  currentPeriodEnd?: string;  // ISO timestamp
  cancelAtPeriodEnd: boolean;
  storageUsed: number;
  storageLimit: number;
  features: {
    syncFrequency: number;     // seconds
    versionHistory: number;    // days
    prioritySupport: boolean;
  };
}
```

#### POST /webhooks/stripe

Handle Stripe webhook events.

**Events handled:**
- `checkout.session.completed` - New subscription created
- `customer.subscription.created` - Subscription started
- `customer.subscription.updated` - Subscription changed (upgrade/downgrade)
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed

### 3. Modified Authorization Flow

Update the existing `POST /credentials` endpoint to check subscription:

```typescript
async function handleCredentialsRequest(request: Request, env: Env): Promise<Response> {
  const { did, dpopToken } = await request.json();

  // 1. Verify AT Protocol DPoP token (existing)
  const verified = await verifyATProtocolToken(dpopToken, did, request);
  if (!verified) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Check subscription status (NEW)
  const subscription = await getSubscription(did, env);

  if (subscription.status === 'unpaid' || subscription.status === 'past_due') {
    return new Response(JSON.stringify({
      error: 'subscription_past_due',
      message: 'Your subscription payment is past due. Please update your payment method.',
      portalUrl: await createCustomerPortalUrl(did, env)
    }), {
      status: 402, // Payment Required
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. Check storage quota with tier-specific limits (UPDATED)
  const tierLimits = await getTierLimits(subscription.tier, env);
  const quota = await checkStorageQuota(did, env);

  if (quota.used >= tierLimits.storage_limit_bytes) {
    return new Response(JSON.stringify({
      error: 'quota_exceeded',
      message: subscription.tier === 'free'
        ? 'You have exceeded your 1GB free tier limit. Upgrade to Pro for 50GB storage.'
        : 'Storage quota exceeded. Please free up space or contact support.',
      upgradeUrl: subscription.tier === 'free' ? 'https://flint.app/upgrade' : null
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. Generate scoped R2 credentials (existing)
  const credentials = await generateScopedR2Credentials(did, env);

  return new Response(JSON.stringify({
    r2Credentials: credentials,
    subscription: {
      tier: subscription.tier,
      storageUsed: quota.used,
      storageLimit: tierLimits.storage_limit_bytes,
      features: {
        syncFrequency: tierLimits.sync_frequency_seconds,
        versionHistory: tierLimits.version_history_days
      }
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 4. Stripe Webhook Handler

```typescript
async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return new Response('Missing signature', { status: 400 });
  }

  try {
    const body = await request.text();
    const event = await verifyStripeWebhook(body, sig, env.STRIPE_WEBHOOK_SECRET);

    // Log event
    await logSubscriptionEvent(event, env);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const did = session.metadata.did;
        const tier = session.metadata.tier;

        // Create or update subscription record
        await env.QUOTA_DB.prepare(`
          INSERT INTO subscriptions (did, stripe_customer_id, stripe_subscription_id, status, tier, current_period_end)
          VALUES (?, ?, ?, 'active', ?, ?)
          ON CONFLICT(did) DO UPDATE SET
            stripe_subscription_id = excluded.stripe_subscription_id,
            status = excluded.status,
            tier = excluded.tier,
            current_period_end = excluded.current_period_end,
            updated_at = datetime('now')
        `).bind(
          did,
          session.customer,
          session.subscription,
          tier,
          new Date(session.expires_at * 1000).toISOString()
        ).run();

        // Update quota limits
        await updateQuotaLimits(did, tier, env);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const did = await getDIDFromCustomerId(subscription.customer, env);

        await env.QUOTA_DB.prepare(`
          UPDATE subscriptions
          SET status = ?,
              current_period_end = ?,
              cancel_at_period_end = ?,
              updated_at = datetime('now')
          WHERE did = ?
        `).bind(
          subscription.status,
          new Date(subscription.current_period_end * 1000).toISOString(),
          subscription.cancel_at_period_end ? 1 : 0,
          did
        ).run();
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const did = await getDIDFromCustomerId(subscription.customer, env);

        // Downgrade to free tier
        await env.QUOTA_DB.prepare(`
          UPDATE subscriptions
          SET status = 'canceled',
              tier = 'free',
              updated_at = datetime('now')
          WHERE did = ?
        `).bind(did).run();

        // Update quota to free tier limits
        await updateQuotaLimits(did, 'free', env);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const did = await getDIDFromCustomerId(invoice.customer, env);

        await env.QUOTA_DB.prepare(`
          UPDATE subscriptions
          SET status = 'past_due',
              updated_at = datetime('now')
          WHERE did = ?
        `).bind(did).run();
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const did = await getDIDFromCustomerId(invoice.customer, env);

        await env.QUOTA_DB.prepare(`
          UPDATE subscriptions
          SET status = 'active',
              updated_at = datetime('now')
          WHERE did = ?
        `).bind(did).run();
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(error.message, { status: 400 });
  }
}
```

### 5. Stripe Configuration

**Products and Prices to create:**

```typescript
// Stripe Dashboard or via API
const products = [
  {
    name: 'Flint Pro',
    description: '50GB storage, real-time sync, 90-day version history',
    prices: [
      { amount: 500, currency: 'usd', interval: 'month' },  // $5/month
      { amount: 4800, currency: 'usd', interval: 'year' }   // $48/year
    ]
  },
  {
    name: 'Flint Team',
    description: '100GB storage, shared vaults, priority support',
    prices: [
      { amount: 1000, currency: 'usd', interval: 'month' }  // $10/user/month
    ]
  }
];
```

**Webhook endpoint:**
- URL: `https://sync.flint.app/webhooks/stripe`
- Events: Select all customer and subscription events

---

## Client-Side Implementation

### 1. Subscription Status Service

```typescript
// src/renderer/src/services/subscription-service.svelte.ts

export class SubscriptionService {
  private status = $state<SubscriptionStatus | null>(null);
  private checkInterval: NodeJS.Timeout | null = null;

  async initialize(did: string): Promise<void> {
    await this.fetchStatus(did);

    // Check status periodically
    this.checkInterval = setInterval(() => {
      this.fetchStatus(did);
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  async fetchStatus(did: string): Promise<void> {
    try {
      const response = await window.api?.syncGetSubscriptionStatus(did);
      this.status = response;
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    }
  }

  get currentStatus(): SubscriptionStatus | null {
    return this.status;
  }

  get tier(): 'free' | 'pro' | 'team' {
    return this.status?.tier || 'free';
  }

  get storageUsagePercent(): number {
    if (!this.status) return 0;
    return (this.status.storageUsed / this.status.storageLimit) * 100;
  }

  get canUpgrade(): boolean {
    return this.tier === 'free';
  }

  async openCheckout(tier: 'pro' | 'team', interval: 'month' | 'year'): Promise<void> {
    const did = this.status?.did;
    if (!did) throw new Error('No DID available');

    const response = await window.api?.syncCreateCheckout({ did, tier, interval });
    if (response?.checkoutUrl) {
      // Open Stripe Checkout in external browser
      await window.api?.openExternal(response.checkoutUrl);
    }
  }

  async openCustomerPortal(): Promise<void> {
    const did = this.status?.did;
    if (!did) throw new Error('No DID available');

    const response = await window.api?.syncCreatePortal({
      did,
      returnUrl: 'flint://settings/subscription'
    });

    if (response?.portalUrl) {
      await window.api?.openExternal(response.portalUrl);
    }
  }

  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}
```

### 2. Upgrade UI Component

```svelte
<!-- src/renderer/src/components/SubscriptionUpgrade.svelte -->
<script lang="ts">
import { subscriptionService } from '../services/subscription-service.svelte';

const status = $derived(subscriptionService.currentStatus);
const usagePercent = $derived(subscriptionService.storageUsagePercent);
const canUpgrade = $derived(subscriptionService.canUpgrade);

async function handleUpgrade(tier: 'pro' | 'team', interval: 'month' | 'year') {
  await subscriptionService.openCheckout(tier, interval);
}
</script>

<div class="subscription-upgrade">
  {#if canUpgrade}
    <div class="usage-banner" class:warning={usagePercent > 80}>
      <div class="usage-bar">
        <div class="usage-fill" style="width: {usagePercent}%"></div>
      </div>
      <p>
        Using {formatBytes(status?.storageUsed || 0)} of {formatBytes(status?.storageLimit || 0)}
        {#if usagePercent > 80}
          <span class="warning-text">Running low on storage!</span>
        {/if}
      </p>
    </div>

    <div class="tier-cards">
      <div class="tier-card">
        <h3>Free</h3>
        <p class="price">$0</p>
        <ul>
          <li>1 GB storage</li>
          <li>Unlimited devices</li>
          <li>30s sync frequency</li>
          <li>7-day version history</li>
        </ul>
        <button disabled>Current Plan</button>
      </div>

      <div class="tier-card featured">
        <h3>Pro</h3>
        <div class="price-toggle">
          <button onclick={() => handleUpgrade('pro', 'month')}>
            <span class="price">$5</span>
            <span class="interval">/month</span>
          </button>
          <button onclick={() => handleUpgrade('pro', 'year')}>
            <span class="price">$48</span>
            <span class="interval">/year</span>
            <span class="badge">Save 20%</span>
          </button>
        </div>
        <ul>
          <li>50 GB storage</li>
          <li>Unlimited devices</li>
          <li>Real-time sync</li>
          <li>90-day version history</li>
          <li>Priority support</li>
        </ul>
      </div>
    </div>
  {:else}
    <div class="current-subscription">
      <h3>Current Plan: {status?.tier}</h3>
      <p>
        Using {formatBytes(status?.storageUsed || 0)} of {formatBytes(status?.storageLimit || 0)}
      </p>
      <button onclick={() => subscriptionService.openCustomerPortal()}>
        Manage Subscription
      </button>
    </div>
  {/if}
</div>
```

### 3. Quota Exceeded Handling

```typescript
// src/renderer/src/services/sync-service.svelte.ts

async function handleSyncError(error: any): Promise<void> {
  if (error.status === 402) {
    // Payment required
    const data = await error.json();

    notifications.show({
      type: 'error',
      title: 'Subscription Past Due',
      message: data.message,
      actions: [{
        label: 'Update Payment',
        action: () => subscriptionService.openCustomerPortal()
      }]
    });
  } else if (error.status === 403 && error.error === 'quota_exceeded') {
    const data = await error.json();

    if (data.upgradeUrl) {
      // Free tier quota exceeded
      notifications.show({
        type: 'warning',
        title: 'Storage Limit Reached',
        message: 'You have reached your 1GB free tier limit.',
        actions: [{
          label: 'Upgrade to Pro',
          action: () => subscriptionService.openCheckout('pro', 'month')
        }]
      });
    } else {
      // Pro tier quota exceeded
      notifications.show({
        type: 'error',
        title: 'Storage Limit Reached',
        message: 'Please free up space or contact support.',
        actions: [{
          label: 'Manage Storage',
          action: () => router.navigate('/settings/storage')
        }]
      });
    }
  }
}
```

---

## Migration Strategy

### Phase 1: Backend Setup (Week 1)

1. Deploy updated Cloudflare Worker with new endpoints
2. Create Stripe account and configure products/prices
3. Set up webhook endpoint
4. Deploy D1 database schema updates
5. Test subscription flows in staging

### Phase 2: Client Integration (Week 2)

1. Implement subscription service in Electron app
2. Add upgrade UI to settings
3. Handle quota exceeded errors gracefully
4. Add storage usage indicators
5. Test end-to-end flows

### Phase 3: Soft Launch (Week 3-4)

1. Enable for small group of beta testers
2. Monitor webhook events and errors
3. Collect feedback on pricing and UX
4. Fix any integration issues

### Phase 4: Public Launch (Week 5+)

1. Announce Pro tier to all users
2. Offer limited-time promotional pricing
3. Monitor conversion rates and churn
4. Iterate based on feedback

---

## Existing User Migration

### Grandfathering Strategy

**Option A: Generous Grace Period**
- All existing free users keep 1GB limit
- 6-month grace period before any changes
- Proactive communication about new limits

**Option B: Limited Grandfathering**
- Users under 1GB: No change
- Users 1-5GB: 3-month grace period, then read-only if not upgraded
- Users >5GB: 1-month grace period, then read-only

**Recommendation:** Option A - Prioritize goodwill and user trust

### Communication Plan

**Timeline:**
1. **T-60 days:** Announce Pro tier, emphasize free tier remains
2. **T-30 days:** Email users over 500MB about upcoming limits
3. **T-14 days:** In-app notification about Pro tier benefits
4. **T-7 days:** Final reminder for users approaching limits
5. **T-0 days:** Launch Pro tier
6. **T+7 days:** Follow-up email with upgrade incentive

---

## Compliance & Legal

### Required Disclosures

1. **Terms of Service updates:**
   - Subscription terms
   - Refund policy
   - Cancellation policy
   - Storage limits enforcement

2. **Privacy Policy updates:**
   - Stripe payment processing
   - Subscription data storage
   - Billing information handling

3. **Stripe compliance:**
   - SCA (Strong Customer Authentication) for EU
   - PCI DSS handled by Stripe
   - Tax collection via Stripe Tax

### Refund Policy

**Recommendation:**
- 14-day money-back guarantee (no questions asked)
- Prorated refunds for annual plans if canceled early
- No refunds for partial months on monthly plans

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Conversion:**
   - Free → Pro conversion rate
   - Checkout abandonment rate
   - Upgrade prompt click-through rate

2. **Revenue:**
   - MRR (Monthly Recurring Revenue)
   - ARR (Annual Recurring Revenue)
   - LTV (Lifetime Value)
   - Churn rate

3. **Usage:**
   - Average storage per tier
   - % of free users over 500MB
   - Sync frequency distribution

4. **Support:**
   - Payment failure rate
   - Subscription support tickets
   - Refund requests

### Alerting

Set up alerts for:
- Payment failure spike (>5% of subscriptions)
- Webhook processing errors
- Unusual subscription cancellations
- Revenue drop >10% week-over-week

---

## Cost Impact

### Infrastructure Scaling

With paid tier, costs change:

| User Count | Free Users | Pro Users | Monthly Cost |
|------------|------------|-----------|--------------|
| 10,000 | 9,000 | 1,000 | $520 |
| 100,000 | 90,000 | 10,000 | $5,200 |
| 1,000,000 | 900,000 | 100,000 | $52,000 |

**Assumptions:**
- 10% conversion to Pro
- Pro users average 5GB storage
- Pro users 3x more operations

### Revenue Projection

| User Count | Pro Users (10%) | Monthly Revenue | Infrastructure Cost | Net Profit |
|------------|----------------|-----------------|--------------------:|------------|
| 10,000 | 1,000 | $5,000 | $520 | $4,480 |
| 100,000 | 10,000 | $50,000 | $5,200 | $44,800 |
| 1,000,000 | 100,000 | $500,000 | $52,000 | $448,000 |

**Even at 3% conversion, revenue exceeds costs at 10K+ users**

---

## Alternative Pricing Models

### Model 1: Pay-As-You-Go

- $0.05/GB/month (only pay for what you use)
- Minimum $1/month
- No artificial limits

**Pros:**
- Fair pricing
- Scales with usage

**Cons:**
- Unpredictable bills
- Complex billing logic
- Lower revenue per user

### Model 2: Freemium with Add-ons

- Free: 1GB
- +10GB: $2/month
- +50GB: $5/month
- Features sold separately

**Pros:**
- Modular pricing
- Upsell opportunities

**Cons:**
- Complex pricing
- Decision fatigue

### Recommendation

Stick with simple tier-based pricing initially. Can experiment with alternatives later.

---

## Summary

### Key Decisions

1. **Tier Structure:** Free (1GB) → Pro ($5/month, 50GB)
2. **Payment Processor:** Stripe (industry standard)
3. **Enforcement:** Soft limits with upgrade prompts
4. **Migration:** Generous 6-month grace period
5. **Launch Strategy:** Phased rollout with beta testing

### Implementation Checklist

- [ ] Deploy Cloudflare Worker updates
- [ ] Create Stripe products and prices
- [ ] Implement webhook handler
- [ ] Update D1 database schema
- [ ] Build client-side subscription service
- [ ] Design upgrade UI
- [ ] Write Terms of Service updates
- [ ] Set up monitoring and alerts
- [ ] Test end-to-end flows
- [ ] Soft launch with beta users
- [ ] Public launch with communication plan

### Next Steps

1. Review and approve pricing strategy
2. Set up Stripe account
3. Begin backend implementation (2 weeks)
4. Design and implement client UI (2 weeks)
5. Beta test with 100 users (2 weeks)
6. Public launch

---

**← Previous:** [Future Enhancements](./09-FUTURE-ENHANCEMENTS.md)
