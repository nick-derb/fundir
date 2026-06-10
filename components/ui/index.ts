/**
 * Barrel export for the Fundir design-system primitives.
 * Import sites use: `import { GrantCard, ScoreBadge } from '@/components/ui';`
 *
 * Phase 1E migrates existing screens onto these. After that, anything
 * outside this barrel that draws cards / badges / pills should be
 * considered tech debt.
 */

export { Card }                      from './card';
export { Button }                    from './button';
export { ScoreBadge }                from './score-badge';
export type { ScoreVariant, ScoreSize, ScoreBadgeProps } from './score-badge';
export { RecommendationPill }        from './recommendation-pill';
export type { Recommendation }       from './recommendation-pill';
export { EvidenceList }              from './evidence-list';
export type { EvidenceItem, FactorKey } from './evidence-list';
export { GrantCard }                 from './grant-card';
export { FilterBar }                 from './filter-bar';
export type { FilterChip }           from './filter-bar';
export { EmptyState }                from './empty-state';
export { RecommendationGroup }       from './recommendation-group';
