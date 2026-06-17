import { z } from "zod";

const jiraWebhookPayloadSchema = z.looseObject({
  timestamp: z.union([z.number(), z.string()]).optional(),
  webhookEvent: z.string().optional(),
  source: z.string().optional(),
  issue: z
    .looseObject({
      id: z.string().optional(),
      key: z.string().optional(),
      fields: z
        .looseObject({
          summary: z.string().optional(),
          description: z.unknown().optional(),
          status: z
            .looseObject({
              id: z.string().optional(),
              name: z.string().optional()
            })
            .optional()
        })
        .optional(),
      status: z
        .looseObject({
          id: z.string().optional(),
          name: z.string().optional()
        })
        .optional()
    })
    .optional(),
  changelog: z
    .looseObject({
      items: z
        .array(
          z.looseObject({
            field: z.string().optional(),
            fieldId: z.string().optional(),
            from: z.string().nullable().optional(),
            fromString: z.string().nullable().optional(),
            to: z.string().nullable().optional(),
            toString: z.string().nullable().optional()
          })
        )
        .optional()
    })
    .optional()
});

type JiraWebhookPayload = z.infer<typeof jiraWebhookPayloadSchema>;

export type NormalizedJiraWebhookEvent = {
  issueKey: string;
  webhookEvent: string;
  source: string;
  statusName?: string;
  statusId?: string;
  changedStatusName?: string;
  changedStatusId?: string;
  summary?: string;
  descriptionText?: string;
  raw: unknown;
};

function extractTextFromAdfNode(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const record = node as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text;
  }

  if (Array.isArray(record.content)) {
    return record.content
      .map(extractTextFromAdfNode)
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function toSafeText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  const extractedText = extractTextFromAdfNode(value).trim();

  if (extractedText) {
    return extractedText;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "[Unable to serialize description]";
  }
}

function findStatusChange(payload: JiraWebhookPayload) {
  const items = payload.changelog?.items ?? [];

  return items.find((item) => {
    const field = item.field?.toLowerCase();
    const fieldId = item.fieldId?.toLowerCase();

    return field === "status" || fieldId === "status";
  });
}

export function normalizeJiraWebhookPayload(raw: unknown): NormalizedJiraWebhookEvent {
  const parsed = jiraWebhookPayloadSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error("Invalid Jira webhook payload shape.");
  }

  const payload = parsed.data;
  const issueKey = payload.issue?.key;

  if (!issueKey) {
    throw new Error("Missing Jira issue key.");
  }

  const statusChange = findStatusChange(payload);

  const statusName =
    payload.issue?.fields?.status?.name ??
    payload.issue?.status?.name;

  const statusId =
    payload.issue?.fields?.status?.id ??
    payload.issue?.status?.id;

  const changedStatusName = statusChange?.toString ?? undefined;
  const changedStatusId = statusChange?.to ?? undefined;

  return {
    issueKey,
    webhookEvent: payload.webhookEvent ?? "unknown",
    source: payload.source ?? "unknown",
    statusName,
    statusId,
    changedStatusName,
    changedStatusId,
    summary: payload.issue?.fields?.summary,
    descriptionText: toSafeText(payload.issue?.fields?.description),
    raw
  };
}

export function isTargetJiraStatus(
  event: NormalizedJiraWebhookEvent,
  targetStatusName: string,
  targetStatusId?: string
): boolean {
  const normalizedTargetName = targetStatusName.trim().toLowerCase();

  const possibleNames = [
    event.changedStatusName,
    event.statusName
  ]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());

  const possibleIds = [
    event.changedStatusId,
    event.statusId
  ].filter(Boolean);

  const nameMatches = possibleNames.includes(normalizedTargetName);
  const idMatches = targetStatusId ? possibleIds.includes(targetStatusId) : false;

  return nameMatches || idMatches;
}