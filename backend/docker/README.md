# Judge Docker images

These images add GNU `/usr/bin/time` on top of the standard language images so the
judge can measure a submission's **own** runtime and memory, excluding the
~100–300ms container/shell startup overhead that previously dominated the reported
time (making fast and slow solutions look identical, in the 100–300ms range).

## Build (run once, and after editing any Dockerfile)

Windows (PowerShell):

```powershell
pwsh backend/docker/build.ps1
```

macOS / Linux:

```bash
bash backend/docker/build.sh
```

## Images

| Language     | Tag                | Base                |
|--------------|--------------------|---------------------|
| C / C++      | `judge-gcc:13`     | `gcc:13`            |
| Python       | `judge-python:3.10`| `python:3.10-slim`  |
| JavaScript   | `judge-node:18`    | `node:18-slim`      |
| Java         | `judge-java:17`    | `judge-java:17` → `eclipse-temurin:17` |

The tags are the defaults in `DEFAULT_DOCKER_IMAGES` ([backend/services/judgeRunner.js](../services/judgeRunner.js)).
Override any of them without rebuilding by setting an env var, e.g.
`JUDGE_IMAGE_CPP=my-image:tag`.

## How timing works

The run command is wrapped as:

```
/usr/bin/time -f 'JUDGE_TIMING %e %U %S %M' sh -c '<run command>'
```

GNU time appends one line to stderr — `JUDGE_TIMING <wall_s> <user_s> <sys_s> <maxRSS_kb>`.
The judge parses it (wall → runtime, maxRSS → memory) and strips the line before
showing stderr to the user. If the line is missing (e.g. the process was killed on
timeout), the judge falls back to the wall-clock time of the `docker run` process
and the existing TLE/kill safety net still applies.

> Note: GNU time reports time at ~10ms (centisecond) resolution, so solutions that
> run in under ~10ms display as `0 ms`. This is expected and correct — sub-10ms is
> below what GNU time can resolve.
