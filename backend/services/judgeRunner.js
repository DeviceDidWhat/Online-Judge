const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Language = require('../models/language');

const DEFAULT_DOCKER_IMAGES = {
  cpp: 'gcc:13',
  c: 'gcc:13',
  python: 'python:3.10-alpine',
  py: 'python:3.10-alpine',
  javascript: 'node:18-alpine',
  js: 'node:18-alpine',
  java: 'eclipse-temurin:17',
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

const parseMemoryMb = (value) => {
  const match = String(value || '').match(/([\d.]+)\s*(KiB|MiB|GiB|KB|MB|GB|B)/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'gib' || unit === 'gb') return amount * 1024;
  if (unit === 'mib' || unit === 'mb') return amount;
  if (unit === 'kib' || unit === 'kb') return amount / 1024;
  return amount / 1024 / 1024;
};

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

const execWithStats = (command, args, options = {}) => new Promise((resolve) => {
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
  let maxMemoryMb = 0;
  let statsTimer = null;

  const pollStats = async () => {
    if (!options.containerName) return;
    const stats = await execFile('docker', ['stats', options.containerName, '--no-stream', '--format', '{{.MemUsage}}'], { timeoutMs: 1000 });
    maxMemoryMb = Math.max(maxMemoryMb, parseMemoryMb(stats.stdout));
  };

  if (options.containerName) {
    statsTimer = setInterval(() => {
      pollStats().catch(() => {});
    }, 100);
  }

  const timer = options.timeoutMs ? setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, options.timeoutMs) : null;

  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', (error) => {
    if (timer) clearTimeout(timer);
    if (statsTimer) clearInterval(statsTimer);
    resolve({ code: null, signal: null, stdout, stderr: stderr || error.message, timedOut, runtimeMs: 0, memoryMb: maxMemoryMb });
  });
  child.on('close', async (code, signal) => {
    if (timer) clearTimeout(timer);
    if (statsTimer) clearInterval(statsTimer);
    await pollStats().catch(() => {});
    const runtimeMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    resolve({ code, signal, stdout, stderr, timedOut, runtimeMs, memoryMb: maxMemoryMb });
  });

  if (options.input) child.stdin.end(options.input);
  else child.stdin.end();
});

const dockerArgs = ({ workDir, image, command, input, readonly, memoryLimitMb, timeLimitMs, name }) => {
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

  args.push(image, 'sh', '-c', command);
  return { command: 'docker', args, timeoutMs: timeLimitMs + DOCKER_TIMEOUT_BUFFER_MS, input };
};

const runDocker = async (params) => {
  const execution = dockerArgs(params);
  try {
    const runResult = await execWithStats(execution.command, execution.args, {
      input: execution.input,
      timeoutMs: execution.timeoutMs,
      containerName: params.name,
    });

    let innerRuntimeMs = null;
    try {
      const inspectResult = await execFile(
        'docker',
        ['inspect', params.name, '--format', '{{.State.StartedAt}} {{.State.FinishedAt}}'],
        { timeoutMs: 2000 }
      );
      if (inspectResult.code === 0) {
        const [startedAtStr, finishedAtStr] = inspectResult.stdout.trim().split(' ');
        if (startedAtStr && finishedAtStr) {
          const start = new Date(startedAtStr).getTime();
          const end = new Date(finishedAtStr).getTime();
          if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
            innerRuntimeMs = end - start;
          }
        }
      }
    } catch (err) {
      // Ignore inspect failures, fallback to process-level runtimeMs
    }

    return {
      ...runResult,
      innerRuntimeMs,
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
      });

      const runtime = Math.ceil(runResult.innerRuntimeMs ?? runResult.runtimeMs);
      const memory = Number(runResult.memoryMb.toFixed(2));
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
    });

    return {
      success: true,
      timedOut: !!runResult.timedOut,
      exitCode: runResult.code,
      stdout: runResult.stdout.slice(0, 12000),
      stderr: runResult.stderr.slice(0, 12000),
      runtimeMs: Math.ceil(runResult.innerRuntimeMs ?? runResult.runtimeMs),
      memoryMb: runResult.memoryMb ?? 0,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
};

module.exports = { runSubmission, normalizeOutput, runCode };