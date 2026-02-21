import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = "us-west-2";
const MODEL_ID = "anthropic.claude-sonnet-4-6";

const client = new BedrockRuntimeClient({ region: REGION });

export async function callBedrock(prompt: string): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(body),
  });

  const response = await client.send(command);

  const json = JSON.parse(new TextDecoder().decode(response.body)) as {
    content: { type: string; text: string }[];
  };

  return json.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}
