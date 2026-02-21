function getApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");
  return apiKey;
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getApiKey()}`,
  };
}

export async function callLLM(prompt: string): Promise<string> {
  const res = await fetch("https://api.minimax.io/v1/chat/completions", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "MiniMax-M2.5-highspeed",
      max_tokens: 1024*2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax LLM ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0].message.content;
}

export async function generateImage(
  prompt: string,
  referenceImageUrl?: string
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "image-01",
    prompt,
    aspect_ratio: "16:9",
    response_format: "url",
    n: 1,
  };
  if (referenceImageUrl) {
    body.subject_reference = [
      { type: "character", image_file: referenceImageUrl },
    ];
  }

  const res = await fetch("https://api.minimax.io/v1/image_generation", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax image ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    data: { image_urls: string[] };
    base_resp: { status_code: number; status_msg: string };
  };

  if (json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax image error: ${json.base_resp.status_msg}`);
  }

  return json.data.image_urls[0];
}

export async function generateVideo(
  prompt: string,
  firstFrameUrl: string,
  lastFrameUrl: string
): Promise<string> {
  // 1. Create task
  const res = await fetch("https://api.minimax.io/v1/video_generation", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "MiniMax-Hailuo-02",
      prompt,
      first_frame_image: firstFrameUrl,
      last_frame_image: lastFrameUrl,
      duration: 6,
      resolution: "768P",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax video ${res.status}: ${body}`);
  }

  const task = (await res.json()) as {
    task_id: string;
    base_resp: { status_code: number; status_msg: string };
  };
  if (task.base_resp.status_code !== 0) {
    throw new Error(`MiniMax video error: ${task.base_resp.status_msg}`);
  }

  // 2. Poll for completion
  const fileId = await pollVideoTask(task.task_id);

  // 3. Get download URL
  return await getFileUrl(fileId);
}

async function pollVideoTask(taskId: string): Promise<string> {
  while (true) {
    const res = await fetch(
      `https://api.minimax.io/v1/query/video_generation?task_id=${taskId}`,
      { headers: { Authorization: `Bearer ${getApiKey()}` } }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MiniMax poll ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      status: string;
      file_id?: string;
      base_resp: { status_code: number; status_msg: string };
    };

    if (json.status === "Success" && json.file_id) {
      return json.file_id;
    }
    if (json.status === "Fail") {
      throw new Error(`Video generation failed: ${json.base_resp.status_msg}`);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(
    `https://api.minimax.io/v1/files/retrieve?file_id=${fileId}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax file ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    file: { download_url: string };
  };
  return json.file.download_url;
}
