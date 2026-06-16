export type AuditStatus = "pass" | "fail" | "skipped";

export type AuditLogInput = {
  executionId: string;
  workflowName: string;
  stepName: string;
  status: AuditStatus;
  issueKey?: string;
  message?: string;
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
};

export function createExecutionId(issueKey: string): string {
  const safeIssueKey = issueKey.replace(/[^a-zA-Z0-9-]/g, "");
  return `exec_${Date.now()}_${safeIssueKey}`;
}

export function auditLog(input: AuditLogInput): void {
  const logRecord = {
    type: "agentic_audit",
    timestamp: new Date().toISOString(),
    ...input
  };

  console.log(JSON.stringify(logRecord, null, 2));
}