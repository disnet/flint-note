# Cost Estimates & Scaling

**← Previous:** [UI Design & User Experience](./06-UI-DESIGN.md) | **Next:** [Risks & Mitigations](./08-RISKS-MITIGATIONS.md) →

---

## Overview

This document provides detailed cost estimates for operating the Flint sync infrastructure using Cloudflare R2 and Workers. The analysis includes per-user costs, scaling projections, and optimization strategies to ensure the service remains economically sustainable.

---

## Cloudflare R2 Pricing

Cloudflare R2 offers competitive S3-compatible object storage with zero egress fees:

| Service | Cost |
|---------|------|
| **Storage** | $0.015/GB/month |
| **Class A operations (write)** | $4.50/million operations |
| **Class B operations (read)** | $0.36/million operations |
| **Egress** | Free |

### Additional Infrastructure Costs

| Service | Cost |
|---------|------|
| **Cloudflare Workers** | Free tier: 100K requests/day<br>Paid: $5/month for 10M requests |
| **Cloudflare D1 (quota tracking)** | Free tier: 5M reads/day, 100K writes/day<br>Paid: $5/month for 25M reads, 50M writes |
| **Cloudflare KV (alternative)** | Free tier: 100K reads/day, 1K writes/day<br>Paid: $5/month for 10M reads, 1M writes |

---

## Example User Cost Breakdown

### Typical User Profile

**Assumptions:**
- 1,000 notes in vault
- Average note size: 10KB (includes frontmatter + content)
- Total storage: 10MB per user

**Usage Patterns:**
- 100 edits per day (creates, updates, deletes)
- 500 sync operations per month (reading documents from R2)
- Multiple devices syncing periodically

### Cost Calculation

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Storage** | 0.01 GB × $0.015/GB | $0.00015 |
| **Write Operations** | 100 edits/day × 30 days = 3,000 writes<br>3,000 ÷ 1,000,000 × $4.50 | $0.01350 |
| **Read Operations** | 500 syncs × 10 docs avg = 5,000 reads<br>5,000 ÷ 1,000,000 × $0.36 | $0.00180 |
| **Workers/D1** | Included in free tier | $0.00000 |
| **Total per user** | | **$0.01545/month** |

**Simplified:** **~$0.02/user/month** (essentially negligible)

---

## Power User Profile

For users with larger vaults and more active syncing:

**Assumptions:**
- 10,000 notes in vault
- Average note size: 15KB
- Total storage: 150MB per user

**Usage Patterns:**
- 500 edits per day
- 2,000 sync operations per month
- 5+ devices syncing frequently

### Cost Calculation

| Component | Calculation | Monthly Cost |
|-----------|-------------|--------------|
| **Storage** | 0.15 GB × $0.015/GB | $0.00225 |
| **Write Operations** | 500 edits/day × 30 days = 15,000 writes<br>15,000 ÷ 1,000,000 × $4.50 | $0.06750 |
| **Read Operations** | 2,000 syncs × 20 docs avg = 40,000 reads<br>40,000 ÷ 1,000,000 × $0.36 | $0.01440 |
| **Total per power user** | | **$0.08415/month** |

**Simplified:** **~$0.08/user/month** (still very low)

---

## Scale Projections

### 10,000 Users

| User Type | Percentage | Count | Cost per User | Total Cost |
|-----------|-----------|-------|---------------|------------|
| Typical | 80% | 8,000 | $0.02 | $160 |
| Power | 20% | 2,000 | $0.08 | $160 |
| **Total** | | **10,000** | | **$320/month** |

**Additional Infrastructure:**
- Workers: Free tier sufficient (100K req/day covers 10K users)
- D1: Free tier sufficient for quota tracking

**Total Monthly Cost:** **~$320/month** for 10,000 users

---

### 100,000 Users

| User Type | Percentage | Count | Cost per User | Total Cost |
|-----------|-----------|-------|---------------|------------|
| Typical | 80% | 80,000 | $0.02 | $1,600 |
| Power | 20% | 20,000 | $0.08 | $1,600 |
| **Total** | | **100,000** | | **$3,200/month** |

**Additional Infrastructure:**
- Workers: Paid tier required (~$5-10/month for 100K users)
- D1: Free tier likely sufficient, paid tier ~$5/month if needed

**Total Monthly Cost:** **~$3,220/month** for 100,000 users

**Per-user cost:** **$0.03/user/month**

---

### 1,000,000 Users (Future Scale)

| User Type | Percentage | Count | Cost per User | Total Cost |
|-----------|-----------|-------|---------------|------------|
| Typical | 80% | 800,000 | $0.02 | $16,000 |
| Power | 20% | 200,000 | $0.08 | $16,000 |
| **Total** | | **1,000,000** | | **$32,000/month** |

**Additional Infrastructure:**
- Workers: Paid tier ~$50-100/month for 1M users
- D1: Paid tier ~$25-50/month for quota tracking

**Total Monthly Cost:** **~$32,150/month** for 1,000,000 users

**Per-user cost:** **$0.032/user/month**

---

## Cost Comparison Table

| User Count | Monthly Cost | Cost per User | Notes |
|------------|--------------|---------------|-------|
| 1,000 | $32 | $0.032 | Free tier infrastructure |
| 10,000 | $320 | $0.032 | Free tier infrastructure |
| 100,000 | $3,220 | $0.032 | Paid infrastructure tier |
| 1,000,000 | $32,150 | $0.032 | Paid infrastructure tier |

**Key Insight:** Per-user costs remain remarkably consistent across scale (~$0.03/month) due to R2's linear pricing model.

---

## Cost Optimization Strategies

### 1. Compression

**Impact:** 50-70% storage reduction

Apply compression to Automerge binaries before encryption:

```typescript
import pako from 'pako';

async function compressAndEncrypt(data: Uint8Array): Promise<Uint8Array> {
  // Compress with gzip
  const compressed = pako.gzip(data);

  // Then encrypt
  const encrypted = await this.encryption.encrypt(compressed);

  return encrypted;
}
```

**Savings:**
- Storage: 50% reduction = $0.0001/user/month
- Bandwidth: Faster syncs, better UX
- Not significant savings but improves performance

### 2. Incremental Sync

Only sync changed documents instead of full vault on each sync:

**Current (full sync):**
- 1,000 docs × 500 syncs/month = 500,000 reads

**Optimized (incremental):**
- 10 changed docs × 500 syncs/month = 5,000 reads (100x reduction)

**Savings:** ~$0.0018/user/month

### 3. Batching

Batch multiple document changes before syncing:

- Reduce write operations by 30-50%
- Combine multiple edits within 5-10 seconds

**Savings:** ~$0.004/user/month

### 4. Tiered Storage

Move inactive notes to cheaper storage tiers:

- R2 Infrequent Access: $0.01/GB/month (33% savings on storage)
- Move notes not accessed in 90+ days

**Savings for power users:** ~$0.0008/user/month

### 5. Deduplication

Deduplicate common data across Automerge documents:

- Share common metadata schemas
- Deduplicate repeated content blocks

**Estimated savings:** 10-20% storage reduction

---

## Revenue Model Considerations

### Free Tier

Offer generous free tier to maximize adoption:

| Metric | Free Tier Limit |
|--------|----------------|
| Storage | 1 GB per user |
| Sync bandwidth | Unlimited (R2 has free egress) |
| Devices | Unlimited |
| Notes | Unlimited |

**Cost per free user:** ~$0.02-0.08/month

**Sustainability:** At $0.03/user/month, Flint can support 10,000 free users for $320/month

### Premium Features (Optional)

If monetization becomes necessary:

| Feature | Price | User Value |
|---------|-------|------------|
| Premium Tier | $5/month | - Increased storage (10GB)<br>- Priority sync<br>- Version history (90 days)<br>- Advanced sharing |
| Team Plan | $10/user/month | - Shared vaults<br>- Admin controls<br>- SSO integration |

**Premium margin:** $4.97 profit per user after infrastructure costs

---

## Bandwidth Considerations

### R2 Egress: Free

Unlike S3, R2 doesn't charge for egress bandwidth. This is a major advantage:

**Typical S3 costs (for comparison):**
- 10 MB download/user/month = $0.0009/user
- 100 MB download/power user/month = $0.009/user

**R2 advantage:** $0/user regardless of download volume

### Sync Efficiency

Target metrics for bandwidth efficiency:

| Metric | Target | Impact |
|--------|--------|--------|
| Incremental sync | 95% of syncs | Reduce unnecessary transfers |
| Compression ratio | 50-70% | Smaller payloads |
| Batching window | 5-10 seconds | Combine rapid edits |

---

## Infrastructure Scaling Triggers

### When to Upgrade Infrastructure

| User Count | Action | Cost Impact |
|------------|--------|-------------|
| 10,000 | Monitor Workers free tier limits | None |
| 50,000 | Add Workers paid tier | +$5-10/month |
| 100,000 | Add D1 paid tier | +$5/month |
| 500,000 | Consider R2 Enterprise pricing | Negotiate volume discount |
| 1,000,000 | Dedicated account manager | Custom pricing |

### Monitoring Thresholds

Set up alerts for:
- Daily Workers requests approaching 100K
- D1 reads approaching 5M/day
- R2 storage growth rate exceeding budget
- Per-user costs exceeding $0.05/month (investigate anomalies)

---

## Cost vs. Alternatives

### Self-Hosted S3

| Provider | Storage | Write Ops | Read Ops | Egress | Monthly (10K users) |
|----------|---------|-----------|----------|--------|---------------------|
| **R2** | $0.015/GB | $4.50/M | $0.36/M | Free | **$320** |
| AWS S3 | $0.023/GB | $5.00/M | $0.40/M | $0.09/GB | **$650** |
| Backblaze B2 | $0.005/GB | $0.40/M | Free | $0.01/GB | **$180** |

**R2 advantages over S3:**
- Free egress (major savings at scale)
- Cloudflare network integration
- DDoS protection included

**R2 advantages over B2:**
- Better integration with Cloudflare ecosystem
- More predictable pricing
- Enterprise support

### Hosted Solutions (Supabase, Firebase)

| Provider | Storage | Bandwidth | Monthly (10K users) |
|----------|---------|-----------|---------------------|
| Supabase | $0.021/GB | $0.09/GB egress | ~$450 |
| Firebase Storage | $0.026/GB | $0.12/GB egress | ~$680 |

**R2 advantage:** 30-50% cost savings at scale

---

## Long-Term Cost Projections

### 5-Year Growth Model

| Year | Users | Monthly Cost | Annual Cost | Cumulative |
|------|-------|--------------|-------------|------------|
| 1 | 10,000 | $320 | $3,840 | $3,840 |
| 2 | 50,000 | $1,610 | $19,320 | $23,160 |
| 3 | 150,000 | $4,830 | $57,960 | $81,120 |
| 4 | 400,000 | $12,880 | $154,560 | $235,680 |
| 5 | 1,000,000 | $32,150 | $385,800 | $621,480 |

**Assumptions:**
- Exponential user growth
- 80% typical / 20% power user split
- No premium revenue (conservative)

---

## Risk Mitigation: Cost Overruns

### Circuit Breakers

Implement automatic cost controls:

1. **Per-user quotas:**
   - Storage limit: 1GB (free) / 10GB (premium)
   - Operations limit: 10,000/day
   - Bandwidth limit: 1GB/day

2. **Rate limiting:**
   - 1 sync every 10 seconds per device
   - 100 operations/minute per user

3. **Monitoring:**
   - Alert if per-user cost exceeds $0.10/month
   - Alert if total monthly spend exceeds budget by 20%

### Abuse Prevention

Prevent malicious or buggy clients from inflating costs:

- Detect sync loops (same document syncing >100 times/hour)
- Throttle users exceeding quotas
- Automatic suspension for anomalous behavior

---

## Summary

### Key Takeaways

1. **Extremely Low Per-User Cost:** ~$0.03/user/month makes free tier sustainable
2. **Linear Scaling:** Costs scale predictably with user growth
3. **R2 Advantage:** Free egress saves 30-50% vs. competitors
4. **Optimization Potential:** Compression and incremental sync can reduce costs further
5. **Revenue Optional:** Infrastructure costs are low enough that monetization isn't immediately necessary

### Recommended Strategy

1. **Launch with free tier:** $0.03/user cost is negligible for first 10K-50K users
2. **Monitor and optimize:** Implement compression and incremental sync to reduce costs
3. **Introduce premium tier** when user base reaches 50K-100K users
4. **Negotiate enterprise pricing** with Cloudflare at 500K+ users

### Bottom Line

**Flint can provide free sync to tens of thousands of users for under $1,000/month.** The economics strongly favor a generous free tier to maximize adoption, with optional premium features for monetization if needed.

---

**← Previous:** [UI Design & User Experience](./06-UI-DESIGN.md) | **Next:** [Risks & Mitigations](./08-RISKS-MITIGATIONS.md) →
