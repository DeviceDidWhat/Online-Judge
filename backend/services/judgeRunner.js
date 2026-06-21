const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Language = require('../models/language');
const TestCase = require('../models/testCase');

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

// Cap revealed test-case fields so a failing submission never stores/ships
// megabytes (e.g. a 1e5-element input) into the submission document.
const MAX_REVEAL_CHARS = 8000;
const truncateField = (value) => {
  const str = String(value ?? '');
  return str.length > MAX_REVEAL_CHARS
    ? `${str.slice(0, MAX_REVEAL_CHARS)}\n... (truncated)`
    : str;
};

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
  // Raise the stack ulimit (default 8 MB) so deep recursion — e.g. DFS over 1e5+
  // nodes — doesn't segfault. We cap it at the problem's memory budget so a
  // runaway recursion is bounded by the cgroup memory limit (counted as MLE)
  // rather than crashing with a misleading runtime error. Configurable via
  // JUDGE_STACK_LIMIT_MB; setting it to 'unlimited' uses -1 (bounded by memory).
  const stackEnv = process.env.JUDGE_STACK_LIMIT_MB;
  const stackLimit = stackEnv === 'unlimited'
    ? '-1'
    : String(Math.floor((Number(stackEnv) || memoryLimitMb) * 1024 * 1024));

  const args = [
    'run',
    '--name', name,
    '--network', 'none',
    '--cpus', process.env.JUDGE_DOCKER_CPUS || '1',
    '--memory', `${memoryLimitMb}m`,
    '--memory-swap', `${memoryLimitMb}m`,
    '--ulimit', `stack=${stackLimit}:${stackLimit}`,
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
  // Test cases are stored out-of-document; count up front, then stream them with a
  // cursor so only one case is held in memory at a time (large 1e5-sized inputs).
  const totalTestcases = await TestCase.countDocuments({ problem: problem._id });
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'judge-'));
  // mkdtemp creates the dir as 0700 (owner-only). The containers run with
  // --cap-drop ALL, so even their root user lacks CAP_DAC_OVERRIDE and is bound
  // by normal permission bits. Open the ephemeral workspace so the container's
  // UID can traverse it (read source, write the compiled binary).
  await fs.chmod(workDir, 0o777);

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
        return createCompileError(compileResult.stderr || compileResult.stdout || 'Compilation failed', totalTestcases);
      }
    }

    const testcaseResults = [];
    let maxRuntime = 0;
    let maxMemory = 0;

    const cursor = TestCase.find({ problem: problem._id }).sort({ order: 1 }).lean().cursor();
    try {
      let i = 0;
      for (let testcase = await cursor.next(); testcase != null; testcase = await cursor.next(), i += 1) {
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

        const isHidden = testcase.hidden !== false; // default to hidden if unset
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
          // Never reveal the program's output on a hidden test case.
          stdout: isHidden ? '' : runResult.stdout.slice(0, 4000),
          stderr: runResult.stderr.slice(0, 4000),
        };
        testcaseResults.push(result);

        if (verdict !== 'Accepted') {
          // Hidden test cases must never expose their input/expected/actual data,
          // regardless of the verdict (WA/TLE/MLE/RE). Only the index is shared.
          const failedTestcase = isHidden
            ? { index: i + 1, hidden: true }
            : {
                input: truncateField(testcase.input),
                expectedOutput: truncateField(testcase.expectedOutput),
                actualOutput: truncateField(actualOutput),
                index: i + 1,
                hidden: false,
              };

          return {
            verdict,
            runtime: maxRuntime,
            memory: maxMemory,
            testcasesPassed: i,
            totalTestcases,
            stdout: isHidden ? '' : runResult.stdout.slice(0, 12000),
            stderr: runResult.stderr.slice(0, 12000),
            testcaseResults,
            failedTestcase,
          };
        }
      }
    } finally {
      await cursor.close();
    }

    return {
      verdict: 'Accepted',
      runtime: maxRuntime,
      memory: maxMemory,
      testcasesPassed: totalTestcases,
      totalTestcases,
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
  // See runSubmission: open the workspace so the --cap-drop ALL container can
  // access the bind-mounted files despite the host-owned 0700 default.
  await fs.chmod(workDir, 0o777);
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