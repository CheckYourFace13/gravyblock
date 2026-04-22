# Autopilot architecture notes

## Platform stance

GravyBlock is modeled as:

- **diagnosis layer** (scan/report/source attribution)
- **execution layer** (content, authority, AI visibility, task queues)
- **orchestration layer** (jobs/scheduling/integration adapters)

This supports single-location, multi-location, franchise, service-area, and online-first localization use cases.

## Data model scaffolding

Core account hierarchy:

- `organizations`
- `brands`
- `locations`
- `businesses`
- `website_domains`

Execution scaffolding:

- `growth_programs`
- `content_strategies`
- `content_queue`
- `publishing_targets`
- `publishing_jobs`
- `backlink_opportunities`
- `authority_campaigns`
- `ai_visibility_checks`
- `citation_monitors`
- `operator_tasks`
- `jobs`

## Autopilot run loop (target)

1. **Trigger** (new scan, scheduled run, or operator action)
2. **Analyze**
   - Place details
   - Crawl/technical findings
   - Local/AI visibility probes
   - Competitor snapshots
3. **Plan**
   - Update roadmap/recommendations
   - Generate 30-day strategy windows
4. **Queue**
   - Content candidates
   - Publishing jobs
   - Backlink opportunities
   - Operator tasks
5. **Execute**
   - Manual approval mode (current)
   - Assisted/autopublish adapters (future)
6. **Measure**
   - Visibility snapshots
   - AI visibility checks
   - Citation consistency
7. **Iterate**
   - Feed outcomes into next strategy window

## Publishing adapter contract (future)

Publisher targets should implement:

- `createDraft(contentItem)`
- `publish(contentItem)`
- `update(contentItem)`
- `status(externalId)`

Adapters should write status and provider logs to `publishing_jobs`.

## Backlink workflow contract (future)

Backlink ops should track:

- source quality score
- contextual relevance note
- outreach status lifecycle
- acquired link URL
- impact observations

Lifecycle recommendation:
`prospecting -> outreach_queued -> outreached -> negotiated -> acquired -> verified`

## AI visibility workflow contract (future)

AI checks should track:

- prompt set
- engine/source used
- mention/citation presence
- confidence and sentiment
- trend deltas over time

## Worker/scheduler assumptions

- Scheduled runs should enqueue to `jobs`.
- Workers should be idempotent and safe to retry.
- Failure alerts route to `AUTOMATION_ALERT_EMAIL`.
- Concurrency controls should be per business/location to avoid duplicate publish actions.
