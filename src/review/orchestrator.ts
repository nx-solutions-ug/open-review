import {
  Config,
  PullRequestFile,
  ReviewComment,
  ReviewIssue,
  ReviewSummary,
} from "../types";
import { GitHubClient } from "../github/client";
import { LLMClient } from "../llm/client";
import { logger } from "../utils/logger";

export class ReviewOrchestrator {
  private config: Config;
  private github: GitHubClient;
  private llm: LLMClient;

  constructor(config: Config, github: GitHubClient, llm: LLMClient) {
    this.config = config;
    this.github = github;
    this.llm = llm;
  }

  /**
   * Run the complete review process
   */
  async runReview(): Promise<ReviewSummary> {
    const startTime = Date.now();

    logger.info("Starting AI code review...");

    // Get PR details
    const prDetails = await this.github.getPRDetails();
    logger.info(`Reviewing PR: ${prDetails.title}`);

    // Get changed files
    const files = await this.github.getChangedFiles(
      this.config.excludePatterns,
    );

    if (files.length === 0) {
      logger.info("No files to review");
      return {
        totalFiles: 0,
        filesReviewed: 0,
        totalComments: 0,
        criticalIssues: 0,
        warnings: 0,
        suggestions: 0,
        summary: "No files to review",
      };
    }

    // Limit files if configured
    const filesToReview =
      this.config.maxFiles > 0 ? files.slice(0, this.config.maxFiles) : files;

    if (filesToReview.length < files.length) {
      logger.warning(
        `Limited to ${filesToReview.length} files (skipped ${files.length - filesToReview.length})`,
      );
    }

    // Review each file
    const allComments: ReviewComment[] = [];
    const fileResults: Array<{
      filePath: string;
      summary: string;
      issueCount: number;
      criticalCount: number;
      warningCount: number;
      suggestionCount: number;
    }> = [];

    for (const file of filesToReview) {
      // Skip removed files
      if (file.status === "removed" || !file.patch) {
        logger.info(`Skipping ${file.filename} (removed or no patch)`);
        continue;
      }

      try {
        const result = await this.reviewFile(
          file,
          prDetails.title,
          prDetails.body || undefined,
        );

        allComments.push(...result.comments);
        fileResults.push({
          filePath: file.filename,
          summary: result.summary,
          issueCount: result.comments.length,
          criticalCount: result.criticalCount,
          warningCount: result.warningCount,
          suggestionCount: result.suggestionCount,
        });
      } catch (error) {
        logger.error(`Failed to review ${file.filename}: ${error}`);
        // Continue with other files
      }
    }

    // Generate overall summary
    const overallSummary = await this.llm.generateSummary(
      fileResults.map((r) => ({
        filePath: r.filePath,
        summary: r.summary,
        issueCount: r.issueCount,
      })),
      this.config.prompt,
    );

    // Calculate statistics
    const totalComments = allComments.length;
    const criticalIssues = fileResults.reduce(
      (sum, r) => sum + r.criticalCount,
      0,
    );
    const warnings = fileResults.reduce((sum, r) => sum + r.warningCount, 0);
    const suggestions = fileResults.reduce(
      (sum, r) => sum + r.suggestionCount,
      0,
    );

    // Post review
    if (totalComments > 0) {
      const reviewBody = this.formatReviewBody(
        overallSummary,
        fileResults,
        criticalIssues,
        warnings,
        suggestions,
      );

      if (this.config.postAsReview) {
        await this.github.createReview(allComments, reviewBody, "COMMENT");
      } else {
        await this.github.postReviewComments(allComments);
        await this.github.postGeneralComment(reviewBody);
      }
    } else {
      // Post approval if no issues
      const approvalBody = `## ✅ AI Code Review Complete

${overallSummary}

**No issues found!** Great job! 🎉`;

      if (this.config.postAsReview) {
        await this.github.createReview([], approvalBody, "APPROVE");
      } else {
        await this.github.postGeneralComment(approvalBody);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Review completed in ${duration}s`);
    logger.info(`  Files reviewed: ${fileResults.length}`);
    logger.info(`  Total comments: ${totalComments}`);
    logger.info(
      `  Critical: ${criticalIssues}, Warnings: ${warnings}, Suggestions: ${suggestions}`,
    );

    return {
      totalFiles: files.length,
      filesReviewed: fileResults.length,
      totalComments,
      criticalIssues,
      warnings,
      suggestions,
      summary: overallSummary,
    };
  }

  /**
   * Review a single file
   */
  private async reviewFile(
    file: PullRequestFile,
    prTitle?: string,
    prDescription?: string,
  ): Promise<{
    comments: ReviewComment[];
    summary: string;
    criticalCount: number;
    warningCount: number;
    suggestionCount: number;
  }> {
    return logger.group(`Reviewing ${file.filename}`, async () => {
      const result = await this.llm.reviewCode(
        file.filename,
        file.patch || "",
        this.config.prompt,
        prTitle,
        prDescription,
      );

      // Convert review issues to GitHub comments
      const comments = this.createReviewComments(
        file.filename,
        result.reviews,
        file.patch || "",
      );

      // Count by severity
      const criticalCount = result.reviews.filter(
        (r) => r.severity === "critical",
      ).length;
      const warningCount = result.reviews.filter(
        (r) => r.severity === "warning",
      ).length;
      const suggestionCount = result.reviews.filter(
        (r) => r.severity === "suggestion" || r.severity === "info",
      ).length;

      logger.info(`  Found ${comments.length} comment(s)`);

      return {
        comments,
        summary: result.summary,
        criticalCount,
        warningCount,
        suggestionCount,
      };
    });
  }

  /**
   * Create GitHub review comments from review issues
   */
  private createReviewComments(
    filePath: string,
    issues: ReviewIssue[],
    patch: string,
  ): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const patchLines = patch.split("\n");

    for (const issue of issues) {
      // Map the issue line to the actual diff line
      const lineNumber = this.mapLineToDiff(issue.line, patchLines);

      if (!lineNumber) {
        logger.debug(
          `Could not map line ${issue.line} to diff for ${filePath}`,
        );
        continue;
      }

      const severityEmoji = this.getSeverityEmoji(issue.severity);
      const categoryLabel = issue.category
        ? `**${issue.category.toUpperCase()}**`
        : "";

      // Note: We don't render suggestions because LLMs are unreliable at generating
      // correct line-specific suggestions. They often identify wrong lines or suggest
      // changes that don't match the target line, which can break the code.
      const body = [
        `${severityEmoji} ${categoryLabel}`,
        "",
        issue.message,
      ]
        .filter(Boolean)
        .join("\n");

      comments.push({
        path: filePath,
        line: lineNumber,
        body,
        side: "RIGHT",
      });
    }

    return comments;
  }

  /**
   * Map a source file line number to the diff line number
   */
  private mapLineToDiff(
    targetLine: number,
    patchLines: string[],
  ): number | null {
    let currentLine = 0;
    let inHunk = false;

    for (let i = 0; i < patchLines.length; i++) {
      const line = patchLines[i];

      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        inHunk = true;
        currentLine = parseInt(hunkMatch[1], 10) - 1;
        continue;
      }

      if (!inHunk) continue;

      if (line.startsWith("+")) {
        currentLine++;
        if (currentLine === targetLine) {
          // Return the line number in the patch (1-indexed for GitHub API)
          return i + 1;
        }
      } else if (!line.startsWith("-")) {
        currentLine++;
      }
    }

    return null;
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case "critical":
        return "🔴";
      case "warning":
        return "🟡";
      case "suggestion":
        return "💡";
      case "info":
        return "ℹ️";
      default:
        return "📝";
    }
  }

  /**
   * Format the review body with summary and statistics
   */
  private formatReviewBody(
    summary: string,
    fileResults: Array<{
      filePath: string;
      summary: string;
      issueCount: number;
    }>,
    criticalIssues: number,
    warnings: number,
    suggestions: number,
  ): string {
    const stats = [
      criticalIssues > 0 ? `🔴 ${criticalIssues} critical` : "",
      warnings > 0 ? `🟡 ${warnings} warnings` : "",
      suggestions > 0 ? `💡 ${suggestions} suggestions` : "",
    ].filter(Boolean);

    return `## Open Review

${summary}

### Summary
${stats.length > 0 ? stats.join(" | ") : "✅ No issues found"}

### Files Reviewed
${fileResults.map((r) => `- ${r.filePath}${r.issueCount > 0 ? ` (${r.issueCount} comment${r.issueCount > 1 ? "s" : ""})` : ""}`).join("\n")}

---
*This review was generated by AI. Please review the suggestions carefully before applying them.*`;
  }
}
