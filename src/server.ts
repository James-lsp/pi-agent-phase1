import express, {
  type NextFunction,
  type Request,
  type Response
} from "express";
import dotenv from "dotenv";
import { z } from "zod";
import { runSpecReviewWorkflow } from "./workflows/specReviewWorkflow.js";

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

const JiraWebhookSchema = z.looseObject({
  webhookEvent: z.string().optional(),

  issue: z.looseObject({
    key: z.string(),

    fields: z
      .looseObject({
        status: z
          .looseObject({
            name: z.string()
          })
          .optional()
      })
      .optional()
  }),

  changelog: z
    .looseObject({
      items: z
        .array(
          z.looseObject({
            field: z.string().optional(),
            fromString: z.string().optional(),
            toString: z.string().optional()
          })
        )
        .optional()
    })
    .optional()
});

function isReadyForSpecReview(payload: unknown): boolean {
  const parsed = JiraWebhookSchema.safeParse(payload);

  if (!parsed.success) {
    return false;
  }

  const currentStatus = parsed.data.issue.fields?.status?.name;

  if (currentStatus === "Ready for Spec Review") {
    return true;
  }

  const changedToReady = parsed.data.changelog?.items?.some((item) => {
    return item.field === "status" && item.toString === "Ready for Spec Review";
  });

  return Boolean(changedToReady);
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    message: "Pi Agent Phase 1 is running"
  });
});

app.post("/webhooks/jira", async(req: Request, res: Response) => {
  const secretCheck = validateWebhookSecret(req);

if (!secretCheck.ok) {
  return res.status(secretCheck.statusCode).json({
    accepted: false,
    error: secretCheck.message
  });
}
  const parsed = JiraWebhookSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      accepted: false,
      error: "Invalid Jira webhook payload"
    });
  }

  const issueKey = parsed.data.issue.key;
  const statusName = parsed.data.issue.fields?.status?.name ?? "unknown";

  console.log("Jira webhook received:");
  console.log({
    issueKey,
    webhookEvent: parsed.data.webhookEvent,
    statusName
  });

  if (!isReadyForSpecReview(req.body)) {
    console.log(`Ignoring ${issueKey}: not Ready for Spec Review`);

    return res.json({
      accepted: false,
      ignored: true,
      issueKey,
      reason: "Ticket is not Ready for Spec Review"
    });
  }

  console.log(`Accepted ${issueKey}: Ready for Spec Review`);

try {
  const workflowResult = await runSpecReviewWorkflow({
    issueKey,
    statusName
  });

  res.status(202).json({
    accepted: true,
    issueKey,
    workflow: workflowResult
  });
} catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown workflow error";

  console.error(`Workflow failed for ${issueKey}:`, errorMessage);

  res.status(500).json({
    accepted: false,
    issueKey,
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});