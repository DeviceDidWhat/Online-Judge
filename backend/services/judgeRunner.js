const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Language = require('../models/language');

// Custom images bundle GNU `/usr/bin/time`, used to measure the program's own
// runtime/memory inside the container (see backend/docker/*.Dockerfile). All are
// Debian/Ubuntu-based so `time` is available consistently. Build them with
// backend/docker/build.ps1 (or build.sh) before judging, or override per-language
// via JUDGE_IMAGE_<LANG> env vars.
const DEFAULT_DOCKER_IMAGES = {
  cpp: 'judge-gcc:13',
  c: 'judge-gcc:13',
  python: 'judge-python:3.10',
  py: 'judge-python:3.10',
  javascript: 'judge-node:18',
  js: 'judge-node:18',
  java: 'judge-java:17',
};

const LANGUAGE_SPECS = {
  cpp: {
    file: 'main.cpp',
    compile: 'g++ -std=c++17 -O2 -pipe /workspace/main.cpp -o /workspace/main',
    run: '/workspace/main',
  },
  c: {
    file: 'main.c',
    compile: 'gcc -std=c11 -O2 -pipe /workspace/main.c -o /workspace/main',
    run: '/workspace/main',
  },
  python: {
    file: 'main.py',
    run: 'PYTHONDONTWRITEBYTECODE=1 python3 /workspace/main.py',
  },
  py: {
    file: 'main.py',
    run: 'PYTHONDONTWRITEBYTECODE=1 python3 /workspace/main.py',
  },
  javascript: {
    file: 'main.js',
    run: 'node /workspace/main.js',
  },
  js: {
    file: 'main.js',
    run: 'node /workspace/main.js',
  },
  java: {
    file: 'Main.java',
    compile: 'javac /workspace/Main.java',
    run: 'java -cp /workspace Main',
  },
};

const DOCKER_TIMEOUT_BUFFER_MS = Number(process.env.JUDGE_TIMEOUT_BUFFER_MS || 2000);

const normalizeLanguageId = (language) => String(language || '').trim().toLowerCase();

const normalizeOutput = (value) => String(value ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .trimEnd();

// GNU `/usr/bin/time -f 'JUDGE_TIMING %e %U %S %M'` appends a line like
// `JUDGE_TIMING 0.18 0.17 0.00 3456` to stderr: wall(s) user(s) sys(s) maxRSS(KB).
// This measures only the user program, excluding the ~100-300ms container/shell
// startup that previously dominated (and distorted) the reported runtime.
const TIMING_REGEX = /JUDGE_TIMING\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)/;

const parseTiming = (stderr) => {
  const match = String(stderr || '').match(TIMING_REGEX);
  if (!match) return null;
  const wallMs = Math.round(parseFloat(match[1]) * 1000);
  const cpuMs = Math.round((parseFloat(match[2]) + parseFloat(match[3])) * 1000);
  const memoryMb = Number(match[4]) / 1024;
  return { wallMs, cpuMs, memoryMb };
};

// Remove the timing sentinel and GNU time's diagnostic lines so the user only
// sees their program's actual stderr.
const stripTiming = (stderr) => String(stderr || '')
  .replace(/^.*JUDGE_TIMING.*\r?\n?/gm, '')
  .replace(/^.*Command (?:exited with non-zero status|terminated by signal).*\r?\n?/gm, '');

// POSIX single-quote escaping so an arbitrary run command can be safely passed
// to the inner `sh -c` that GNU time invokes.
const shSingleQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const execFile = (command, args, options = {}) => new Promise((resolve) => {
  const startedAt = process.hrtime.bigint();
  const child = spawn(command, args, {
    cwd: options.cwd,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timer = options.timeoutMs ? setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, options.timeoutMs) : null;

  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (error) => {
    if (timer) clearTimeout(timer);
    resolve({ code: null, signal: null, stdout, stderr: stderr || error.message, timedOut, runtimeMs: 0 });
  });
  child.on('close', (code, signal) => {
    if (timer) clearTimeout(timer);
    const runtimeMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    resolve({ code, signal, stdout, stderr, timedOut, runtimeMs });
  });

  if (options.input) child.stdin.end(options.input);
  else child.stdin.end();
});

const dockerArgs = ({ workDir, image, command, input, readonly, memoryLimitMb, timeLimitMs, name, measure }) => {
  const args = [
    'run',
    '--name', name,
    '--network', 'none',
    '--cpus', process.env.JUDGE_DOCKER_CPUS || '1',
    '--memory', `${memoryLimitMb}m`,
    '--memory-swap', `${memoryLimitMb}m`,
    '--pids-limit', process.env.JUDGE_DOCKER_PIDS_LIMIT || '128',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--read-only',
    '--workdir', '/workspace',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '-v', `${workDir.replace(/\\/g, '/')}:/workspace${readonly ? ':ro' : ''}`,
  ];

  const extraSecurityOpt = process.env.JUDGE_DOCKER_SECURITY_OPT;
  if (extraSecurityOpt) args.push('--security-opt', extraSecurityOpt);
  if (input) args.push('-i');

  // For program runs, measure the process itself with GNU time. The outer shell
  // (and all container/startup overhead) is excluded from the measurement.
  const finalCommand = measure
    ? `/usr/bin/time -f 'JUDGE_TIMING %e %U %S %M' sh -c ${shSingleQuote(command)}`
    : command;

  args.push(image, 'sh', '-c', finalCommand);
  return { command: 'docker', args, timeoutMs: timeLimitMs + DOCKER_TIMEOUT_BUFFER_MS, input };
};

const runDocker = async (params) => {
  const execution = dockerArgs(params);
  try {
    const runResult = await execFile(execution.command, execution.args, {
      input: execution.input,
      timeoutMs: execution.timeoutMs,
    });

    // When measured, prefer GNU time's program-level wall/cpu/memory over the
    // process-level runtimeMs (which includes container startup overhead).
    const timing = parseTiming(runResult.stderr);
    return {
      ...runResult,
      stderr: timing ? stripTiming(runResult.stderr) : runResult.stderr,
      measuredRuntimeMs: timing ? timing.wallMs : null,
      measuredCpuMs: timing ? timing.cpuMs : null,
      measuredMemoryMb: timing ? timing.memoryMb : null,
    };
  } finally {
    await execFile('docker', ['rm', '-f', params.name], { timeoutMs: 2000 });
  }
};

const loadLanguageSpec = async (languageId) => {
  const normalized = normalizeLanguageId(languageId);
  const stored = await Language.findOne({ languageId: normalized, enabled: true }).lean();
  const base = LANGUAGE_SPECS[normalized];
  if (!base && !stored) throw new Error(`Unsupported language: ${languageId}`);

  return {
    ...base,
    compile: stored?.compileCommand || base?.compile,
    run: stored?.runCommand || base?.run,
    image: process.env[`JUDGE_IMAGE_${normalized.toUpperCase()}`] || DEFAULT_DOCKER_IMAGES[normalized],
  };
};

const createCompileError = (compileOutput, totalTestcases) => ({
  verdict: 'Compilation Error',
  runtime: 0,
  memory: 0,
  testcasesPassed: 0,
  totalTestcases,
  compileOutput: compileOutput.slice(0, 12000),
  stderr: compileOutput.slice(0, 12000),
  testcaseResults: [],
});

const runSubmission = async ({ submission, problem }) => {
  const spec = await loadLanguageSpec(submission.language);
  if (!spec.image) throw new Error(`No Docker image configured for language: ${submission.language}`);
  if (!spec.file || !spec.run) throw new Error(`Incomplete language runner for: ${submission.language}`);

  const timeLimitMs = problem.timeLimitMs || 1000;
  const memoryLimitMb = problem.memoryLimitMb || 256;
  const testcases = [...(problem.testCases || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-'));

  try {
    await fs.writeFile(path.join(workDir, spec.file), submission.sourceCode, 'utf8');

    if (spec.compile) {
      const compileName = `judge_compile_${crypto.randomBytes(8).toString('hex')}`;
      const compileResult = await runDocker({
        workDir,
        image: spec.image,
        command: spec.compile,
        readonly: false,
        memoryLimitMb,
        timeLimitMs: Math.max(timeLimitMs, 10000),
        name: compileName,
      });
      if (compileResult.timedOut || compileResult.code !== 0) {
        return createCompileError(compileResult.stderr || compileResult.stdout || 'Compilation failed', testcases.length);
      }
    }

    const testcaseResults = [];
    let maxRuntime = 0;
    let maxMemory = 0;

    for (let i = 0; i < testcases.length; i += 1) {
      const testcase = testcases[i];
      const runName = `judge_run_${crypto.randomBytes(8).toString('hex')}`;
      const runResult = await runDocker({
        workDir,
        image: spec.image,
        command: spec.run,
        input: testcase.input,
        readonly: true,
        memoryLimitMb,
        timeLimitMs,
        name: runName,
        measure: true,
      });

      const runtime = Math.ceil(runResult.measuredRuntimeMs ?? runResult.runtimeMs);
      const memory = Number((runResult.measuredMemoryMb ?? 0).toFixed(2));
      maxRuntime = Math.max(maxRuntime, runtime);
      maxMemory = Math.max(maxMemory, memory);

      const actualOutput = normalizeOutput(runResult.stdout);
      const expectedOutput = normalizeOutput(testcase.expectedOutput);
      let verdict = 'Accepted';
      if (runResult.timedOut || runtime > timeLimitMs) verdict = 'TLE';
      else if (runResult.code === 137 || /out of memory|killed/i.test(runResult.stderr)) verdict = 'MLE';
      else if (runResult.code !== 0) verdict = 'Runtime Error';
      else if (actualOutput !== expectedOutput) verdict = 'Wrong Answer';

      const result = {
        index: i + 1,
        verdict,
        runtime,
        memory,
        stdout: runResult.stdout.slice(0, 4000),
        stderr: runResult.stderr.slice(0, 4000),
      };
      testcaseResults.push(result);

      if (verdict !== 'Accepted') {
        return {
          verdict,
          runtime: maxRuntime,
          memory: maxMemory,
          testcasesPassed: i,
          totalTestcases: testcases.length,
          stdout: runResult.stdout.slice(0, 12000),
          stderr: runResult.stderr.slice(0, 12000),
          testcaseResults,
          failedTestcase: {
            input: testcase.input,
            expectedOutput: testcase.expectedOutput,
            actualOutput,
            index: i + 1,
          },
        };
      }
    }

    return {
      verdict: 'Accepted',
      runtime: maxRuntime,
      memory: maxMemory,
      testcasesPassed: testcases.length,
      totalTestcases: testcases.length,
      stdout: testcaseResults[testcaseResults.length - 1]?.stdout || '',
      stderr: '',
      testcaseResults,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
};

const runCode = async ({ language, sourceCode, input = '', timeLimitMs = 1000, memoryLimitMb = 256 }) => {
  const spec = await loadLanguageSpec(language);
  if (!spec.image) throw new Error(`No Docker image configured for language: ${language}`);
  if (!spec.file || !spec.run) throw new Error(`Incomplete language runner for: ${language}`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-'));
  try {
    await fs.writeFile(path.join(workDir, spec.file), sourceCode, 'utf8');

    if (spec.compile) {
      const compileName = `judge_compile_${crypto.randomBytes(8).toString('hex')}`;
      const compileResult = await runDocker({
        workDir,
        image: spec.image,
        command: spec.compile,
        readonly: false,
        memoryLimitMb,
        timeLimitMs: Math.max(timeLimitMs, 10000),
        name: compileName,
      });
      if (compileResult.timedOut || compileResult.code !== 0) {
        return {
          success: false,
          compileError: true,
          stdout: compileResult.stdout.slice(0, 12000),
          stderr: compileResult.stderr.slice(0, 12000),
          runtimeMs: compileResult.runtimeMs,
        };
      }
    }

    const runName = `judge_run_${crypto.randomBytes(8).toString('hex')}`;
    const runResult = await runDocker({
      workDir,
      image: spec.image,
      command: spec.run,
      input,
      readonly: true,
      memoryLimitMb,
      timeLimitMs,
      name: runName,
      measure: true,
    });

    return {
      success: true,
      timedOut: !!runResult.timedOut,
      exitCode: runResult.code,
      stdout: runResult.stdout.slice(0, 12000),
      stderr: runResult.stderr.slice(0, 12000),
      runtimeMs: Math.ceil(runResult.measuredRuntimeMs ?? runResult.runtimeMs),
      memoryMb: Number((runResult.measuredMemoryMb ?? 0).toFixed(2)),
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
};

module.exports = { runSubmission, normalizeOutput, runCode };