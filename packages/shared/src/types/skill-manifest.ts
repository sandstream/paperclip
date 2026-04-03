/**
 * Enhanced Skill Manifest Schema v2
 * 
 * Extends the base skill manifest with auto-injection capabilities.
 * Skills can now declare triggers, gate affinity, capabilities, and relevance scoring metadata.
 */

/**
 * Trigger conditions for skill auto-injection
 */
export interface SkillTrigger {
  /** Match if task has any of these labels */
  task_labels?: string[];
  
  /** Match if agent is working in this gate number */
  gate_active?: number;
  
  /** Match if task description/title contains any of these keywords */
  domain_keywords?: string[];
  
  /** Match if task is associated with specific project IDs */
  project_ids?: string[];
  
  /** Match if agent has specific role */
  agent_roles?: string[];
}

/**
 * Enhanced skill manifest frontmatter (YAML)
 */
export interface SkillManifestV2 {
  /** Skill name (existing) */
  name: string;
  
  /** Human-readable description (existing) */
  description?: string;
  
  /** URL-safe slug (existing) */
  slug?: string;
  
  /** Gate affinity - which gates this skill is most relevant for */
  gates?: number[];
  
  /** Capability tags for matching (e.g., "filesystem", "git", "api", "database") */
  capabilities?: string[];
  
  /** Trigger conditions for auto-injection */
  triggers?: SkillTrigger;
  
  /** Relevance weight multiplier (0.0 to 1.0, default 0.5) */
  relevance_weight?: number;
  
  /** Maximum context tokens this skill should consume (for budget management) */
  max_context_tokens?: number;
  
  /** Existing metadata field */
  metadata?: Record<string, unknown>;
}

/**
 * Task context for relevance scoring
 */
export interface TaskContext {
  /** Current gate number (0-4) */
  gateNumber?: number;
  
  /** Domain/project area */
  domain?: string;
  
  /** Task labels/tags */
  labels?: string[];
  
  /** Issue title */
  title?: string;
  
  /** Issue description */
  description?: string;
  
  /** Project ID */
  projectId?: string;
  
  /** Agent role */
  agentRole?: string;
}

/**
 * Skill with relevance score
 */
export interface ScoredSkill {
  /** Skill ID */
  id: string;
  
  /** Skill key */
  key: string;
  
  /** Skill slug */
  slug: string;
  
  /** Skill name */
  name: string;
  
  /** Parsed manifest */
  manifest: SkillManifestV2;
  
  /** Relevance score (0.0 to 1.0) */
  score: number;
  
  /** Estimated token count */
  estimatedTokens: number;
  
  /** Reason for score (for debugging) */
  scoreReason?: string;
}

/**
 * Skill injection result
 */
export interface SkillInjectionResult {
  /** Selected skills in priority order */
  selectedSkills: ScoredSkill[];
  
  /** Total tokens used */
  totalTokens: number;
  
  /** Skills that were excluded due to low relevance */
  excludedSkills: Array<{
    id: string;
    key: string;
    name: string;
    score: number;
    reason: string;
  }>;
  
  /** Skills that were excluded due to token budget */
  budgetExcludedSkills: Array<{
    id: string;
    key: string;
    name: string;
    score: number;
    estimatedTokens: number;
  }>;
}
