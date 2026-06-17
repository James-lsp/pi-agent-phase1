import { createWorkflow, createStep } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core";
import { z } from "zod";
import { auditLog, createExecutionId } from "../lib/auditLogger.js";
import { postJiraCommentMock } from "../lib/jiraClient.js";
import { generateSpecReviewWithAzure } from "../lib/llmClient.js";

const WORKFLOW_NAME = "spec_review_trigger";

const triggerSchema = z.object({
  executionId: z.string(),
  issueKey: z.string(),
  statusName: z.string(),
  summary: z.string(),
  descriptionText: z.string()
});

const fetchJiraDataStep = createStep({
  id: "mock-fetch-jira-ticket",
  inputSchema: triggerSchema,
  outputSchema: triggerSchema,
  execute: async ({ inputData }) => {
    const { issueKey, statusName, summary, descriptionText, executionId } = inputData;

    auditLog({
      executionId,
      workflowName: WORKFLOW_NAME,
      stepName: "mock_fetch_jira_ticket",
      status: "pass",
      issueKey,
      message: "In Phase 1 mock mode, we are not calling the real Jira API yet.",
      input: { issueKey },
      output: { issueKey, summary, descriptionText, statusName }
    });

    return { executionId, issueKey, statusName, summary, descriptionText };
  }
});

const llmOutputSchema = z.object({
  executionId: z.string(),
  issueKey: z.string(),
  reviewComment: z.string(),
  llmMode: z.string(),
  llmModel: z.string(),
  llmLatencyMs: z.number(),
  llmUsage: z.unknown().optional()
});

const generateSpecReviewStep = createStep({
  id: "generate-spec-review",
  inputSchema: triggerSchema,
  outputSchema: llmOutputSchema,
  execute: async ({ inputData }) => {
    const { issueKey, statusName, summary, descriptionText, executionId } = inputData;

    if (issueKey === "TEST-FAIL") {
      throw new Error("Simulated workflow failure for testing error handling.");
    }

    const llmResult = await generateSpecReviewWithAzure({ issueKey, statusName, summary, descriptionText });

    auditLog({
      executionId,
      workflowName: WORKFLOW_NAME,
      stepName: "mock_spec_review",
      status: "pass",
      issueKey,
      message: "Mock spec review generated successfully.",
      output: {
        mode: llmResult.mode,
        model: llmResult.model,
        latencyMs: llmResult.latencyMs,
        usage: llmResult.usage,
        commentPreview: llmResult.content
      }
    });

    return {
      executionId,
      issueKey,
      reviewComment: llmResult.content,
      llmMode: llmResult.mode,
      llmModel: llmResult.model,
      llmLatencyMs: llmResult.latencyMs,
      llmUsage: llmResult.usage
    };
  }
});

const commentResultSchema = z.object({
  executionId: z.string(),
  issueKey: z.string(),
  reviewComment: z.string(),
  posted: z.boolean(),
  mode: z.literal("mock"),
  commentId: z.string(),
  commentBodyPreview: z.string(),
  commentBodyLength: z.number()
});

const postJiraCommentStep = createStep({
  id: "post-jira-comment",
  inputSchema: llmOutputSchema,
  outputSchema: commentResultSchema,
  execute: async ({ inputData }) => {
    const { issueKey, reviewComment, executionId } = inputData;

    const jiraCommentResult = await postJiraCommentMock({ issueKey, commentBody: reviewComment });

    auditLog({
      executionId,
      workflowName: WORKFLOW_NAME,
      stepName: "mock_post_jira_comment",
      status: "pass",
      issueKey,
      message: "Mock Jira comment posted successfully.",
      input: { issueKey, commentBody: reviewComment },
      output: jiraCommentResult
    });

    return {
      executionId,
      issueKey: jiraCommentResult.issueKey,
      reviewComment,
      posted: jiraCommentResult.posted,
      mode: jiraCommentResult.mode,
      commentId: jiraCommentResult.commentId,
      commentBodyPreview: jiraCommentResult.commentBodyPreview,
      commentBodyLength: jiraCommentResult.commentBodyLength
    };
  }
});

const specReviewMastraWorkflow = createWorkflow({
  id: WORKFLOW_NAME,
  inputSchema: triggerSchema,
  outputSchema: commentResultSchema
})
  .then(fetchJiraDataStep)
  .then(generateSpecReviewStep)
  .then(postJiraCommentStep)
  .commit();

const mastra = new Mastra({
  workflows: { specReviewWorkflow: specReviewMastraWorkflow }
});

export type SpecReviewWorkflowInput = {
  issueKey: string;
  statusName: string;
  summary?: string;
  descriptionText?: string;
};

export type SpecReviewWorkflowResult = {
  executionId: string;
  issueKey: string;
  workflowName: string;
  status: "completed";
  commentPreview: string;
  jiraComment: {
    posted: boolean;
    mode: "mock";
    commentId: string;
    commentBodyPreview: string;
    commentBodyLength: number;
  };
};

export async function runSpecReviewWorkflow(
  input: SpecReviewWorkflowInput
): Promise<SpecReviewWorkflowResult> {
  const executionId = createExecutionId(input.issueKey);
  const summary = input.summary ?? "No summary provided";
  const descriptionText = input.descriptionText ?? "No description provided";

  auditLog({
    executionId,
    workflowName: WORKFLOW_NAME,
    stepName: "workflow_started",
    status: "pass",
    issueKey: input.issueKey,
    input
  });

  const workflow = mastra.getWorkflow("specReviewWorkflow");
  const run = await workflow.createRun();

  const result = await run.start({
    inputData: {
      executionId,
      issueKey: input.issueKey,
      statusName: input.statusName,
      summary,
      descriptionText
    }
  });

  if (result.status === "failed") {
    auditLog({
      executionId,
      workflowName: WORKFLOW_NAME,
      stepName: "workflow_failed",
      status: "fail",
      issueKey: input.issueKey,
      errorMessage: result.error.message
    });
    throw result.error;
  }

  if (result.status !== "success") {
    const errorMessage = `Workflow ended with unexpected status: ${result.status}`;
    auditLog({
      executionId,
      workflowName: WORKFLOW_NAME,
      stepName: "workflow_failed",
      status: "fail",
      issueKey: input.issueKey,
      errorMessage
    });
    throw new Error(errorMessage);
  }

  const output = result.result;

  auditLog({
    executionId,
    workflowName: WORKFLOW_NAME,
    stepName: "workflow_completed",
    status: "pass",
    issueKey: input.issueKey
  });

  return {
    executionId,
    issueKey: input.issueKey,
    workflowName: WORKFLOW_NAME,
    status: "completed",
    commentPreview: output.reviewComment,
    jiraComment: {
      posted: output.posted,
      mode: output.mode,
      commentId: output.commentId,
      commentBodyPreview: output.commentBodyPreview,
      commentBodyLength: output.commentBodyLength
    }
  };
}
