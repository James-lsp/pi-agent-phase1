import { auditLog, createExecutionId } from "../lib/auditLogger.js";
import { postJiraCommentMock } from "../lib/jiraClient.js";

export type SpecReviewWorkflowInput = {
  issueKey: string;
  statusName: string;
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
        summary: "Mock Jira ticket summary",
        statusName: input.statusName
      }
    });

    if (input.issueKey === "TEST-FAIL") {
      throw new Error("Simulated workflow failure for testing error handling.");
    }

    const commentPreview = [
      `Pi Spec Review Result for ${input.issueKey}`,
      "",
      "This is a mock Phase 1 review.",
      "The real LLM review will be added later.",
      "",
      "Checks that will eventually run:",
      "- Requirement clarity",
      "- Missing acceptance criteria",
      "- Terminology consistency",
      "- SDLC readiness"
    ].join("\n");

    auditLog({
  executionId,
  workflowName,
  stepName: "mock_spec_review",
  status: "pass",
  issueKey: input.issueKey,
  message: "Mock spec review generated successfully.",
  output: {
    commentPreview
  }
});

const jiraCommentResult = await postJiraCommentMock({
  issueKey: input.issueKey,
  commentBody: commentPreview
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
    commentBody: commentPreview
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
  commentPreview,
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