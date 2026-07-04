# Locaily Model Lab

## Developer Documentation

**Status:** Proposed v0.1  
**Project:** Locaily  
**Component:** Controlled local model benchmarking and model-card generation  
**Primary runtime target:** Ollama  
**Internal data format:** JSON  
**Human-readable export format:** Markdown

---

## 1. Purpose

Locaily Model Lab is a controlled local benchmarking environment for evaluating small language models against narrow, versioned task tracks.

Its purpose is to make model testing:

- faster
- repeatable
- comparable
- inspectable
- hardware-aware
- suitable for generating evidence-based model cards

The system is not intended to rank models as generally good or bad. It evaluates whether a specific model, configuration, and prompt contract is suitable for a specific Locaily task track.

Example:

```txt
Model: LFM 2.5 1.2B Thinking Q8
Track: Classification
Result: Qualified

Model: LFM 2.5 1.2B Thinking Q8
Track: Long-form section writing
Result: Conditional
```

The benchmark environment acts as the racetrack for Locaily's task-specialization thesis.

---

## 2. Core Design Principles

### 2.1 Track-specific evaluation

Models are evaluated against narrow task tracks rather than general conversational ability.

Examples:

- classification
- extraction
- fact composition
- routing
- contract-following section writing
- structured JSON generation
- validation
- summarization

### 2.2 Deterministic benchmark control

The benchmark runner must be ordinary deterministic application code.

An AI agent must not control:

- which test cases are selected
- runtime settings
- pass/fail thresholds
- benchmark order
- retries
- result persistence
- environment fingerprints

Models may be used as:

- the worker under test
- an optional semantic judge
- an optional explanation layer

### 2.3 JSON internally, Markdown externally

All benchmark evidence must be stored as validated JSON.

Markdown model cards and reports must be rendered from the stored JSON evidence.

```txt
JSON = source of truth
Markdown = human-readable export
```

### 2.4 Evidence before interpretation

The system must separate:

1. observed output
2. deterministic measurements
3. derived benchmark statistics
4. semantic-judge results
5. human review
6. final interpretation

A model card must not present interpretation as measured fact.

### 2.5 Controlled comparison

Two benchmark runs are comparable only when the system can identify all relevant differences, including:

- model file or digest
- runtime version
- quantization
- system prompt
- worker contract
- test-pack version
- schema version
- inference settings
- hardware profile
- validator version

### 2.6 Fast screening, strict qualification

The system must support multiple benchmark depths:

- quick screen
- qualification run
- regression run
- hardware profile run

Quick results are useful for elimination and iteration but must not be treated as full validation.

---

## 3. Scope

### 3.1 v0.1 scope

The first implementation should support:

- Ollama runtime
- local models
- JSONL test packs
- versioned worker contracts
- JSON Schema validation
- deterministic validators
- warm and cold timing
- sequential execution
- configurable concurrency
- run comparison
- failure inspection
- draft model-card generation

Initial task tracks:

1. classification
2. fact composition
3. contract-following section writing
4. Micro-WCP structured output

### 3.2 Out of scope for v0.1

The following should not block the first release:

- public leaderboard
- distributed NearbyNode execution
- remote cloud-model benchmarking
- automatic model downloading
- automatic prompt optimization
- autonomous model promotion
- full benchmark marketplace
- multi-user authentication
- production-grade experiment scheduling

---

## 4. High-Level Architecture

```txt
User / Test Console
        ↓
Benchmark API
        ↓
Run Configuration Builder
        ↓
Run Plan Validator
        ↓
Benchmark Runner
        ↓
Runtime Adapter
        ↓
Local Model
        ↓
Output Capture
        ↓
Validation Pipeline
        ↓
Result Store
        ↓
Comparison Engine
        ↓
Model Card Generator
```

### 4.1 Main components

```txt
Locaily Model Lab
│
├── Model Registry
├── Track Registry
├── Test Pack Registry
├── Contract Registry
├── Runtime Adapters
├── Benchmark Runner
├── Validation Pipeline
├── Result Store
├── Comparison Engine
├── Model Card Generator
└── Test Console UI
```

---

## 5. Repository Structure

Recommended structure:

```txt
benchmark-lab/
├── README.md
├── package.json
├── configs/
│   ├── inference/
│   ├── hardware/
│   └── runtime/
├── registries/
│   ├── models.json
│   ├── tracks.json
│   ├── contracts.json
│   └── test-packs.json
├── models/
│   └── profiles/
├── tracks/
│   ├── classification/
│   ├── fact-composition/
│   ├── section-writing/
│   └── micro-wcp/
├── contracts/
│   ├── classification/
│   ├── fact-composition/
│   ├── section-writing/
│   └── micro-wcp/
├── test-packs/
│   ├── classification-v1/
│   ├── fact-composition-v1/
│   ├── section-writing-v1/
│   └── micro-wcp-v1/
├── schemas/
│   ├── benchmark-run.schema.json
│   ├── benchmark-case.schema.json
│   ├── benchmark-result.schema.json
│   ├── model-registry-entry.schema.json
│   ├── model-card.schema.json
│   └── validation-result.schema.json
├── src/
│   ├── api/
│   ├── runner/
│   ├── runtimes/
│   ├── validators/
│   ├── comparison/
│   ├── reports/
│   ├── storage/
│   └── ui/
├── results/
│   ├── raw/
│   ├── validated/
│   ├── approved/
│   └── comparisons/
├── model-cards/
├── reports/
└── scripts/
    ├── run-benchmark.js
    ├── compare-runs.js
    ├── generate-model-card.js
    └── validate-test-pack.js
```

---

## 6. Registries

### 6.1 Model Registry

The Model Registry describes models available to the benchmark system.

Example:

```json
{
  "id": "lfm-2.5-1.2b-thinking-q8",
  "displayName": "LFM 2.5 1.2B Thinking Q8",
  "provider": "Liquid AI",
  "runtime": "ollama",
  "runtimeModelName": "lfm2.5-thinking:1.2b-q8",
  "parameterCount": 1200000000,
  "quantization": "Q8",
  "format": "GGUF",
  "digest": "sha256:replace-with-runtime-digest",
  "license": {
    "name": "unknown",
    "commercialUse": null,
    "notes": "Requires verification"
  },
  "capabilities": [
    "text-generation",
    "structured-output"
  ],
  "status": "available"
}
```

Required model identity fields:

- stable model ID
- display name
- runtime
- runtime model name
- quantization
- model digest or immutable identifier
- model format
- availability status

Optional fields:

- parameter count
- context window
- license information
- known runtime constraints
- recommended hardware
- known capabilities

### 6.2 Track Registry

A track defines the narrow job being evaluated.

Example:

```json
{
  "id": "classification",
  "displayName": "Classification",
  "description": "Assign one allowed label to a supplied input.",
  "inputSchema": "schemas/tracks/classification-input.schema.json",
  "outputSchema": "schemas/tracks/classification-output.schema.json",
  "defaultContractId": "classification-worker-v1",
  "validators": [
    "json-schema",
    "allowed-label",
    "no-extra-text"
  ],
  "qualificationThresholds": {
    "overallPassRate": 0.9,
    "schemaPassRate": 1.0,
    "criticalFailureRate": 0.0
  }
}
```

### 6.3 Contract Registry

A contract defines the exact worker instructions supplied to the model.

Each contract must be immutable after release. Changes require a new version.

```json
{
  "id": "classification-worker-v1",
  "trackId": "classification",
  "version": "1.0.0",
  "promptPath": "contracts/classification/classification-worker-v1.txt",
  "promptHash": "sha256:...",
  "outputSchema": "schemas/tracks/classification-output.schema.json",
  "status": "active"
}
```

### 6.4 Test Pack Registry

A test pack is a versioned collection of cases for one track.

```json
{
  "id": "classification-v1",
  "trackId": "classification",
  "version": "1.0.0",
  "manifestPath": "test-packs/classification-v1/manifest.json",
  "caseFiles": [
    "easy.jsonl",
    "ambiguous.jsonl",
    "adversarial.jsonl",
    "malformed-input.jsonl"
  ],
  "status": "active"
}
```

---

## 7. Test Pack Design

### 7.1 Test pack layout

```txt
classification-v1/
├── manifest.json
├── easy.jsonl
├── ambiguous.jsonl
├── adversarial.jsonl
├── malformed-input.jsonl
└── README.md
```

### 7.2 Test pack manifest

```json
{
  "id": "classification-v1",
  "trackId": "classification",
  "version": "1.0.0",
  "description": "Initial controlled classification benchmark.",
  "createdAt": "2026-06-21T00:00:00Z",
  "caseCount": 40,
  "difficultyDistribution": {
    "easy": 10,
    "medium": 10,
    "ambiguous": 10,
    "adversarial": 10
  },
  "requiredValidators": [
    "json-schema",
    "allowed-label",
    "no-extra-text"
  ],
  "qualificationEligible": true
}
```

### 7.3 Benchmark case schema

Each case must contain:

- stable case ID
- track ID
- difficulty
- tags
- input
- expected behavior
- scoring configuration
- critical-failure rules

Example:

```json
{
  "caseId": "fact-017",
  "trackId": "fact-composition",
  "difficulty": "ambiguous",
  "tags": [
    "unsupported-claim",
    "ordering",
    "markdown"
  ],
  "input": {
    "approvedFacts": [
      "The model completed 18 of 20 cases.",
      "Median warm latency was 1.7 seconds."
    ]
  },
  "expected": {
    "requiredFacts": [
      "18 of 20",
      "1.7 seconds"
    ],
    "forbiddenClaims": [
      "The model is reliable.",
      "The model is production-ready."
    ],
    "outputSchema": "fact-composer-output-v1"
  },
  "scoring": {
    "schemaValid": 20,
    "factPreservation": 35,
    "unsupportedClaims": 30,
    "readability": 15
  },
  "criticalFailures": [
    "invented-number",
    "missing-required-fact"
  ]
}
```

### 7.4 Case categories

Each qualification-grade test pack should include:

- normal cases
- edge cases
- ambiguous cases
- adversarial instruction cases
- malformed or incomplete inputs
- long-context cases
- strict formatting cases
- known historical failure cases

---

## 8. Run Configuration

A benchmark run must be created from an immutable run configuration.

Example:

```json
{
  "runId": "run-2026-06-21-001",
  "createdAt": "2026-06-21T15:00:00Z",
  "mode": "qualification",
  "model": {
    "id": "lfm-2.5-1.2b-thinking-q8",
    "runtime": "ollama",
    "runtimeModelName": "lfm2.5-thinking:1.2b-q8",
    "modelDigest": "sha256:...",
    "quantization": "Q8"
  },
  "track": {
    "id": "fact-composition"
  },
  "testPack": {
    "id": "fact-composition-v1",
    "version": "1.0.0"
  },
  "contract": {
    "id": "fact-composer-v3",
    "version": "3.0.0",
    "promptHash": "sha256:..."
  },
  "schemaVersion": "1.1.0",
  "inference": {
    "temperature": 0,
    "topP": 1,
    "seed": 42,
    "maxTokens": 1200,
    "stop": []
  },
  "execution": {
    "mode": "sequential",
    "concurrency": 1,
    "warmupRuns": 2,
    "measuredRunsPerCase": 3,
    "timeoutMs": 60000,
    "retryCount": 0
  },
  "hardwareProfileId": "desktop-rtx-3060-12gb",
  "validatorSetVersion": "1.0.0"
}
```

---

## 9. Benchmark Modes

### 9.1 Quick Screen

Purpose:

- eliminate unsuitable models quickly
- test a new contract
- identify obvious structural failures

Recommended defaults:

```json
{
  "caseLimit": 10,
  "measuredRunsPerCase": 1,
  "warmupRuns": 1,
  "concurrency": 1,
  "qualificationEligible": false
}
```

### 9.2 Qualification Run

Purpose:

- determine whether a model can be assigned to a track
- generate evidence for a model card

Requirements:

- full test pack
- repeated runs where variability matters
- hardware fingerprint
- runtime fingerprint
- all required validators
- failure analysis
- human review for subjective tracks

### 9.3 Regression Run

Triggered when any of the following changes:

- model digest
- model quantization
- runtime version
- prompt contract
- inference settings
- schema
- validator logic
- test pack

Regression runs compare the new configuration against a selected baseline run.

### 9.4 Hardware Profile Run

Purpose:

- compare the same model-track configuration across hardware
- measure load time, throughput, memory demand, and stability

The model, contract, test pack, and inference settings should remain fixed.

---

## 10. Benchmark Execution Flow

```txt
1. Resolve registries
2. Build run configuration
3. Validate run configuration
4. Capture environment fingerprint
5. Verify runtime availability
6. Verify model identity
7. Load test pack
8. Validate test pack
9. Warm model
10. Execute cases
11. Capture raw outputs and metrics
12. Run deterministic validators
13. Run optional semantic validators
14. Calculate aggregate metrics
15. Persist run result
16. Compare against baseline when requested
17. Generate draft model-card update
```

### 10.1 Execution pseudocode

```js
async function executeBenchmark(runConfig) {
  validateRunConfig(runConfig);

  const environment = await captureEnvironment(runConfig);
  const runtime = await createRuntimeAdapter(runConfig.model.runtime);
  const testPack = await loadAndValidateTestPack(runConfig.testPack);

  await runtime.verifyModel(runConfig.model);
  await warmModel(runtime, runConfig);

  const caseResults = [];

  for (const testCase of testPack.cases) {
    const result = await executeCase({
      runtime,
      runConfig,
      testCase
    });

    caseResults.push(result);
    await persistIncrementalResult(runConfig.runId, result);
  }

  const summary = aggregateResults(caseResults, runConfig);
  const finalResult = {
    runConfig,
    environment,
    caseResults,
    summary
  };

  validateBenchmarkResult(finalResult);
  await persistFinalResult(finalResult);

  return finalResult;
}
```

---

## 11. Runtime Adapter Interface

The runner should not depend directly on Ollama-specific behavior.

```ts
interface RuntimeAdapter {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  verifyModel(model: ModelReference): Promise<void>;
  loadModel?(model: ModelReference): Promise<void>;
  unloadModel?(model: ModelReference): Promise<void>;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  getResourceMetrics?(): Promise<ResourceMetrics>;
}
```

### 11.1 Generation request

```ts
interface GenerationRequest {
  model: string;
  systemPrompt?: string;
  prompt: string;
  temperature: number;
  topP: number;
  seed?: number;
  maxTokens: number;
  stop?: string[];
  responseFormat?: "text" | "json";
  timeoutMs: number;
}
```

### 11.2 Generation response

```ts
interface GenerationResponse {
  rawText: string;
  parsedJson?: unknown;
  promptTokens?: number;
  completionTokens?: number;
  totalDurationMs: number;
  loadDurationMs?: number;
  promptEvalDurationMs?: number;
  evalDurationMs?: number;
  tokensPerSecond?: number;
  runtimeMetadata: Record<string, unknown>;
}
```

---

## 12. Model Warm-Up and Performance Measurement

### 12.1 Cold-start measurement

Cold-start tests should measure:

- runtime startup time
- model load time
- time to first token
- total first-response time

Cold-start results must be stored separately from normal measured cases.

### 12.2 Warm measurement

Warm runs should occur after the configured warm-up count.

Track:

- total generation time
- time to first token, if supported
- token count
- tokens per second
- model load duration reported by runtime
- timeout rate
- retry rate

### 12.3 Parallelism rules

Default execution should be sequential.

Concurrency may be enabled only when:

- the runtime supports isolated requests
- hardware contention is understood
- the run configuration records concurrency
- comparisons use equivalent concurrency settings

A benchmark must not silently change concurrency based on available hardware.

---

## 13. Validation Pipeline

Validation should be layered.

```txt
Raw Output
   ↓
Parse Validation
   ↓
Schema Validation
   ↓
Track-Specific Deterministic Rules
   ↓
Reference Comparison
   ↓
Optional Semantic Judge
   ↓
Optional Human Review
   ↓
Final Case Verdict
```

### 13.1 Layer 1: Parse validation

Checks:

- response exists
- valid UTF-8 text
- JSON parses when required
- no wrapper text around strict JSON outputs

### 13.2 Layer 2: Schema validation

Checks:

- required fields
- correct types
- enum values
- array lengths
- no forbidden additional properties
- nested `$ref` validation

### 13.3 Layer 3: Deterministic track validators

Examples:

- required facts present
- prohibited claims absent
- exact label match
- allowed-label enforcement
- correct ordering
- required headings present
- output-length limits
- duplicate detection
- markdown fence leakage
- unknown-value handling

### 13.4 Layer 4: Reference comparison

Supported comparison types:

- exact string match
- normalized string match
- case-insensitive match
- set equality
- subset containment
- ordered list comparison
- numeric tolerance

### 13.5 Layer 5: Semantic rubric

Use only when deterministic checks cannot evaluate the requirement.

Examples:

- readability
- clarity
- completeness
- faithfulness to supplied facts
- instruction adherence in prose

Semantic judge results must include:

- judge model identity
- judge prompt version
- judge output
- score
- confidence when available
- rationale

Semantic scores must not override critical deterministic failures.

### 13.6 Layer 6: Human review

Human review is required when:

- the track is primarily subjective
- deterministic and semantic validators disagree
- confidence is below threshold
- a model is being promoted to Qualified
- a failure appears to expose a new benchmark category

---

## 14. Case Verdicts

Recommended case-level verdicts:

```txt
PASS
FAIL
CRITICAL_FAIL
REVIEW_REQUIRED
EXECUTION_ERROR
TIMEOUT
INVALID_TEST_CASE
```

Example validation result:

```json
{
  "caseId": "fact-017",
  "verdict": "FAIL",
  "score": 72,
  "checks": [
    {
      "validator": "json-schema",
      "status": "pass"
    },
    {
      "validator": "required-facts",
      "status": "pass"
    },
    {
      "validator": "forbidden-claims",
      "status": "fail",
      "details": {
        "matched": [
          "The model is reliable."
        ]
      }
    }
  ],
  "criticalFailure": false,
  "reviewRequired": false
}
```

---

## 15. Aggregate Metrics

Each benchmark summary should include:

### Quality

- overall pass rate
- critical failure rate
- schema pass rate
- exact-match rate
- average weighted score
- unsupported-claim rate
- missing-required-content rate
- human approval rate

### Reliability

- execution error rate
- timeout rate
- retry rate
- output variability
- malformed-output rate

### Performance

- cold-start duration
- median warm latency
- p90 warm latency
- p95 warm latency
- average tokens per second
- average prompt tokens
- average completion tokens
- total benchmark duration

### Hardware

- peak RAM
- peak VRAM
- average CPU utilization
- average GPU utilization
- thermal data when available
- power draw when available

### Efficiency

- score per second
- successful cases per minute
- tokens per watt when power data is available
- memory per successful case

Efficiency metrics should be treated as derived values and clearly labeled.

---

## 16. Result Storage

### 16.1 Raw result preservation

Never overwrite raw model output.

Store:

- exact prompt
- exact system prompt
- raw response
- runtime metadata
- timestamps
- token metrics
- errors

### 16.2 Recommended result layout

```txt
results/
└── raw/
    └── run-2026-06-21-001/
        ├── run-config.json
        ├── environment.json
        ├── cases/
        │   ├── fact-001.json
        │   ├── fact-002.json
        │   └── fact-017.json
        ├── summary.json
        └── run.log
```

Validated results:

```txt
results/
└── validated/
    └── run-2026-06-21-001/
        ├── validation-summary.json
        ├── failures.json
        └── review-queue.json
```

### 16.3 Run immutability

Completed benchmark runs must be immutable.

Corrections should create:

- a new run
- an annotation
- or a superseding review record

Do not edit old evidence in place.

---

## 17. Environment Fingerprinting

Each run must record enough information to explain performance differences.

Example:

```json
{
  "capturedAt": "2026-06-21T15:00:00Z",
  "operatingSystem": {
    "platform": "win32",
    "release": "10.0.26100",
    "architecture": "x64"
  },
  "runtime": {
    "name": "ollama",
    "version": "replace-at-runtime"
  },
  "node": {
    "version": "v22.x"
  },
  "hardware": {
    "cpu": {
      "model": "...",
      "logicalCores": 16
    },
    "memory": {
      "totalBytes": 68719476736
    },
    "gpu": [
      {
        "name": "NVIDIA GeForce RTX 3060",
        "vramBytes": 12884901888,
        "driverVersion": "..."
      }
    ]
  },
  "powerMode": "unknown",
  "backgroundLoad": "not-measured"
}
```

Unknown values should be recorded as unknown, not guessed.

---

## 18. Comparison Engine

The comparison engine should support:

- model vs model
- quantization vs quantization
- contract version vs contract version
- runtime version vs runtime version
- hardware vs hardware
- current run vs accepted baseline

### 18.1 Comparison validity

Before comparing runs, calculate a compatibility report.

```json
{
  "comparable": true,
  "differences": [
    {
      "field": "model.id",
      "left": "lfm-2.5-1.2b-thinking-q8",
      "right": "lfm-2-2.6b-q8",
      "expectedDifference": true
    }
  ],
  "invalidatingDifferences": []
}
```

Examples of potentially invalidating differences:

- different test-pack versions
- different required validators
- different prompt contracts during a model-only comparison
- missing model digest
- different concurrency

The system may still display non-equivalent runs, but it must label the comparison as uncontrolled.

### 18.2 Comparison output

```txt
Model A vs Model B

Quality
- Pass rate
- Critical failures
- Structure adherence
- Unsupported claims

Performance
- Median latency
- p95 latency
- Tokens per second
- Model load time

Reliability
- Timeouts
- Malformed outputs
- Variability

Recommendation
- Better fit for track
- Conditions
- Evidence strength
```

Recommendations must be marked as derived interpretation.

---

## 19. Qualification States

Model qualification must be tracked per model-track-contract combination.

| State | Meaning |
|---|---|
| `untested` | No controlled benchmark evidence exists |
| `screening` | A limited test has been completed |
| `candidate` | Results justify a qualification run |
| `qualified` | Meets the track's defined qualification criteria |
| `conditional` | Useful only under documented constraints |
| `rejected` | Does not meet the track's requirements |
| `revalidation_required` | A relevant dependency changed |

Qualification key:

```txt
model ID
+ model digest
+ track ID
+ contract version
+ inference profile
+ runtime family
```

A model must not remain Qualified automatically after its contract or model file changes.

---

## 20. Qualification Rules

Track definitions should own qualification thresholds.

Example:

```json
{
  "trackId": "classification",
  "thresholds": {
    "minimumCaseCount": 40,
    "overallPassRate": 0.9,
    "schemaPassRate": 1.0,
    "criticalFailureRate": 0,
    "timeoutRateMax": 0.01
  },
  "humanApprovalRequired": false
}
```

For subjective tracks:

```json
{
  "trackId": "section-writing",
  "thresholds": {
    "minimumCaseCount": 30,
    "overallPassRate": 0.85,
    "schemaPassRate": 0.98,
    "criticalFailureRate": 0,
    "humanApprovalRate": 0.8
  },
  "humanApprovalRequired": true
}
```

No qualification threshold should be hard-coded into UI components.

---

## 21. Model Card Generation

### 21.1 Model card source

A model card must be generated from:

- model registry data
- approved benchmark runs
- track qualification records
- human review notes
- known limitations

### 21.2 Model card data schema

```json
{
  "modelId": "lfm-2.5-1.2b-thinking-q8",
  "modelDigest": "sha256:...",
  "generatedAt": "2026-06-21T16:00:00Z",
  "evidenceThrough": "2026-06-21T15:45:00Z",
  "trackQualifications": [
    {
      "trackId": "classification",
      "status": "qualified",
      "runIds": [
        "run-2026-06-21-001"
      ],
      "conditions": []
    },
    {
      "trackId": "fact-composition",
      "status": "conditional",
      "runIds": [
        "run-2026-06-21-006"
      ],
      "conditions": [
        "Use temperature 0",
        "Use fact-composer-v3 contract",
        "Reject outputs containing unsupported conclusions"
      ]
    }
  ],
  "strengths": [],
  "limitations": [],
  "knownFailureModes": [],
  "recommendedConfiguration": {},
  "evidenceStrength": "moderate"
}
```

### 21.3 Markdown output

```md
# LFM 2.5 1.2B Thinking Q8

## Identity

- Runtime:
- Quantization:
- Model digest:
- Tested date:
- Hardware profile:

## Track Qualifications

| Track | Status | Pass Rate | Median Latency | Evidence |
|---|---|---:|---:|---|
| Classification | Qualified | 94% | 0.8s | 1 qualification run |
| Fact Composition | Conditional | 82% | 1.7s | 1 qualification run |

## Observed Strengths

## Observed Limitations

## Known Failure Modes

## Recommended Configuration

## Conditions and Guardrails

## Evidence

- Benchmark run IDs
- Test-pack versions
- Contract versions
- Prompt hashes
- Hardware profiles
```

The generator must not invent prose claims that are absent from evidence or approved human notes.

---

## 22. API Design

Suggested local API endpoints:

### Registries

```txt
GET  /api/models
GET  /api/models/:modelId
GET  /api/tracks
GET  /api/tracks/:trackId
GET  /api/test-packs
GET  /api/contracts
```

### Runs

```txt
POST /api/runs
GET  /api/runs
GET  /api/runs/:runId
POST /api/runs/:runId/cancel
POST /api/runs/:runId/review
```

### Comparisons

```txt
POST /api/comparisons
GET  /api/comparisons/:comparisonId
```

### Model cards

```txt
POST /api/model-cards/:modelId/generate
GET  /api/model-cards/:modelId
GET  /api/model-cards/:modelId/markdown
```

### System

```txt
GET /api/system/status
GET /api/system/runtime
GET /api/system/hardware
```

---

## 23. UI Requirements

The first UI should be a focused test console, not a general AI chat interface.

### 23.1 Run setup screen

Required controls:

- model
- task track
- test pack
- worker contract
- benchmark mode
- inference profile
- run count
- concurrency
- hardware profile
- optional baseline run

Primary action:

```txt
Start Benchmark
```

### 23.2 Live run screen

Display:

- run ID
- current model
- track
- test pack
- contract
- completed cases
- pass/fail counts
- timeouts
- current case
- elapsed time
- median latency
- model/runtime status

Do not hide failures until the run completes.

### 23.3 Result review screen

Display:

- aggregate metrics
- failed cases
- critical failures
- raw input/output
- validator details
- comparison against baseline
- environment fingerprint
- qualification recommendation

Actions:

- approve review
- add note
- mark test case for revision
- compare run
- generate model card
- export JSON
- export Markdown report

### 23.4 Model card screen

Display:

- current qualification by track
- evidence freshness
- active conditions
- strengths
- limitations
- known failure modes
- linked benchmark runs
- revalidation warnings

---

## 24. CLI Design

### Run benchmark

```powershell
npm run benchmark -- `
  --model lfm-2.5-1.2b-thinking-q8 `
  --track classification `
  --pack classification-v1 `
  --contract classification-worker-v1 `
  --mode quick-screen
```

### Qualification run

```powershell
npm run benchmark -- `
  --model lfm-2.5-1.2b-thinking-q8 `
  --track fact-composition `
  --pack fact-composition-v1 `
  --contract fact-composer-v3 `
  --mode qualification `
  --hardware desktop-rtx-3060-12gb
```

### Compare runs

```powershell
npm run benchmark:compare -- `
  --left run-2026-06-21-001 `
  --right run-2026-06-21-004
```

### Generate model card

```powershell
npm run model-card:generate -- `
  --model lfm-2.5-1.2b-thinking-q8
```

---

## 25. Error Handling

Recommended error codes:

```txt
BENCHMARK_CONFIG_INVALID
MODEL_NOT_REGISTERED
MODEL_UNAVAILABLE
MODEL_DIGEST_MISMATCH
RUNTIME_UNAVAILABLE
RUNTIME_REQUEST_FAILED
TEST_PACK_NOT_FOUND
TEST_PACK_INVALID
TEST_CASE_INVALID
CONTRACT_NOT_FOUND
CONTRACT_HASH_MISMATCH
OUTPUT_PARSE_FAILED
OUTPUT_SCHEMA_INVALID
VALIDATOR_FAILED
RUN_TIMEOUT
RUN_CANCELLED
RESULT_PERSIST_FAILED
COMPARISON_NOT_CONTROLLED
MODEL_CARD_EVIDENCE_INSUFFICIENT
```

Errors should include:

```json
{
  "code": "MODEL_DIGEST_MISMATCH",
  "message": "The runtime model digest does not match the registered model digest.",
  "details": {
    "expected": "sha256:...",
    "actual": "sha256:..."
  },
  "nextStep": "Update the registry or restore the expected model file before running a controlled benchmark."
}
```

---

## 26. Logging

Each run should produce structured logs.

Minimum event types:

```txt
run.created
run.validated
runtime.connected
model.verified
model.warmup.started
model.warmup.completed
case.started
case.generation.completed
case.validation.completed
case.failed
case.completed
run.aggregation.completed
run.completed
run.cancelled
run.failed
```

Example:

```json
{
  "timestamp": "2026-06-21T15:10:30.000Z",
  "event": "case.validation.completed",
  "runId": "run-2026-06-21-001",
  "caseId": "fact-017",
  "verdict": "FAIL",
  "durationMs": 14
}
```

---

## 27. Security and Isolation

The benchmark environment should assume model output is untrusted.

Requirements:

- never execute generated code by default
- never interpolate model output into shell commands
- restrict file access to benchmark directories
- validate all file paths
- use allowlisted runtime endpoints
- sanitize Markdown rendering
- limit request size
- enforce generation timeouts
- do not expose arbitrary local files through the UI

Future tool-use benchmarks should run inside a separate sandbox with explicit tool allowlists.

---

## 28. Test Strategy for Model Lab Itself

### Unit tests

- registry resolution
- run configuration validation
- JSON Schema validation
- prompt hashing
- case loading
- deterministic validators
- aggregation formulas
- qualification logic
- comparison compatibility
- model-card rendering

### Integration tests

- Ollama connection
- model verification
- generation request
- timeout behavior
- raw result persistence
- interrupted run recovery
- API-to-runner flow

### Fixture model

Use a deterministic mock runtime adapter for automated tests.

```js
class MockRuntimeAdapter {
  async verifyModel() {}

  async generate(request) {
    return {
      rawText: JSON.stringify({ label: "supported" }),
      totalDurationMs: 10,
      runtimeMetadata: {
        mock: true
      }
    };
  }
}
```

### Acceptance test

The v0.1 system is accepted when it can:

1. register two local models
2. load one classification test pack
3. run both models under identical conditions
4. preserve raw outputs
5. validate every case
6. compare both runs
7. produce two draft Markdown model cards
8. show all evidence in the UI

---

## 29. Implementation Phases

### Phase 1: Benchmark foundation

Deliverables:

- model registry
- track registry
- contract registry
- test-pack loader
- benchmark-run schema
- result schema
- Ollama adapter
- sequential runner
- raw result persistence

Acceptance condition:

- one model can run one complete classification test pack from CLI

### Phase 2: Validation and reporting

Deliverables:

- JSON Schema validator
- deterministic validator interface
- aggregate metrics
- failure reports
- Markdown benchmark report

Acceptance condition:

- every case receives an inspectable verdict with validator evidence

### Phase 3: Comparison and qualification

Deliverables:

- run comparison engine
- compatibility checks
- track qualification rules
- qualification records
- baseline support

Acceptance condition:

- two models can be compared under controlled conditions and assigned evidence-based track states

### Phase 4: Model cards

Deliverables:

- model-card JSON schema
- model-card generator
- Markdown renderer
- evidence links
- revalidation detection

Acceptance condition:

- a draft card can be generated without manually copying benchmark statistics

### Phase 5: Visual test console

Deliverables:

- run setup UI
- live progress UI
- failure inspector
- comparison view
- model-card view

Acceptance condition:

- a user can launch, monitor, review, and export a benchmark without PowerShell

### Phase 6: Expanded tracks

Add:

- fact composition
- section writing
- Micro-WCP
- routing
- extraction

### Phase 7: NearbyNode execution

Future extension:

- discover benchmark-capable nodes
- schedule models on specific hardware nodes
- compare identical tests across nodes
- preserve node identity in environment fingerprint

---

## 30. Initial Development Milestone

The first practical milestone should be deliberately narrow:

> Run two local models against one versioned classification test pack, record controlled evidence, compare the results, and generate two draft model cards.

Required models:

- one current preferred small model
- one comparison model

Required evidence:

- exact model identity
- exact contract
- exact test pack
- fixed inference settings
- hardware fingerprint
- raw outputs
- validator results
- aggregate metrics

This milestone proves the core loop before expanding the system.

---

## 31. Definition of Done for v0.1

Locaily Model Lab v0.1 is complete when:

- benchmark inputs are versioned
- benchmark runs are reproducible
- raw outputs are preserved
- the environment is fingerprinted
- deterministic validation is implemented
- results are stored as JSON
- run comparison is available
- model cards are rendered from evidence
- qualification is track-specific
- the user can inspect failures
- the system does not require manual prompt copying
- the UI can launch and review a benchmark

---

## 32. Non-Goals and Guardrails

The Model Lab must not:

- declare a model production-ready from a quick screen
- treat a judge model as unquestionable truth
- hide failed test cases
- overwrite raw outputs
- compare incompatible runs without warning
- describe subjective interpretation as measured fact
- use one overall score to erase track-specific behavior
- silently change inference settings
- silently retry failed outputs
- promote a model automatically without evidence

---

## 33. Future Extensions

Potential future capabilities:

- prompt-contract A/B testing
- quantization comparison
- runtime comparison
- energy-use benchmarking
- repeated stability testing
- benchmark-pack authoring UI
- failure clustering
- semantic-drift detection
- distributed NearbyNode runs
- model routing recommendations
- automated regression alerts
- benchmark result signing
- public export bundles
- contributor-submitted test packs

These should be added only after the core controlled benchmark loop is reliable.

---

## 34. Final System Summary

Locaily Model Lab is the controlled evaluation layer for Locaily.

It answers:

```txt
Which model?
For which task track?
Under which contract?
On which hardware?
With what reliability?
At what performance cost?
Under what conditions?
Based on what evidence?
```

Its output is not merely a score.

Its output is a defensible model-track decision backed by reproducible benchmark evidence.
