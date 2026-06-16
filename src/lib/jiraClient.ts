export type PostJiraCommentInput = {
  issueKey: string;
  commentBody: string;
};

export type PostJiraCommentResult = {
  issueKey: string;
  posted: boolean;
  mode: "mock";
  commentId: string;
  commentBodyPreview: string;
  commentBodyLength: number;
};

function createPreview(text: string, maxLength = 200): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export async function postJiraCommentMock(
  input: PostJiraCommentInput
): Promise<PostJiraCommentResult> {
  const result: PostJiraCommentResult = {
    issueKey: input.issueKey,
    posted: true,
    mode: "mock",
    commentId: `mock-comment-${Date.now()}`,
    commentBodyPreview: createPreview(input.commentBody),
    commentBodyLength: input.commentBody.length
  };

  console.log("Mock Jira comment poster:");
  console.log({
    issueKey: input.issueKey,
    commentBody: input.commentBody,
    result
  });

  return result;
}