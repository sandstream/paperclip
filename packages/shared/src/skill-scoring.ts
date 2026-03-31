/**
 * Skill Relevance Scoring Algorithm
 * 
 * Scores skills based on task context, gate affinity, and trigger conditions.
 */

import type {
  SkillManifestV2,
  SkillTrigger,
  TaskContext,
  ScoredSkill,
  SkillInjectionResult,
} from "./types/skill-manifest.js";

/**
 * Configuration for skill scoring
 */
export interface SkillScoringConfig {
  /** Minimum score threshold (0.0 to 1.0) - skills below this are excluded */
  minScoreThreshold?: number;
  
  /** Maximum total tokens for all skills */
  maxTotalTokens?: number;
  
  /** Gate affinity weight (0.0 to 1.0) */
  gateAffinityWeight?: number;
  
  /** Keyword match weight (0.0 to 1.0) */
  keywordMatchWeight?: number;
  
  /** Label match weight (0.0 to 1.0) */
  labelMatchWeight?: number;
  
  /** Project match weight (0.0 to 1.0) */
  projectMatchWeight?: number;
  
  /** Agent role match weight (0.0 to 1.0) */
  agentRoleMatchWeight?: number;
}

const DEFAULT_CONFIG: Required<SkillScoringConfig> = {
  minScoreThreshold: 0.1,
  maxTotalTokens: 8000,
  gateAffinityWeight: 0.3,
  keywordMatchWeight: 0.25,
  labelMatchWeight: 0.25,
  projectMatchWeight: 0.1,
  agentRoleMatchWeight: 0.1,
};

/**
 * Estimate token count for skill content
 */
export function estimateSkillTokens(manifest: SkillManifestV2, markdownContent: string | undefined | null): number {
  // Use explicit token count if provided
  if (manifest.max_context_tokens && manifest.max_context_tokens > 0) {
    return manifest.max_context_tokens;
  }
  
  // Rough estimate: ~4 characters per token
  const contentLength = (markdownContent ?? "").length;
  return Math.ceil(contentLength / 4);
}

/**
 * Normalize text for matching (lowercase, trim, handle undefined)
 */
function normalizeText(text: string | undefined | null): string {
  return (text ?? "").toLowerCase().trim();
}

/**
 * Check if text contains any of the keywords
 */
function containsAnyKeyword(text: string, keywords: string[]): boolean {
  const normalizedText = normalizeText(text);
  return keywords.some((keyword) => normalizedText.includes(normalizeText(keyword)));
}

/**
 * Check if any of the items match
 */
function hasAnyMatch(items: string[] | undefined, targets: string[] | undefined): boolean {
  if (!items || !targets) return false;
  const normalizedItems = items.map(normalizeText);
  const normalizedTargets = targets.map(normalizeText);
  return normalizedItems.some((item) => normalizedTargets.includes(item));
}

/**
 * Calculate gate affinity score
 */
function calculateGateAffinityScore(
  skillGates: number[] | undefined,
  contextGate: number | undefined,
): number {
  if (!skillGates || skillGates.length === 0 || contextGate === undefined) {
    return 0.5; // Neutral score if no gate info
  }
  
  // Exact match
  if (skillGates.includes(contextGate)) {
    return 1.0;
  }
  
  // Adjacent gates get partial score
  const minDistance = Math.min(
    ...skillGates.map((gate) => Math.abs(gate - contextGate))
  );
  
  if (minDistance === 1) return 0.7;
  if (minDistance === 2) return 0.4;
  return 0.1; // Far from relevant gates
}

/**
 * Calculate keyword match score
 */
function calculateKeywordScore(
  triggers: SkillTrigger | undefined,
  context: TaskContext,
): number {
  if (!triggers?.domain_keywords || triggers.domain_keywords.length === 0) {
    return 0.5; // Neutral if no keywords specified
  }
  
  const searchableText = [
    context.title,
    context.description,
    context.domain,
  ].filter(Boolean).join(" ");
  
  if (!searchableText) {
    return 0.5; // No context to match against
  }
  
  const matchCount = triggers.domain_keywords.filter((keyword) =>
    containsAnyKeyword(searchableText, [keyword])
  ).length;
  
  if (matchCount === 0) return 0.0;
  
  // Scale by percentage of keywords matched
  const matchRatio = matchCount / triggers.domain_keywords.length;
  return Math.min(1.0, 0.3 + (matchRatio * 0.7)); // 0.3 to 1.0 range
}

/**
 * Calculate label match score
 */
function calculateLabelScore(
  triggers: SkillTrigger | undefined,
  context: TaskContext,
): number {
  if (!triggers?.task_labels || triggers.task_labels.length === 0) {
    return 0.5; // Neutral if no labels specified
  }
  
  if (!context.labels || context.labels.length === 0) {
    return 0.5; // No labels to match
  }
  
  return hasAnyMatch(triggers.task_labels, context.labels) ? 1.0 : 0.0;
}

/**
 * Calculate project match score
 */
function calculateProjectScore(
  triggers: SkillTrigger | undefined,
  context: TaskContext,
): number {
  if (!triggers?.project_ids || triggers.project_ids.length === 0) {
    return 0.5; // Neutral if no projects specified
  }
  
  if (!context.projectId) {
    return 0.5; // No project to match
  }
  
  return triggers.project_ids.includes(context.projectId) ? 1.0 : 0.0;
}

/**
 * Calculate agent role match score
 */
function calculateAgentRoleScore(
  triggers: SkillTrigger | undefined,
  context: TaskContext,
): number {
  if (!triggers?.agent_roles || triggers.agent_roles.length === 0) {
    return 0.5; // Neutral if no roles specified
  }
  
  if (!context.agentRole) {
    return 0.5; // No role to match
  }
  
  return hasAnyMatch(triggers.agent_roles, [context.agentRole]) ? 1.0 : 0.0;
}

/**
 * Score a single skill's relevance to the task context
 */
export function scoreSkillRelevance(
  manifest: SkillManifestV2,
  context: TaskContext,
  config: SkillScoringConfig = {},
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Calculate individual component scores
  const gateScore = calculateGateAffinityScore(manifest.gates, context.gateNumber);
  const keywordScore = calculateKeywordScore(manifest.triggers, context);
  const labelScore = calculateLabelScore(manifest.triggers, context);
  const projectScore = calculateProjectScore(manifest.triggers, context);
  const roleScore = calculateAgentRoleScore(manifest.triggers, context);
  
  // Weighted average
  const weightedScore =
    (gateScore * cfg.gateAffinityWeight) +
    (keywordScore * cfg.keywordMatchWeight) +
    (labelScore * cfg.labelMatchWeight) +
    (projectScore * cfg.projectMatchWeight) +
    (roleScore * cfg.agentRoleMatchWeight);
  
  // Apply skill-specific relevance weight
  const skillWeight = manifest.relevance_weight ?? 0.5;
  const finalScore = weightedScore * skillWeight;
  
  return Math.max(0.0, Math.min(1.0, finalScore));
}

/**
 * Generate human-readable reason for the score
 */
function generateScoreReason(
  manifest: SkillManifestV2,
  context: TaskContext,
  score: number,
): string {
  const reasons: string[] = [];
  
  if (manifest.gates && context.gateNumber !== undefined) {
    if (manifest.gates.includes(context.gateNumber)) {
      reasons.push(`gate ${context.gateNumber} match`);
    } else {
      reasons.push(`gate ${context.gateNumber} mismatch`);
    }
  }
  
  if (manifest.triggers?.domain_keywords) {
    const searchableText = [context.title, context.description, context.domain]
      .filter(Boolean)
      .join(" ");
    const matchedKeywords = manifest.triggers.domain_keywords.filter((kw) =>
      containsAnyKeyword(searchableText, [kw])
    );
    if (matchedKeywords.length > 0) {
      reasons.push(`keywords: ${matchedKeywords.join(", ")}`);
    }
  }
  
  if (manifest.triggers?.task_labels && context.labels) {
    const matchedLabels = manifest.triggers.task_labels.filter((label) =>
      hasAnyMatch([label], context.labels)
    );
    if (matchedLabels.length > 0) {
      reasons.push(`labels: ${matchedLabels.join(", ")}`);
    }
  }
  
  if (reasons.length === 0) {
    reasons.push("default relevance");
  }
  
  return reasons.join("; ");
}

/**
 * Input skill for scoring
 */
export interface SkillForScoring {
  id: string;
  key: string;
  slug: string;
  name: string;
  manifest: SkillManifestV2;
  markdownContent: string;
}

/**
 * Select and rank skills based on relevance scoring
 */
export function selectRelevantSkills(
  skills: SkillForScoring[],
  context: TaskContext,
  config: SkillScoringConfig = {},
): SkillInjectionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Score all skills
  const scoredSkills: ScoredSkill[] = skills.map((skill) => {
    const score = scoreSkillRelevance(skill.manifest, context, config);
    const estimatedTokens = estimateSkillTokens(skill.manifest, skill.markdownContent);
    const scoreReason = generateScoreReason(skill.manifest, context, score);
    
    return {
      id: skill.id,
      key: skill.key,
      slug: skill.slug,
      name: skill.name,
      manifest: skill.manifest,
      score,
      estimatedTokens,
      scoreReason,
    };
  });
  
  // Sort by score descending
  scoredSkills.sort((a, b) => b.score - a.score);
  
  // Filter by minimum threshold
  const aboveThreshold = scoredSkills.filter((s) => s.score >= cfg.minScoreThreshold);
  const belowThreshold = scoredSkills.filter((s) => s.score < cfg.minScoreThreshold);
  
  // Select skills within token budget
  const selectedSkills: ScoredSkill[] = [];
  const budgetExcluded: ScoredSkill[] = [];
  let totalTokens = 0;
  
  for (const skill of aboveThreshold) {
    if (totalTokens + skill.estimatedTokens <= cfg.maxTotalTokens) {
      selectedSkills.push(skill);
      totalTokens += skill.estimatedTokens;
    } else {
      budgetExcluded.push(skill);
    }
  }
  
  return {
    selectedSkills,
    totalTokens,
    excludedSkills: belowThreshold.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      score: s.score,
      reason: `Score ${s.score.toFixed(2)} below threshold ${cfg.minScoreThreshold}`,
    })),
    budgetExcludedSkills: budgetExcluded.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      score: s.score,
      estimatedTokens: s.estimatedTokens,
    })),
  };
}

/**
 * Parse skill manifest from YAML frontmatter
 */
export function parseSkillManifest(frontmatter: Record<string, unknown>): SkillManifestV2 {
  return {
    name: String(frontmatter.name ?? "Unnamed Skill"),
    description: frontmatter.description ? String(frontmatter.description) : undefined,
    slug: frontmatter.slug ? String(frontmatter.slug) : undefined,
    gates: Array.isArray(frontmatter.gates)
      ? frontmatter.gates.filter((g): g is number => typeof g === "number")
      : undefined,
    capabilities: Array.isArray(frontmatter.capabilities)
      ? frontmatter.capabilities.map(String)
      : undefined,
    triggers: parseTriggers(frontmatter.triggers),
    relevance_weight: typeof frontmatter.relevance_weight === "number"
      ? frontmatter.relevance_weight
      : undefined,
    max_context_tokens: typeof frontmatter.max_context_tokens === "number"
      ? frontmatter.max_context_tokens
      : undefined,
    metadata: typeof frontmatter.metadata === "object" && frontmatter.metadata !== null
      ? frontmatter.metadata as Record<string, unknown>
      : undefined,
  };
}

function parseTriggers(value: unknown): SkillTrigger | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  
  const obj = value as Record<string, unknown>;
  
  return {
    task_labels: Array.isArray(obj.task_labels) ? obj.task_labels.map(String) : undefined,
    gate_active: typeof obj.gate_active === "number" ? obj.gate_active : undefined,
    domain_keywords: Array.isArray(obj.domain_keywords)
      ? obj.domain_keywords.map(String)
      : undefined,
    project_ids: Array.isArray(obj.project_ids) ? obj.project_ids.map(String) : undefined,
    agent_roles: Array.isArray(obj.agent_roles) ? obj.agent_roles.map(String) : undefined,
  };
}

/**
 * Alias for selectRelevantSkills (for backward compatibility)
 */
export const selectSkillsForInjection = selectRelevantSkills;
