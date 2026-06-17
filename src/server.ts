import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import dotenv from "dotenv";
import { runSpecReviewWorkflow } from "./workflows/specReviewWorkflow.js";
import {
  normalizeJiraWebhookPayload,
  isTargetJiraStatus
} from "./lib/jiraWebhookNormalizer.js";

dotenv.config();

const app = express();

app.use(express.json());

function validateWebhookSecret(req: Request):
  | { ok: true }
  | { ok: false; statusCode: number; message: string } {
  const expectedSecret = process.env.WEBHOOK_SHARED_SECRET;

  if (!expectedSecret) {
    return {
      ok: false,
      statusCode: 500,
      message: "Webhook shared secret is not configured"
    };
  }

  const receivedSecret = req.header("x-pi-webhook-secret");

  if (!receivedSecret) {
    return {
      ok: false,
      statusCode: 401,
      message: "Missing webhook shared secret"
    };
  }

  if (receivedSecret !== expectedSecret) {
    return {
      ok: false,
      statusCode: 401,
      message: "Invalid webhook shared secret"
    };
  }

  return { ok: true };
}


app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    message: "Pi Agent Phase 1 is running"
  });
});

app.post("/webhooks/jira", async (req: Request, res: Response) => {
  const secretCheck = validateWebhookSecret(req);

  if (!secretCheck.ok) {
    return res.status(secretCheck.statusCode).json({
      accepted: false,
      error: secretCheck.message
    });
  }

  let jiraEvent;

  try {
    jiraEvent = normalizeJiraWebhookPayload(req.body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Jira payload.";

    return res.status(400).json({
      accepted: false,
      error: message
    });
  }

  const targetStatusName =
    process.env.TARGET_JIRA_STATUS_NAME ?? "Ready for Spec Review";

  const targetStatusId = process.env.TARGET_JIRA_STATUS_ID;

  if (!isTargetJiraStatus(jiraEvent, targetStatusName, targetStatusId)) {
    console.log(`Ignoring ${jiraEvent.issueKey}: not target status`);

    return res.status(200).json({
      accepted: false,
      ignored: true,
      reason: "Ticket is not Ready for Spec Review",
      issueKey: jiraEvent.issueKey,
      statusName: jiraEvent.statusName,
      changedStatusName: jiraEvent.changedStatusName,
      statusId: jiraEvent.statusId,
      changedStatusId: jiraEvent.changedStatusId
    });
  }

  console.log("Normalized Jira webhook event:", {
    issueKey: jiraEvent.issueKey,
    webhookEvent: jiraEvent.webhookEvent,
    source: jiraEvent.source,
    statusName: jiraEvent.statusName,
    changedStatusName: jiraEvent.changedStatusName,
    summary: jiraEvent.summary,
    descriptionText: jiraEvent.descriptionText
  });

  try {
   const workflowResult = await runSpecReviewWorkflow({
  issueKey: jiraEvent.issueKey,
  statusName: jiraEvent.changedStatusName ?? jiraEvent.statusName ?? "unknown",
  summary: jiraEvent.summary?? "No summary available",
  descriptionText: jiraEvent.descriptionText?? "No description available"
});

    return res.status(202).json({
      accepted: true,
      issueKey: jiraEvent.issueKey,
      workflow: workflowResult
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown workflow error";

    console.error(`Workflow failed for ${jiraEvent.issueKey}:`, errorMessage);

    return res.status(500).json({
      accepted: false,
      issueKey: jiraEvent.issueKey,
      error: "Spec review workflow failed",
      detail: errorMessage
    });
  }
});
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("Request parsing error:", err.message);

    res.status(400).json({
      error: "Invalid JSON body"
    });
  }
);

const port = process.env.PORT || 3000;

async function startServer(): Promise<void> {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});