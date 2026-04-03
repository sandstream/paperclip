/**
 * Tests for skill relevance scoring
 */

import { describe, it, expect } from "vitest";
import {
  parseSkillManifest,
  scoreSkillRelevance,
  estimateSkillTokens,
  selectSkillsForInjection,
} from "./skill-scoring.js";
import type { SkillManifestV2, TaskContext } from "./types/skill-manifest.js";

describe("parseSkillManifest", () => {
  it("parses basic manifest", () => {
    const frontmatter = {
      name: "test-skill",
      description: "A test skill",
      slug: "test",
    };

    const manifest = parseSkillManifest(frontmatter);

    expect(manifest.name).toBe("test-skill");
    expect(manifest.description).toBe("A test skill");
    expect(manifest.slug).toBe("test");
  });

  it("parses gates and capabilities", () => {
    const frontmatter = {
      name: "test-skill",
      gates: [1, 2],
      capabilities: ["filesystem", "git"],
    };

    const manifest = parseSkillManifest(frontmatter);

    expect(manifest.gates).toEqual([1, 2]);
    expect(manifest.capabilities).toEqual(["filesystem", "git"]);
  });

  it("parses triggers", () => {
    const frontmatter = {
      name: "test-skill",
      triggers: {
        task_labels: ["bug", "frontend"],
        gate_active: 1,
        domain_keywords: ["react", "component"],
      },
    };

    const manifest = parseSkillManifest(frontmatter);

    expect(manifest.triggers?.task_labels).toEqual(["bug", "frontend"]);
    expect(manifest.triggers?.gate_active).toBe(1);
    expect(manifest.triggers?.domain_keywords).toEqual(["react", "component"]);
  });

  it("handles missing optional fields", () => {
    const frontmatter = {
      name: "minimal-skill",
    };

    const manifest = parseSkillManifest(frontmatter);

    expect(manifest.name).toBe("minimal-skill");
    expect(manifest.gates).toBeUndefined();
    expect(manifest.capabilities).toBeUndefined();
    expect(manifest.triggers).toBeUndefined();
  });
});

describe("scoreSkillRelevance", () => {
  it("returns base weight for skills without triggers", () => {
    const manifest: SkillManifestV2 = {
      name: "generic-skill",
      relevance_weight: 0.5,
    };

    const context: TaskContext = {
      gateNumber: 1,
      projectId: "proj-1",
    };

    const result = scoreSkillRelevance(manifest, context);

    expect(result.score).toBe(0.5);
    expect(result.reason).toContain("No triggers");
  });

  it("scores gate affinity correctly", () => {
    const manifest: SkillManifestV2 = {
      name: "gate-1-skill",
      gates: [1],
      relevance_weight: 1.0,
    };

    const context: TaskContext = {
      gateNumber: 1,
    };

    const result = scoreSkillRelevance(manifest, context);

    expect(result.score).toBeGreaterThan(0.3);
    expect(result.reason).toContain("gate 1 match");
  });

  it("scores adjacent gates lower than exact matches", () => {
    const manifest: SkillManifestV2 = {
      name: "gate-1-skill",
      gates: [1],
      relevance_weight: 1.0,
    };

    const exactMatch = scoreSkillRelevance(manifest, { gateNumber: 1 });
    const adjacentMatch = scoreSkillRelevance(manifest, { gateNumber: 2 });
    const noMatch = scoreSkillRelevance(manifest, { gateNumber: 4 });

    expect(exactMatch.score).toBeGreaterThan(adjacentMatch.score);
    expect(adjacentMatch.score).toBeGreaterThan(noMatch.score);
  });

  it("scores task label matches", () => {
    const manifest: SkillManifestV2 = {
      name: "bug-fix-skill",
      triggers: {
        task_labels: ["bug", "critical"],
      },
      relevance_weight: 1.0,
    };

    const context: TaskContext = {
      labels: ["bug", "frontend"],
    };

    const result = scoreSkillRelevance(manifest, context);

    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toContain("label match");
  });

  it("scores domain keyword matches", () => {
    const manifest: SkillManifestV2 = {
      name: "react-skill",
      triggers: {
        domain_keywords: ["react", "component", "jsx"],
      },
      relevance_weight: 1.0,
    };

    const context: TaskContext = {
      title: "Fix React component rendering",
      description: "The component is not displaying correctly",
    };

    const result = scoreSkillRelevance(manifest, context);

    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toContain("keyword match");
  });

  it("combines multiple scoring factors", () => {
    const manifest: SkillManifestV2 = {
      name: "comprehensive-skill",
      gates: [1],
      triggers: {
        task_labels: ["bug"],
        domain_keywords: ["react"],
        gate_active: 1,
      },
      relevance_weight: 1.0,
    };

    const context: TaskContext = {
      gateNumber: 1,
      labels: ["bug", "frontend"],
      title: "Fix React bug",
    };

    const result = scoreSkillRelevance(manifest, context);

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.reason).toContain("gate");
    expect(result.reason).toContain("label");
    expect(result.reason).toContain("keyword");
  });

  it("applies relevance_weight multiplier", () => {
    const highWeight: SkillManifestV2 = {
      name: "high-weight",
      gates: [1],
      relevance_weight: 1.0,
    };

    const lowWeight: SkillManifestV2 = {
      name: "low-weight",
      gates: [1],
      relevance_weight: 0.2,
    };

    const context: TaskContext = { gateNumber: 1 };

    const highResult = scoreSkillRelevance(highWeight, context);
    const lowResult = scoreSkillRelevance(lowWeight, context);

    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });
});

describe("estimateSkillTokens", () => {
  it("estimates tokens from markdown length", () => {
    const markdown = "a".repeat(400); // ~100 tokens
    const tokens = estimateSkillTokens(markdown);

    expect(tokens).toBe(100);
  });

  it("respects max_context_tokens limit", () => {
    const markdown = "a".repeat(10000); // ~2500 tokens
    const tokens = estimateSkillTokens(markdown, 500);

    expect(tokens).toBe(500);
  });
});

describe("selectSkillsForInjection", () => {
  it("selects skills by relevance score", () => {
    const skills = [
      {
        id: "1",
        key: "skill-1",
        slug: "skill-1",
        name: "High Relevance",
        markdown: "a".repeat(400),
        manifest: {
          name: "High Relevance",
          gates: [1],
          relevance_weight: 1.0,
        },
      },
      {
        id: "2",
        key: "skill-2",
        slug: "skill-2",
        name: "Low Relevance",
        markdown: "a".repeat(400),
        manifest: {
          name: "Low Relevance",
          gates: [3],
          relevance_weight: 1.0,
        },
      },
    ];

    const context: TaskContext = {
      gateNumber: 1,
    };

    const result = selectSkillsForInjection(skills, context);

    expect(result.selectedSkills.length).toBeGreaterThan(0);
    expect(result.selectedSkills[0]?.score).toBeGreaterThan(0);
  });

  it("excludes skills below minimum relevance", () => {
    const skills = [
      {
        id: "1",
        key: "skill-1",
        slug: "skill-1",
        name: "Irrelevant",
        markdown: "a".repeat(400),
        manifest: {
          name: "Irrelevant",
          relevance_weight: 0.01,
        },
      },
    ];

    const context: TaskContext = {
      gateNumber: 1,
    };

    const result = selectSkillsForInjection(skills, context, {
      minRelevanceScore: 0.1,
    });

    expect(result.excludedSkills.length).toBe(1);
    expect(result.selectedSkills.length).toBe(0);
  });

  it("respects token budget", () => {
    const skills = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      key: `skill-${i}`,
      slug: `skill-${i}`,
      name: `Skill ${i}`,
      markdown: "a".repeat(8000), // 2000 tokens each
      manifest: {
        name: `Skill ${i}`,
        gates: [1],
        relevance_weight: 1.0,
      },
    }));

    const context: TaskContext = {
      gateNumber: 1,
    };

    const result = selectSkillsForInjection(skills, context, {
      maxTotalTokens: 5000, // Only room for ~2 skills
    });

    expect(result.totalTokens).toBeLessThanOrEqual(5000);
    expect(result.budgetExcludedSkills.length).toBeGreaterThan(0);
  });

  it("returns skills in score order", () => {
    const skills = [
      {
        id: "1",
        key: "skill-1",
        slug: "skill-1",
        name: "Medium",
        markdown: "a".repeat(400),
        manifest: {
          name: "Medium",
          gates: [2],
          relevance_weight: 1.0,
        },
      },
      {
        id: "2",
        key: "skill-2",
        slug: "skill-2",
        name: "High",
        markdown: "a".repeat(400),
        manifest: {
          name: "High",
          gates: [1],
          relevance_weight: 1.0,
        },
      },
      {
        id: "3",
        key: "skill-3",
        slug: "skill-3",
        name: "Low",
        markdown: "a".repeat(400),
        manifest: {
          name: "Low",
          gates: [4],
          relevance_weight: 1.0,
        },
      },
    ];

    const context: TaskContext = {
      gateNumber: 1,
    };

    const result = selectSkillsForInjection(skills, context);

    // Highest score should be first
    if (result.selectedSkills.length > 1) {
      expect(result.selectedSkills[0]!.score).toBeGreaterThanOrEqual(
        result.selectedSkills[1]!.score,
      );
    }
  });
});
