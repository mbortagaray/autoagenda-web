import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.VERCEL_TOKEN;
const deploymentInput = process.argv[2];
const teamId = process.argv[3];
const outputDir = process.argv[4] || "recovered-vercel";

if (!token || !deploymentInput || !teamId) {
  console.error(
    "Usage: VERCEL_TOKEN=<token> node scripts/download-vercel-deployment.mjs <deployment-url-or-id> <team-id> [output-dir]"
  );
  process.exit(1);
}

const apiBase = "https://api.vercel.com";
const query = new URLSearchParams({ teamId });

async function vercelFetch(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response;
}

async function getJson(url) {
  const response = await vercelFetch(url);
  return response.json();
}

function normalizeDeploymentId(input) {
  return input.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function flattenFiles(entries, prefix = "") {
  const files = [];

  for (const entry of entries || []) {
    const filePath = path.posix.join(prefix, entry.name);

    if (entry.type === "directory") {
      files.push(...flattenFiles(entry.children, filePath));
      continue;
    }

    if (entry.type === "file" && entry.uid) {
      files.push({ ...entry, path: filePath });
    }
  }

  return files;
}

function readContent(payload) {
  const encoded =
    payload?.data ||
    payload?.content ||
    payload?.file ||
    payload?.contents ||
    payload?.body;

  if (typeof encoded !== "string") {
    throw new Error(`Unexpected file response: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  return Buffer.from(encoded, "base64");
}

async function main() {
  const deploymentId = normalizeDeploymentId(deploymentInput);
  const deployment = await getJson(`${apiBase}/v13/deployments/${deploymentId}?${query}`);
  const resolvedId = deployment.uid || deployment.id || deploymentId;

  console.log(`Deployment: ${resolvedId}`);

  const tree = await getJson(`${apiBase}/v6/deployments/${resolvedId}/files?${query}`);
  const files = flattenFiles(Array.isArray(tree) ? tree : tree.files || tree.children);

  console.log(`Files found: ${files.length}`);
  await fs.mkdir(outputDir, { recursive: true });

  for (const file of files) {
    const fileUrl = `${apiBase}/v8/deployments/${resolvedId}/files/${file.uid}?${query}`;
    const payload = await getJson(fileUrl);
    const target = path.join(outputDir, file.path);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, readContent(payload));
    console.log(file.path);
  }

  console.log(`Recovered into ${path.resolve(outputDir)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
