import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import type { VideoFrameRequestV1, VideoFrameResponseV1, VideoJobContractV1 } from "@/lib/videoContracts";
import { VIDEO_CONTRACT_VERSION } from "@/lib/videoContracts";

const readSchema = (relativePath: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf-8"));

describe("Video contracts golden", () => {
  it("validates frozen v1 request/response/job payloads", () => {
    const requestSchema = readSchema("src/validation/contracts/videoFrameRequest.v1.schema.json");
    const responseSchema = readSchema("src/validation/contracts/videoFrameResponse.v1.schema.json");
    const jobSchema = readSchema("src/validation/contracts/videoJob.v1.schema.json");
    const ajv = new Ajv2020({ allErrors: true, strict: false });

    const request: VideoFrameRequestV1 = {
      version: VIDEO_CONTRACT_VERSION,
      videoId: "vid-001",
      frameIndex: 120,
      qualityMode: "fast",
      scale: 0.5,
      width: 4,
      height: 4,
      frameRgba: new Array(4 * 4 * 4).fill(128),
      layerSnapshotHash: "abc123",
      layerPayload: [{ id: "layer-1", algorithm: "Floyd-Steinberg", enabled: true, intensity: 100 }],
      processingBackend: "gpu",
    };

    const response: VideoFrameResponseV1 = {
      version: VIDEO_CONTRACT_VERSION,
      videoId: "vid-001",
      frameIndex: 120,
      width: 4,
      height: 4,
      rgba: new Array(4 * 4 * 4).fill(255),
      cacheHit: true,
      processingMs: 12.5,
      backendUsed: "cpu",
      fallbackUsed: true,
    };

    const job: VideoJobContractV1 = {
      version: VIDEO_CONTRACT_VERSION,
      request: {
        videoId: "vid-001",
        startFrame: 0,
        endFrame: 240,
        fps: 24,
        outputFormat: "gif",
      },
      progress: {
        jobId: "job-001",
        status: "running",
        currentFrame: 12,
        totalFrames: 240,
        outputPath: null,
      },
    };

    const reqOk = ajv.compile(requestSchema)(request);
    expect(reqOk, JSON.stringify(ajv.errors, null, 2)).toBe(true);
    const resOk = ajv.compile(responseSchema)(response);
    expect(resOk, JSON.stringify(ajv.errors, null, 2)).toBe(true);
    const jobOk = ajv.compile(jobSchema)(job);
    expect(jobOk, JSON.stringify(ajv.errors, null, 2)).toBe(true);

    expect({ request, response, job }).toMatchSnapshot();
  });
});

