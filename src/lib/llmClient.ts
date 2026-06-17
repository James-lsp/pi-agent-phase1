import { AzureOpenAI } from "openai";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export type SpecReviewLlmInput = {
  issueKey: string;
  statusName: string;
  summary?: string;
  descriptionText?: string;
};

export type SpecReviewLlmResult = {
  mode: "azure-openai";
  model: string;
  content: string;
  latencyMs: number;
  usage?: unknown;
};

function buildSpecReviewPrompt(input: SpecReviewLlmInput): string {
  return `
Review this Jira ticket for spec readiness.

Issue Key:
${input.issueKey}

Status:
${input.statusName}

Summary:
${input.summary ?? "No summary provided"}

Description:
${input.descriptionText ?? "No description provided"}

Return a structured spec review with these sections:
1. Readiness Decision
2. Missing Information
3. Ambiguities
4. Risks
5. Recommended Jira Comment

Do not claim you posted anything to Jira.
`.trim();
}

export async function generateSpecReviewWithAzure(
  input: SpecReviewLlmInput
): Promise<SpecReviewLlmResult> {
  const apiKey = getRequiredEnv("AZURE_OPENAI_API_KEY");
  const endpoint = getRequiredEnv("AZURE_OPENAI_ENDPOINT");
  const deployment = getRequiredEnv("AZURE_OPENAI_DEPLOYMENT");
  const apiVersion = getRequiredEnv("AZURE_OPENAI_API_VERSION");

  const azureClient = new AzureOpenAI({
    apiKey,
    endpoint,
    deployment,
    apiVersion
  });

  const startedAt = Date.now();

  const completion = await azureClient.chat.completions.create({
    model: deployment,
    temperature: 0.2,
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content:
          "You are Pi, a requirements engineering assistant. Review Jira ticket content carefully and return safe, structured spec review feedback."
      },
      {
        role: "user",
        content: buildSpecReviewPrompt(input)
      }
    ]
  });

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Azure GPT-4.1 returned an empty response.");
  }

  return {
    mode: "azure-openai",
    model: deployment,
    content,
    latencyMs: Date.now() - startedAt,
    usage: completion.usage
  };
}
