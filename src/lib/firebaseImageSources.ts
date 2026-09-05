// Restrict Next's public image optimizer to configured application buckets.
// Never accept wildcards from configuration or all Firebase Storage buckets.
export function firebaseStorageImagePatterns(
  configuredBuckets: Array<string | undefined>,
  projectId?: string,
) {
  const buckets = new Set<string>();
  const append = (raw: string | undefined) => {
    const bucket = raw?.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");
    if (bucket && /^[a-z0-9][a-z0-9._-]+$/.test(bucket)) buckets.add(bucket);
  };
  configuredBuckets.forEach(append);
  if (projectId && /^[a-z][a-z0-9-]+$/.test(projectId)) {
    append(`${projectId}.appspot.com`);
    append(`${projectId}.firebasestorage.app`);
  }
  return [...buckets].map((bucket) => ({
    protocol: "https" as const,
    hostname: "firebasestorage.googleapis.com",
    port: "",
    pathname: `/v0/b/${bucket}/o/**`,
  }));
}
