import { auditLog, createExecutionId } from "../lib/auditLogger.js";
import { postJiraCommentMock } from "../lib/jiraClient.js";

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
  const workflowName = "spec_review_trigger";
  const executionId = createExecutionId(input.issueKey);
  const summary = input.summary ?? "No summary provided";
  const descriptionText = input.descriptionText ?? "No description provided";

  auditLog({
    executionId,
    workflowName,
    stepName: "workflow_started",
    status: "pass",
    issueKey: input.issueKey,
    input
  });

  try {
    auditLog({
      executionId,
      workflowName,
      stepName: "mock_fetch_jira_ticket",
      status: "pass",
      issueKey: input.issueKey,
      message: "In Phase 1 mock mode, we are not calling the real Jira API yet.",
      input: {
        issueKey: input.issueKey
      },
     output: {
  issueKey: input.issueKey,
  summary,
  descriptionText,
  statusName: input.statusName
}
    });

    if (input.issueKey === "TEST-FAIL") {
      throw new Error("Simulated workflow failure for testing error handling.");
    }

   const reviewComment = `
Spec Review for ${input.issueKey}

Summary:
${summary}

Description:
${descriptionText}

Mock Review Result:
- Requirements are being reviewed.
- No real Jira comment was posted.
- LLM integration is not active yet.
`.trim();

    auditLog({
  executionId,
  workflowName,
  stepName: "mock_spec_review",
  status: "pass",
  issueKey: input.issueKey,
  message: "Mock spec review generated successfully.",
  output: {
    commentPreview: reviewComment
  }
});

const jiraCommentResult = await postJiraCommentMock({
  issueKey: input.issueKey,
  commentBody: reviewComment
});

auditLog({
  executionId,
  workflowName,
  stepName: "mock_post_jira_comment",
  status: "pass",
  issueKey: input.issueKey,
  message: "Mock Jira comment posted successfully.",
  input: {
    issueKey: input.issueKey,
    commentBody: reviewComment
  },
  output: jiraCommentResult
});

auditLog({
  executionId,
  workflowName,
  stepName: "workflow_completed",
  status: "pass",
  issueKey: input.issueKey
});

return {
  executionId,
  issueKey: input.issueKey,
  workflowName,
  status: "completed",
  commentPreview: reviewComment,
  jiraComment: {
  posted: jiraCommentResult.posted,
  mode: jiraCommentResult.mode,
  commentId: jiraCommentResult.commentId,
  commentBodyPreview: jiraCommentResult.commentBodyPreview,
  commentBodyLength: jiraCommentResult.commentBodyLength
}
};
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown workflow error";

    auditLog({
      executionId,
      workflowName,
      stepName: "workflow_failed",
      status: "fail",
      issueKey: input.issueKey,
      errorMessage
    });

    throw error;
  }
}