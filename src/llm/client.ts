import OpenAI from 'openai';
import { ReviewResult, ReviewIssue } from '../types';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

export class LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseURL: string, model: string) {
    // Normalize base URL
    const normalizedBaseURL = baseURL.endsWith('/v1')
      ? baseURL
      : `${baseURL.replace(/\/$/, '')}/v1`;

    this.client = new OpenAI({
      apiKey,
      baseURL: normalizedBaseURL,
      timeout: 120 * 1000, // 2 minutes
      maxRetries: 3,
    });

    this.model = model;
    
    logger.info(`LLM Client initialized with model: ${model}`);
    logger.info(`Base URL: ${normalizedBaseURL}`);
  }

  /**
   * Review code using the LLM
   */
  async reviewCode(
    filePath: string,
    diff: string,
    systemPrompt: string,
    prTitle?: string,
    prDescription?: string
  ): Promise<ReviewResult> {
    const userPrompt = this.buildReviewPrompt(filePath, diff, prTitle, prDescription);

    logger.debug(`Reviewing ${filePath}...`);
    logger.debug(`Prompt length: ${systemPrompt.length + userPrompt.length} chars`);

    try {
      const response = await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
            max_tokens: 4000,
          }),
        {
          maxAttempts: 3,
          retryableErrors: ['429', '503', '502', '504', 'ETIMEDOUT', 'ECONNRESET'],
        }
      );

      const content = response.choices[0]?.message?.content;
      
      // Log raw response for debugging
      logger.debug(`Raw LLM response for ${filePath}:`);
      logger.debug(content || '(empty response)');
      
      if (!content) {
        logger.warning(`Empty response from LLM for ${filePath}`);
        return { reviews: [], summary: 'No review generated' };
      }

      // Log token usage
      if (response.usage) {
        logger.debug(
          `Token usage - Prompt: ${response.usage.prompt_tokens}, ` +
          `Completion: ${response.usage.completion_tokens}, ` +
          `Total: ${response.usage.total_tokens}`
        );
      }

      return this.parseReviewResponse(content, filePath);
    } catch (error) {
      this.handleError(error, filePath);
      throw error;
    }
  }

  /**
   * Build the review prompt for a specific file
   */
  private buildReviewPrompt(
    filePath: string,
    diff: string,
    prTitle?: string,
    prDescription?: string
  ): string {
    // Add line numbers to the diff for clarity
    const numberedDiff = diff.split('\n').map((line, index) => {
      const lineNum = index + 1;
      return `${lineNum.toString().padStart(4, ' ')}: ${line}`;
    }).join('\n');

    const context = [
      `File: ${filePath}`,
      prTitle ? `PR Title: ${prTitle}` : '',
      prDescription ? `PR Description: ${prDescription}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return `${context}

Code Changes (diff with line numbers):
${numberedDiff}

IMPORTANT: The line numbers shown above are for reference only. When providing feedback:
- The "line" field should be the actual line number in the new file (counting added lines only)
- If you suggest a fix, the suggestion MUST replace the exact line you're commenting on
- Example: If commenting on line 18 (timeout-minutes: 10), the suggestion should be a replacement for that specific line

Please review the code changes above and provide feedback in the specified JSON format.`;
  }

  /**
   * Parse the LLM response into a structured review result
   */
  private parseReviewResponse(response: string, filePath: string): ReviewResult {
    try {
      // Clean up response (sometimes LLM adds markdown code blocks)
      const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
        logger.warning(`Invalid response structure for ${filePath}: missing reviews array`);
        return { reviews: [], summary: parsed.summary || 'Review completed' };
      }

      // Validate and filter reviews
      const validReviews = parsed.reviews.filter((review: ReviewIssue) => {
        if (typeof review.line !== 'number') {
          logger.debug(`Skipping review without line number in ${filePath}`);
          return false;
        }
        if (!review.message) {
          logger.debug(`Skipping review without message in ${filePath}`);
          return false;
        }
        return true;
      });

      logger.info(`  Found ${validReviews.length} review comments in ${filePath}`);

      return {
        reviews: validReviews,
        summary: parsed.summary || `Reviewed ${filePath}`,
      };
    } catch (error) {
      logger.error(`Failed to parse LLM response for ${filePath}: ${error}`);
      logger.debug(`Response was: ${response}`);
      return { reviews: [], summary: 'Failed to parse review response' };
    }
  }

  /**
   * Handle LLM API errors
   */
  private handleError(error: unknown, filePath: string): void {
    if (error instanceof OpenAI.APIError) {
      logger.error(`OpenAI API Error for ${filePath}:`);
      logger.error(`  Status: ${error.status}`);
      logger.error(`  Message: ${error.message}`);
      
      if (error.status === 429) {
        logger.error('  Rate limit exceeded. Consider increasing retry delays.');
      } else if (error.status === 401) {
        logger.error('  Authentication failed. Check your API key.');
      } else if (error.status === 400) {
        logger.error('  Bad request. The prompt may be too long or malformed.');
      }
    } else if (error instanceof Error) {
      logger.error(`Error reviewing ${filePath}: ${error.message}`);
    } else {
      logger.error(`Unknown error reviewing ${filePath}: ${error}`);
    }
  }

  /**
   * Generate a summary of all file reviews
   */
  async generateSummary(
    fileReviews: Array<{ filePath: string; summary: string; issueCount: number }>,
    systemPrompt: string
  ): Promise<string> {
    const summaryPrompt = `Please provide a concise overall summary of the following code review results:

${fileReviews
  .map(
    r =>
      `- ${r.filePath}: ${r.issueCount} issue(s) - ${r.summary}`
  )
  .join('\n')}

Provide a brief overall assessment (2-3 sentences) of the PR quality and any major concerns.`;

    try {
      const response = await withRetry(
        () =>
          this.client.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: summaryPrompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
          }),
        { maxAttempts: 2 }
      );

      return response.choices[0]?.message?.content || 'Review completed';
    } catch (error) {
      logger.warning(`Failed to generate summary: ${error}`);
      return `Reviewed ${fileReviews.length} file(s)`;
    }
  }
}
