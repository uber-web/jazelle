// @flow
const assert = require('assert');
const {tmpdir} = require('os');
const {readFileSync, createWriteStream} = require('fs');
const {runCLI} = require('../index');
const {init} = require('../commands/init.js');
const {scaffold} = require('../commands/scaffold.js');
const {install} = require('../commands/install.js');
const {add} = require('../commands/add.js');
const {upgrade} = require('../commands/upgrade.js');
const {remove} = require('../commands/remove.js');
const {ci} = require('../commands/ci.js');
const {purge} = require('../commands/purge.js');
const {yarn: yarnCmd} = require('../commands/yarn.js');
const {bump} = require('../commands/bump.js');
const {script} = require('../commands/script.js');
const {localize} = require('../commands/localize.js');
const {check} = require('../commands/check.js');
const {outdated} = require('../commands/outdated.js');

const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {batchTestGroup} = require('../utils/batch-test-group');
const bazelCmds = require('../utils/bazel-commands.js');
const {bazel, node, yarn} = require('../utils/binary-paths.js');
const {cli} = require('../utils/cli.js');
const {detectCyclicDeps} = require('../utils/detect-cyclic-deps.js');
const {
  exec,
  exists,
  read,
  write,
  ls,
  lstat,
  remove: rm,
} = require('../utils/node-helpers.js');
const {findChangedTargets} = require('../utils/find-changed-targets.js');
const {findLocalDependency} = require('../utils/find-local-dependency.js');
const {
  generateBazelBuildRules,
} = require('../utils/generate-bazel-build-rules.js');
const {generateBazelignore} = require('../utils/generate-bazelignore.js');
const {getDownstreams} = require('../utils/get-downstreams.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getLocalDependencies} = require('../utils/get-local-dependencies.js');
const {getRootDir} = require('../utils/get-root-dir.js');
const {getTestGroups} = require('../utils/get-test-groups.js');
const {groupByDepsets} = require('../utils/group-by-depsets.js');
const {isYarnResolution} = require('../utils/is-yarn-resolution.js');
const {parse, getPassThroughArgs} = require('../utils/parse-argv.js');

const {
  reportMismatchedTopLevelDeps,
} = require('../utils/report-mismatched-top-level-deps.js');
const {
  getCallArgItems,
  addCallArgItem,
  removeCallArgItem,
} = require('../utils/starlark.js');
const {shouldSync, getVersion} = require('../utils/version-onboarding.js');
const yarnCmds = require('../utils/yarn-commands.js');
const {sortPackageJson} = require('../utils/sort-package-json');

process.on('unhandledRejection', e => {
  console.error(e.stack);
  process.exit(1);
});

// $FlowFixMe flow can't handle statics of async function
remove.fork = false;

const tmp = tmpdir();

runTests();

async function t(test) {
  const match = (process.argv[2] || '').toLowerCase();
  if (test.name.toLowerCase().indexOf(match) > -1) {
    if (match) console.log(`Testing ${test.name}`);
    return test();
  }
}

async function runTests() {
  await exec(`rm -rf ${tmp}/tmp`);
  await exec(`mkdir -p ${tmp}/tmp`);
  await Promise.all([
    t(testRunCLI),
    t(testInit),
    t(testScaffold),
    t(testCi),
    t(testUpgrade),
    t(testPurge),
    t(testYarn),
    t(testBump),
    // t(testEach),
    t(testAssertProjectDir),
    t(testBinaryPaths),
    t(testCLI),
    t(testDetectCyclicDeps),
    t(testFindChangedTargets),
    t(testFindLocalDependency),
    t(testGenerateBazelignore),
    t(testGenerateBazelBuildRules),
    t(testGenerateBazelBuildRulesUpdate),
    t(testGetDownstreams),
    t(testGetManifest),
    t(testGetLocalDependencies),
    t(testGetRootDir),
    t(testGetTestGroups),
    t(testGroupByDepsets),
    t(testIsYarnResolution),
    t(testNodeHelpers),
    t(testParse),
    t(testGetPassThroughArgs),
    t(testReportMismatchedTopLevelDeps),
    t(testStarlark),
    t(testVersionOnboarding),
    t(testYarnCommands),
    t(testSortPackageJSON),
    t(testLocalize),
    t(testCheck),
    t(testOutdated),
  ]);

  // run separately to avoid CI error
  await t(testBazelDummy);
  await t(testBazelBuild);
  // await t(testInstallAddUpgradeRemove);
  await t(testBatchTestGroup);
  await t(testCommand);
  await t(testYarnCommand);
  await t(testBazelCommand);
  await t(testStartCommand);
  await t(testScriptCommand);
  await t(testBazelDependentBuilds);
  await t(testBazelDependentFailure);

  await exec(`rm -rf ${tmp}/tmp`);
  console.log('All tests pass');
}

// cli
async function testRunCLI() {
  const oldInitCwd = process.env.INIT_CWD;
  const path = `${tmp}/tmp/runCLI`;
  await exec(`mkdir ${path}`);
  await runCLI(['setup', `--cwd=${path}`]);
  assert.equal(process.env.INIT_CWD, path);
  process.env.INIT_CWD = oldInitCwd;
}

// commands
async function testInit() {
  await exec(`mkdir ${tmp}/tmp/init`);
  await init({cwd: `${tmp}/tmp/init`});
  assert(await exists(`${tmp}/tmp/init/WORKSPACE`));
  assert(await exists(`${tmp}/tmp/init/BUILD.bazel`));
  assert(await exists(`${tmp}/tmp/init/.bazelversion`));
  assert(await exists(`${tmp}/tmp/init/manifest.json`));
  assert(await exists(`${tmp}/tmp/init/.gitignore`));

  const workspace = await read(`${tmp}/tmp/init/WORKSPACE`, 'utf8');
  const jazelleVersion = require('../package.json').version;
  assert(workspace.includes(jazelleVersion));
}

async function testScaffold() {
  await exec(`cp -r ${__dirname}/fixtures/scaffold/ ${tmp}/tmp/scaffold`);
  const root = `${tmp}/tmp/scaffold`;
  const cwd = `${tmp}/tmp/scaffold`;
  const from = 'template';
  const to = 'foo';
  const name = '@foo/foo';
  await scaffold({root, cwd, from, to, name});

  assert(await exists(`${tmp}/tmp/scaffold/foo/BUILD.bazel`));
  assert(await exists(`${tmp}/tmp/scaffold/foo/package.json`));
  assert(await exists(`${tmp}/tmp/scaffold/foo/test.txt`));

  const buildFile = `${tmp}/tmp/scaffold/foo/BUILD.bazel`;
  const build = await read(buildFile, 'utf8');
  assert(build.includes('name = "foo"'));

  const metaFile = `${tmp}/tmp/scaffold/foo/package.json`;
  const meta = JSON.parse(await read(metaFile, 'utf8'));
  assert.equal(meta.name, '@foo/foo');

  const manifestFile = `${tmp}/tmp/scaffold/manifest.json`;
  const {projects} = JSON.parse(await read(manifestFile, 'utf8'));
  assert(projects === undefined);

  const rootMeta = `${tmp}/tmp/scaffold/package.json`;
  const {workspaces} = JSON.parse(await read(rootMeta, 'utf8'));
  assert(workspaces.includes('foo'));
}

// eslint-disable-next-line no-unused-vars
async function testInstallAddUpgradeRemove() {
  const buildFile = `${tmp}/tmp/commands/a/BUILD.bazel`;
  const meta = `${tmp}/tmp/commands/a/package.json`;

  // // install
  await exec(`cp -r ${__dirname}/fixtures/commands/ ${tmp}/tmp/commands`);

  const workspaceFile = `${tmp}/tmp/commands/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  await install({
    root: `${tmp}/tmp/commands`,
    cwd: `${tmp}/tmp/commands/a`,
  });
  const lockfile = `${tmp}/tmp/commands/yarn.lock`;
  assert(await exists(lockfile));

  // add linked package
  await add({
    root: `${tmp}/tmp/commands`,
    cwd: `${tmp}/tmp/commands/a`,
    args: ['b', 'c'],
  });
  assert((await read(buildFile, 'utf8')).includes('//b:b'));
  assert((await read(buildFile, 'utf8')).includes('//c:c'));

  // add external package
  await add({
    root: `${tmp}/tmp/commands`,
    cwd: `${tmp}/tmp/commands/a`,
    args: ['has@1.0.3'],
  });
  assert(JSON.parse(await read(meta, 'utf8')).dependencies.has);

  // upgrade linked package
  await upgrade({
    root: `${tmp}/tmp/commands`,
    args: ['c@0.0.0'],
  });
  assert((await read(buildFile, 'utf8')).includes('//c:c'));

  // upgrade external package
  await upgrade({
    root: `${tmp}/tmp/commands`,
    args: ['has@1.0.3'],
  });
  assert(JSON.parse(await read(meta, 'utf8')).dependencies.has);

  // remove linked package
  await remove({
    root: `${tmp}/tmp/commands`,
    cwd: `${tmp}/tmp/commands/a`,
    args: ['b', 'c'],
  });
  assert(!JSON.parse(await read(meta, 'utf8')).dependencies.b);
  assert(!JSON.parse(await read(meta, 'utf8')).dependencies.c);

  // remove external package
  await remove({
    root: `${tmp}/tmp/commands`,
    cwd: `${tmp}/tmp/commands/a`,
    args: ['has'],
  });
  assert(!JSON.parse(await read(meta, 'utf8')).dependencies.has);
}

async function testCi() {
  const cmd = `cp -r ${__dirname}/fixtures/ci/ ${tmp}/tmp/ci`;
  await exec(cmd);

  await ci({
    root: `${tmp}/tmp/ci`,
    cwd: `${tmp}/tmp/ci/b`,
  });
  assert(true); // did not throw
}

async function testUpgrade() {
  const meta = `${tmp}/tmp/upgrade/a/package.json`;
  const lockfile = `${tmp}/tmp/upgrade/yarn.lock`;
  const cmd = `cp -r ${__dirname}/fixtures/upgrade/ ${tmp}/tmp/upgrade`;
  await exec(cmd);

  await upgrade({
    root: `${tmp}/tmp/upgrade`,
    args: ['has@1.0.3'],
  });
  assert((await read(meta, 'utf8')).includes('"has": "1.0.3"'));
  assert((await read(lockfile, 'utf8')).includes('function-bind'));

  await upgrade({root: `${tmp}/tmp/upgrade`, args: ['b']});
  assert((await read(meta, 'utf8')).includes('"b": "1.0.0"'));
}

async function testPurge() {
  await exec(`cp -r ${__dirname}/fixtures/purge/ ${tmp}/tmp/purge`);
  await purge({root: `${tmp}/tmp/purge`, force: false});
  const nodeModules = `${tmp}/tmp/purge/a/node_modules`;
  const globalNodeModules = `${tmp}/tmp/purge/node_modules`;
  const temp = `${__dirname}/third_party/jazelle/temp`;
  assert(!(await exists(nodeModules)));
  assert(!(await exists(globalNodeModules)));
  assert(!(await exists(temp)));
}

async function testYarn() {
  await exec(`cp -r ${__dirname}/fixtures/yarn/ ${tmp}/tmp/yarn`);

  const streamFile = `${tmp}/tmp/yarn/stream.txt`;
  const stream = createWriteStream(streamFile);
  await new Promise(resolve => stream.on('open', resolve));
  await yarnCmd({
    cwd: `${tmp}/tmp/yarn`,
    args: ['--help'],
    stdio: ['ignore', stream, stream],
  }).catch(() => {});
  assert((await read(streamFile, 'utf8')).includes('Yarn Package Manager'));
}

// eslint-disable-next-line no-unused-vars
async function testEach() {
  await exec(`cp -r ${__dirname}/fixtures/each/ ${tmp}/tmp/each`);

  const root = `${tmp}/tmp/each`;

  const plan = [
    {type: 'dir', dir: 'a', action: 'exec', args: ['foo']},
    {type: 'dir', dir: 'a', action: 'exec', args: ['bash', '-c', 'echo $PWD']},
  ];
  const failed = /*:: await */ await batchTestGroup({
    root,
    data: [plan],
    index: 0,
    cores: 8,
  });
  assert.equal(failed.length, 1);
  assert(failed[0].stderr.includes('spawn foo ENOENT'));
}

async function testBump() {
  await exec(`cp -r ${__dirname}/fixtures/bump/ ${tmp}/tmp/bump`);

  const root = `${tmp}/tmp/bump`;
  const cwd = `${tmp}/tmp/bump/not-a-real-project`;

  const pkgMeta = `${tmp}/tmp/bump/not-a-real-project/package.json`;
  const depMeta = `${tmp}/tmp/bump/not-a-real-dep/package.json`;
  const downstreamMeta = `${tmp}/tmp/bump/not-a-real-downstream/package.json`;

  // do not update package.json files in CI
  // $FlowFixMe `assert` typedef is missing `rejects` method
  await assert.rejects(
    bump({root, cwd, type: 'preminor', frozenPackageJson: true})
  );
  assert(JSON.parse(await read(pkgMeta)).version, '0.0.0');
  assert(JSON.parse(await read(depMeta)).version, '0.0.0');

  await bump({root, cwd, type: 'preminor'});
  assert(JSON.parse(await read(pkgMeta)).version, '0.1.0-0');
  assert(JSON.parse(await read(depMeta)).version, '0.1.0-0');

  // command should be idempotent
  await bump({root, cwd, type: 'preminor'});
  assert(JSON.parse(await read(pkgMeta)).version, '0.1.0-0');
  assert(JSON.parse(await read(depMeta)).version, '0.1.0-0');

  // downstream is greenkept
  const meta = JSON.parse(await read(downstreamMeta));
  assert(meta.dependencies['not-a-real-project'], '0.1.0-0');
}

async function testScriptCommand() {
  await exec(`cp -r ${__dirname}/fixtures/script/ ${tmp}/tmp/script`);

  const workspaceFile = `${tmp}/tmp/script/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  const root = `${tmp}/tmp/script`;
  const cwd = `${tmp}/tmp/script/a`;

  const streamFile = `${tmp}/tmp/script/build-stream.txt`;
  const stream = createWriteStream(streamFile);
  await new Promise(resolve => stream.on('open', resolve));

  await install({root, cwd});

  await script({
    root,
    cwd,
    args: ['--cwd', '.', 'foo', 'hello world', 'foo'],
    stdio: ['ignore', stream, stream],
  });

  const lines = (await read(streamFile, 'utf8')).split('\n');
  assert(lines.includes('hello world'));
  assert(lines.includes('hello world foo'));
}

// utils
async function testAssertProjectDir() {
  const dir1 = `${__dirname}/fixtures/project-dir`;
  const t = () => true;
  const f = () => false;
  const result1 = await assertProjectDir({dir: dir1}).then(t, f);
  assert(result1);

  const dir2 = `${__dirname}/fixtures/not-project-dir`;
  const result2 = await assertProjectDir({dir: dir2}).then(f, t);
  assert(result2);
}

async function testBatchTestGroup() {
  const cmd = `cp -r ${__dirname}/fixtures/batch-test-group/ ${tmp}/tmp/batch-test-group`;
  await exec(cmd);

  const workspaceFile = `${tmp}/tmp/batch-test-group/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  const streamFile = `${tmp}/tmp/batch-test-group/stdout.txt`;
  const stream = createWriteStream(streamFile);
  await new Promise(resolve => stream.on('open', resolve));
  await install({
    root: `${tmp}/tmp/batch-test-group`,
    cwd: `${tmp}/tmp/batch-test-group/a`,
  });
  await install({
    root: `${tmp}/tmp/batch-test-group`,
    cwd: `${tmp}/tmp/batch-test-group/b`,
  });
  await install({
    root: `${tmp}/tmp/batch-test-group`,
    cwd: `${tmp}/tmp/batch-test-group/b`,
  });
  await batchTestGroup({
    root: `${tmp}/tmp/batch-test-group`,
    data: [
      [
        {type: 'bazel', dir: 'a', action: 'flow', args: []},
        {type: 'bazel', dir: 'a', action: 'lint', args: []},
        {type: 'bazel', dir: 'a', action: 'test', args: []},
      ],
      [
        {type: 'bazel', dir: 'b', action: 'lint', args: []},
        {type: 'bazel', dir: 'b', action: 'test', args: []},
        {type: 'bazel', dir: 'c', action: 'test', args: []},
      ],
    ],
    index: 0,
    cores: 8,
    stdio: ['ignore', stream, stream],
  });
  const output = await read(streamFile, 'utf8');
  assert(output.includes('Executing tests from //a:test'));
  assert(output.includes('Executing tests from //a:lint'));
  assert(output.includes('Executing tests from //a:flow'));
  assert(!output.includes('//b:test'));
  assert(!output.includes('//b:lint'));
  assert(!output.includes('//c:test'));
}

async function testBazelDummy() {
  await exec(`cp -r ${__dirname}/fixtures/bazel/ ${tmp}/tmp/bazel`);

  await bazelCmds.build({
    root: `${tmp}/tmp/bazel`,
    cwd: `${tmp}/tmp/bazel`,
    name: 'target',
  });
  const output = `${tmp}/tmp/bazel/bazel-bin/target.sh`;
  assert.equal(await read(output, 'utf8'), 'echo target');

  const testStreamFile = `${tmp}/tmp/bazel/test-stream.txt`;
  const testStream = createWriteStream(testStreamFile);
  await new Promise(resolve => testStream.on('open', resolve));
  await bazelCmds.test({
    root: `${tmp}/tmp/bazel`,
    cwd: `${tmp}/tmp/bazel`,
    args: [],
    name: 'target',
    stdio: ['ignore', testStream, 'ignore'],
  });
  const testMessage = 'Executing tests from //:target';
  assert((await read(testStreamFile, 'utf8')).includes(testMessage));

  const runStreamFile = `${tmp}/tmp/bazel/run-stream.txt`;
  const runStream = createWriteStream(runStreamFile);
  await new Promise(resolve => runStream.on('open', resolve));
  await bazelCmds.run({
    root: `${tmp}/tmp/bazel`,
    cwd: `${tmp}/tmp/bazel`,
    args: [],
    name: 'target',
    stdio: ['ignore', runStream, 'ignore'],
  });
  const runMessage = 'Executing tests from //:target';
  assert((await read(runStreamFile, 'utf8')).includes(runMessage));
}

async function testBazelBuild() {
  const cmd = `cp -r ${__dirname}/fixtures/bazel-rules/ ${tmp}/tmp/bazel-rules`;
  await exec(cmd);

  const workspaceFile = `${tmp}/tmp/bazel-rules/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  await install({
    root: `${tmp}/tmp/bazel-rules`,
    cwd: `${tmp}/tmp/bazel-rules/projects/a`,
  });

  // build
  await bazelCmds.build({
    root: `${tmp}/tmp/bazel-rules`,
    cwd: `${tmp}/tmp/bazel-rules/projects/a`,
    name: 'a',
  });
  const output = `${tmp}/tmp/bazel-rules/bazel-bin/projects/a/__jazelle__a.tgz`;
  assert(await exists(output));

  // test
  const testStreamFile = `${tmp}/tmp/bazel-rules/test-stream.txt`;
  const testStream = createWriteStream(testStreamFile);
  await new Promise(resolve => testStream.on('open', resolve));
  try {
    await bazelCmds.test({
      root: `${tmp}/tmp/bazel-rules`,
      cwd: `${tmp}/tmp/bazel-rules/projects/a`,
      args: [],
      name: 'test',
      stdio: ['ignore', testStream, testStream],
    });
  } catch (e) {
    console.log(await read(testStreamFile, 'utf8'));
    throw e;
  }
  assert((await read(testStreamFile, 'utf8')).includes('\nb\nv12.16.1'));

  const generated = `${tmp}/tmp/bazel-rules/projects/a/generated/foo.txt`;
  assert((await read(generated, 'utf8')).includes('hello'));

  // run
  const runStreamFile = `${tmp}/tmp/bazel-rules/run-stream.txt`;
  const runStream = createWriteStream(runStreamFile);
  await new Promise(resolve => runStream.on('open', resolve));
  await bazelCmds.run({
    root: `${tmp}/tmp/bazel-rules`,
    cwd: `${tmp}/tmp/bazel-rules/projects/a`,
    args: [],
    name: 'test',
    stdio: ['ignore', runStream, 'ignore'],
  });
  const runData = await read(runStreamFile, 'utf8');
  assert(runData.includes('\nb\nv12.16.1'));

  // lint
  const lintStreamFile = `${tmp}/tmp/bazel-rules/lint-stream.txt`;
  const lintStream = createWriteStream(lintStreamFile);
  await new Promise(resolve => lintStream.on('open', resolve));
  await bazelCmds.lint({
    root: `${tmp}/tmp/bazel-rules`,
    cwd: `${tmp}/tmp/bazel-rules/projects/a`,
    args: [],
    stdio: ['ignore', lintStream, 'ignore'],
  });
  const lintData = await read(lintStreamFile, 'utf8');
  assert(lintData.includes('\n111\n'));

  // flow
  const flowStreamFile = `${tmp}/tmp/bazel-rules/flow-stream.txt`;
  const flowStream = createWriteStream(flowStreamFile);
  await new Promise(resolve => flowStream.on('open', resolve));
  await bazelCmds.flow({
    root: `${tmp}/tmp/bazel-rules`,
    cwd: `${tmp}/tmp/bazel-rules/projects/a`,
    args: [],
    stdio: ['ignore', flowStream, flowStream],
  });
  const flowData = await read(flowStreamFile, 'utf8');
  assert(flowData.includes('a:flow'));

  // start
  const startStreamFile = `${tmp}/tmp/bazel-rules/start-stream.txt`;
  const startStream = createWriteStream(startStreamFile);
  await new Promise(resolve => startStream.on('open', resolve));
  await bazelCmds.start({
    root: `${tmp}/tmp/bazel-rules`,
    cwd: `${tmp}/tmp/bazel-rules/projects/a`,
    args: [],
    stdio: ['ignore', startStream, startStream],
  });
  const startData = await read(startStreamFile, 'utf8');
  assert(startData.includes('\n333\n'));
}

async function testBinaryPaths() {
  assert(await exists(bazel));
  assert(await exists(node));
  assert(await exists(yarn));
}

async function testCLI() {
  let called = '0';
  const cmds = {
    foo: [
      `Foo

      --bar [bar]     bar`,
      async ({bar}) => {
        called = bar;
      },
    ],
  };
  cli('foo', {bar: '1'}, cmds, async () => {});
  assert.equal(called, '1');
}

async function testDetectCyclicDeps() {
  const cycles = detectCyclicDeps({
    deps: [
      {
        dir: `${__dirname}/fixtures/detect-cyclic-deps/a`,
        meta: {
          name: 'a',
          version: '0.0.0',
          dependencies: {
            c: '0.0.0',
          },
        },
        lockfile: {},
        depth: 1,
      },
      {
        dir: `${__dirname}/fixtures/detect-cyclic-deps/b`,
        meta: {
          name: 'b',
          version: '0.0.0',
          dependencies: {
            a: '0.0.0',
          },
        },
        lockfile: {},
        depth: 2,
      },
      {
        dir: `${__dirname}/fixtures/detect-cyclic-deps/c`,
        meta: {
          name: 'c',
          version: '0.0.0',
          dependencies: {
            b: '0.0.0',
          },
        },
        lockfile: {},
        depth: 3,
      },
    ],
  });
  assert.equal(cycles.length, 1);

  const ok = detectCyclicDeps({
    deps: [
      {
        dir: `${__dirname}/fixtures/detect-cyclic-deps/a`,
        meta: {
          name: 'a',
          version: '0.0.0',
        },
        lockfile: {},
        depth: 1,
      },
      {
        dir: `${__dirname}/fixtures/detect-cyclic-deps/b`,
        meta: {
          name: 'b',
          version: '0.0.0',
          dependencies: {
            a: '0.0.0',
          },
        },
        lockfile: {},
        depth: 2,
      },
      {
        dir: `${__dirname}/fixtures/detect-cyclic-deps/c`,
        meta: {
          name: 'c',
          version: '0.0.0',
          dependencies: {
            b: '0.0.0',
          },
        },
        lockfile: {},
        depth: 3,
      },
    ],
  });
  assert.equal(ok.length, 0);
}

async function testFindChangedTargets() {
  {
    const root = `${__dirname}/fixtures/find-changed-targets/dirs`;
    const files = `${__dirname}/fixtures/find-changed-targets/dirs/changes.txt`;
    const dirs = await findChangedTargets({root, files, format: 'dirs'});
    assert.deepEqual(dirs, ['b', 'a']);
  }
  {
    const cmd = `cp -r ${__dirname}/fixtures/find-changed-targets/ ${tmp}/tmp/find-changed-targets`;
    await exec(cmd);

    const workspaceFile = `${tmp}/tmp/find-changed-targets/bazel/WORKSPACE`;
    const workspace = await read(workspaceFile, 'utf8');
    const replaced = workspace.replace(
      'path = "../../../.."',
      `path = "${__dirname}/.."`
    );
    await write(workspaceFile, replaced, 'utf8');

    const root = `${tmp}/tmp/find-changed-targets/bazel`;
    const files = `${tmp}/tmp/find-changed-targets/bazel/changes.txt`;
    await install({
      root: `${tmp}/tmp/find-changed-targets/bazel`,
      cwd: `${tmp}/tmp/find-changed-targets/bazel/a`,
    });
    await install({
      root: `${tmp}/tmp/find-changed-targets/bazel`,
      cwd: `${tmp}/tmp/find-changed-targets/bazel/b`,
    });
    await install({
      root: `${tmp}/tmp/find-changed-targets/bazel`,
      cwd: `${tmp}/tmp/find-changed-targets/bazel/c`,
    });
    const targets = await findChangedTargets({root, files, format: 'targets'});
    assert.deepEqual(targets, [
      '//b:test',
      '//b:lint',
      '//b:flow',
      '//a:test',
      '//a:lint',
      '//a:flow',
    ]);
  }
  {
    const root = `${__dirname}/fixtures/find-changed-targets/no-target`;
    const files = `${__dirname}/fixtures/find-changed-targets/no-target/changes.txt`;
    const dirs = await findChangedTargets({root, files, format: 'dirs'});
    assert.deepEqual(dirs, []);
  }
}

async function testFindLocalDependency() {
  const found = await findLocalDependency({
    root: `${__dirname}/fixtures/find-local-dependency`,
    name: 'a',
  });
  const meta = `${__dirname}/fixtures/find-local-dependency/a/package.json`;
  assert.deepEqual(found.meta, JSON.parse(await read(meta, 'utf8')));

  const notFound = await findLocalDependency({
    root: `${__dirname}/fixtures/find-local-dependency`,
    name: 'non-existent',
  });
  assert.deepEqual(notFound, undefined);
}

async function testGenerateBazelignore() {
  const cmd = `cp -r ${__dirname}/fixtures/generate-bazelignore/ ${tmp}/tmp/generate-bazelignore`;
  await exec(cmd);
  await generateBazelignore({
    root: `${tmp}/tmp/generate-bazelignore`,
    projects: ['a', 'b'],
  });
  const bazelignoreFile = `${tmp}/tmp/generate-bazelignore/.bazelignore`;
  const bazelignore = await read(bazelignoreFile, 'utf8');
  assert(bazelignore.includes('node_modules'));
  assert(bazelignore.includes('third_party/jazelle/temp'));
}

async function testGenerateBazelBuildRules() {
  const cmd = `cp -r ${__dirname}/fixtures/generate-bazel-build-rules/ ${tmp}/tmp/generate-bazel-build-rules`;
  await exec(cmd);
  await generateBazelBuildRules({
    root: `${tmp}/tmp/generate-bazel-build-rules`,
    deps: [
      {
        meta: JSON.parse(
          await read(
            `${tmp}/tmp/generate-bazel-build-rules/a/package.json`,
            'utf8'
          )
        ),
        dir: `${tmp}/tmp/generate-bazel-build-rules/a`,
        depth: 2,
      },
      {
        meta: JSON.parse(
          await read(
            `${tmp}/tmp/generate-bazel-build-rules/b/package.json`,
            'utf8'
          )
        ),
        dir: `${tmp}/tmp/generate-bazel-build-rules/b`,
        depth: 1,
      },
    ],
    projects: ['a', 'b', 'c', 'd'],
    dependencySyncRule: 'web_library',
  });
  const code = await read(
    `${tmp}/tmp/generate-bazel-build-rules/a/BUILD.bazel`,
    'utf8'
  );
  assert(code.includes('# name: a\n'));
  assert(code.includes('# path: a\n'));
  assert(code.includes('# label: //a:a\n'));
  assert(code.includes('# dependencies: //b:library\n'));
  const bBuild = `${tmp}/tmp/generate-bazel-build-rules/b/BUILD.bazel`;
  const cBuild = `${tmp}/tmp/generate-bazel-build-rules/c/BUILD.bazel`;
  const dBuild = `${tmp}/tmp/generate-bazel-build-rules/d/BUILD.bazel`;
  assert(await exists(bBuild));
  assert((await read(cBuild)).includes('# this file'));
  assert(!(await exists(dBuild)));
}

async function testGenerateBazelBuildRulesUpdate() {
  const cmd = `cp -r ${__dirname}/fixtures/generate-bazel-build-rules-update/ ${tmp}/tmp/generate-bazel-build-rules-update`;
  await exec(cmd);
  await generateBazelBuildRules({
    root: `${tmp}/tmp/generate-bazel-build-rules-update`,
    deps: [
      {
        meta: JSON.parse(
          await read(
            `${tmp}/tmp/generate-bazel-build-rules-update/a/package.json`,
            'utf8'
          )
        ),
        dir: `${tmp}/tmp/generate-bazel-build-rules-update/a`,
        depth: 2,
      },
      {
        meta: JSON.parse(
          await read(
            `${tmp}/tmp/generate-bazel-build-rules-update/b/package.json`,
            'utf8'
          )
        ),
        dir: `${tmp}/tmp/generate-bazel-build-rules-update/b`,
        depth: 1,
      },
    ],
    projects: ['a', 'b', 'c'],
    dependencySyncRule: 'custom_target_rule',
  });
  const aBuild = `${tmp}/tmp/generate-bazel-build-rules-update/a/BUILD.bazel`;
  const data = await read(aBuild);
  assert(data.includes('custom_target_rule'));
  assert(data.includes('//b:library'));
  assert(!data.includes('//c:c'));
  assert(data.includes('//external:external'));
}

async function testGetDownstreams() {
  const deps = [
    {
      dir: `${tmp}/tmp/get-downstreams/a`,
      meta: {
        name: 'a',
        version: '0.0.0',
        dependencies: {b: '0.0.0'}, // cyclical dep should not break test
      },
      depth: 3,
    },
    {
      dir: `${tmp}/tmp/get-downstreams/b`,
      meta: {
        name: 'b',
        version: '0.0.0',
        dependencies: {a: '0.0.0'},
      },
      depth: 2,
    },
    {
      dir: `${tmp}/tmp/get-downstreams/c`,
      meta: {
        name: 'c',
        version: '0.0.0',
        dependencies: {b: '0.0.0'},
      },
      depth: 1,
    },
  ];
  const downstreams = getDownstreams(deps, deps[0]);
  assert.deepEqual(downstreams, deps.slice(1));
}

async function testGetLocalDependencies() {
  const cmd = `cp -r ${__dirname}/fixtures/get-local-dependencies/ ${tmp}/tmp/get-local-dependencies`;
  await exec(cmd);
  const localDeps = await getLocalDependencies({
    dirs: [
      `${tmp}/tmp/get-local-dependencies/a`,
      `${tmp}/tmp/get-local-dependencies/b`,
      `${tmp}/tmp/get-local-dependencies/c`,
    ],
    target: `${tmp}/tmp/get-local-dependencies/a`,
  });
  assert.deepEqual(localDeps, [
    {
      meta: JSON.parse(
        await read(`${tmp}/tmp/get-local-dependencies/b/package.json`, 'utf8')
      ),
      dir: `${tmp}/tmp/get-local-dependencies/b`,
      depth: 2,
    },
    {
      meta: JSON.parse(
        await read(`${tmp}/tmp/get-local-dependencies/a/package.json`, 'utf8')
      ),
      dir: `${tmp}/tmp/get-local-dependencies/a`,
      depth: 1,
    },
  ]);
}

async function testGetManifest() {
  assert.deepEqual(
    await getManifest({root: `${__dirname}/fixtures/get-all-project-paths`}),
    {
      projects: ['path/to/a', 'path/to/b'],
      workspace: 'host',
      dependencySyncRule: 'web_library',
    }
  );
}

async function testGetRootDir() {
  const dir = `${__dirname}/fixtures/get-root-dir/a`;
  const t = () => true;
  const f = () => false;
  const result = await getRootDir({dir}).then(t, f);
  assert(result);
}

async function testGetTestGroups() {
  const cmd = `cp -r ${__dirname}/fixtures/get-test-groups/ ${tmp}/tmp/get-test-groups`;
  await exec(cmd);

  const bazelByTwo = await getTestGroups({
    root: `${tmp}/tmp/get-test-groups`,
    data: [
      `//a:test`,
      `//a:lint`,
      `//a:flow`,
      `//b:test`,
      `//b:lint`,
      `//c:test`,
    ],
    nodes: 2,
  });
  assert.deepEqual(bazelByTwo, [
    [
      {type: 'bazel', dir: 'a', action: 'test', args: []},
      {type: 'bazel', dir: 'a', action: 'lint', args: []},
      {type: 'bazel', dir: 'a', action: 'flow', args: []},
    ],
    [
      {type: 'bazel', dir: 'b', action: 'test', args: []},
      {type: 'bazel', dir: 'b', action: 'lint', args: []},
      {type: 'bazel', dir: 'c', action: 'test', args: []},
    ],
  ]);

  const bazelByFour = await getTestGroups({
    root: `${tmp}/tmp/get-test-groups`,
    data: [
      `//a:test`,
      `//a:lint`,
      `//a:flow`,
      `//b:test`,
      `//b:lint`,
      `//c:test`,
    ],
    nodes: 4,
  });
  assert.deepEqual(bazelByFour, [
    [
      {type: 'bazel', dir: 'a', action: 'lint', args: []},
      {type: 'bazel', dir: 'a', action: 'flow', args: []},
    ],
    [{type: 'bazel', dir: 'a', action: 'test', args: []}],
    [
      {type: 'bazel', dir: 'b', action: 'test', args: []},
      {type: 'bazel', dir: 'b', action: 'lint', args: []},
    ],
    [{type: 'bazel', dir: 'c', action: 'test', args: []}],
  ]);

  const bazelByEight = await getTestGroups({
    root: `${tmp}/tmp/get-test-groups`,
    data: [
      `//a:test`,
      `//a:lint`,
      `//a:flow`,
      `//b:test`,
      `//b:lint`,
      `//c:test`,
    ],
    nodes: 8,
  });
  assert.deepEqual(bazelByEight, [
    [{type: 'bazel', dir: 'a', action: 'flow', args: []}],
    [{type: 'bazel', dir: 'a', action: 'lint', args: []}],
    [{type: 'bazel', dir: 'a', action: 'test', args: []}],
    [{type: 'bazel', dir: 'b', action: 'lint', args: []}],
    [{type: 'bazel', dir: 'b', action: 'test', args: []}],
    [{type: 'bazel', dir: 'c', action: 'test', args: []}],
  ]);

  const dirByTwo = await getTestGroups({
    root: `${tmp}/tmp/get-test-groups`,
    data: [`a`, 'b', 'c'],
    nodes: 2,
  });
  assert.deepEqual(dirByTwo, [
    [
      {type: 'dir', dir: 'a', action: 'test', args: []},
      {type: 'dir', dir: 'a', action: 'lint', args: []},
      {type: 'dir', dir: 'a', action: 'flow', args: []},
    ],
    [
      {type: 'dir', dir: 'b', action: 'test', args: []},
      {type: 'dir', dir: 'b', action: 'lint', args: []},
      {type: 'dir', dir: 'c', action: 'test', args: []},
    ],
  ]);

  const dirByFour = await getTestGroups({
    root: `${tmp}/tmp/get-test-groups`,
    data: [`a`, 'b', 'c'],
    nodes: 4,
  });
  assert.deepEqual(dirByFour, [
    [
      {type: 'dir', dir: 'a', action: 'lint', args: []},
      {type: 'dir', dir: 'a', action: 'flow', args: []},
    ],
    [{type: 'dir', dir: 'a', action: 'test', args: []}],
    [
      {type: 'dir', dir: 'b', action: 'test', args: []},
      {type: 'dir', dir: 'b', action: 'lint', args: []},
    ],
    [{type: 'dir', dir: 'c', action: 'test', args: []}],
  ]);
}

async function testGroupByDepsets() {
  const cmd = `cp -r ${__dirname}/fixtures/group-by-depsets/ ${tmp}/tmp/group-by-depsets`;
  await exec(cmd);

  const root = `${tmp}/tmp/group-by-depsets`;
  const aMeta = JSON.parse(await read(`${root}/a/package.json`, 'utf8'));
  const bMeta = JSON.parse(await read(`${root}/b/package.json`, 'utf8'));
  const cMeta = JSON.parse(await read(`${root}/c/package.json`, 'utf8'));
  const metas = [
    {dir: `${root}/a`, depth: 0, meta: aMeta},
    {dir: `${root}/b`, depth: 0, meta: bMeta},
    {dir: `${root}/c`, depth: 0, meta: cMeta},
  ];
  const group = [
    {type: 'bazel', dir: 'a', action: 'test', args: []},
    {type: 'bazel', dir: 'a', action: 'lint', args: []},
    {type: 'bazel', dir: 'a', action: 'flow', args: []},
    {type: 'bazel', dir: 'b', action: 'test', args: []},
    {type: 'bazel', dir: 'b', action: 'lint', args: []},
    {type: 'bazel', dir: 'b', action: 'flow', args: []},
    {type: 'bazel', dir: 'c', action: 'test', args: []},
    {type: 'bazel', dir: 'c', action: 'lint', args: []},
    {type: 'bazel', dir: 'c', action: 'flow', args: []},
  ];
  assert.deepEqual(groupByDepsets({root, metas, group}), [
    [
      {type: 'bazel', dir: 'a', action: 'test', args: []},
      {type: 'bazel', dir: 'a', action: 'lint', args: []},
      {type: 'bazel', dir: 'a', action: 'flow', args: []},
      {type: 'bazel', dir: 'b', action: 'test', args: []},
      {type: 'bazel', dir: 'b', action: 'lint', args: []},
      {type: 'bazel', dir: 'b', action: 'flow', args: []},
    ],
    [
      {type: 'bazel', dir: 'c', action: 'test', args: []},
      {type: 'bazel', dir: 'c', action: 'lint', args: []},
      {type: 'bazel', dir: 'c', action: 'flow', args: []},
    ],
  ]);
}

async function testIsYarnResolution() {
  const exact = isYarnResolution({
    meta: {resolutions: {a: '0.0.0'}, name: '', version: ''},
    name: 'a',
  });
  assert.equal(exact, true);

  const namespaced = isYarnResolution({
    meta: {resolutions: {'@a/b': '0.0.0'}, name: '', version: ''},
    name: '@a/b',
  });
  assert.equal(namespaced, true);

  const globbed = isYarnResolution({
    meta: {resolutions: {'**/a': '0.0.0'}, name: '', version: ''},
    name: 'a',
  });
  assert.equal(globbed, true);

  const globbedNs = isYarnResolution({
    meta: {resolutions: {'**/@a/b': '0.0.0'}, name: '', version: ''},
    name: '@a/b',
  });
  assert.equal(globbedNs, true);

  const direct = isYarnResolution({
    meta: {resolutions: {'a/b': '0.0.0'}, name: '', version: ''},
    name: 'b',
  });
  assert.equal(direct, true);

  const directNs = isYarnResolution({
    meta: {resolutions: {'a/@b/c': '0.0.0'}, name: '', version: ''},
    name: '@b/c',
  });
  assert.equal(directNs, true);

  const directOfNs = isYarnResolution({
    meta: {resolutions: {'@a/b/c': '0.0.0'}, name: '', version: ''},
    name: 'c',
  });
  assert.equal(directOfNs, true);

  const directNsOfNs = isYarnResolution({
    meta: {resolutions: {'@a/b/@c/d': '0.0.0'}, name: '', version: ''},
    name: '@c/d',
  });
  assert.equal(directNsOfNs, true);

  const transitive = isYarnResolution({
    meta: {resolutions: {'a/**/b': '0.0.0'}, name: '', version: ''},
    name: 'b',
  });
  assert.equal(transitive, true);

  const transitiveNs = isYarnResolution({
    meta: {resolutions: {'a/**/@b/c': '0.0.0'}, name: '', version: ''},
    name: '@b/c',
  });
  assert.equal(transitiveNs, true);

  const transitiveOfNs = isYarnResolution({
    meta: {resolutions: {'@a/b/**/c': '0.0.0'}, name: '', version: ''},
    name: 'c',
  });
  assert.equal(transitiveOfNs, true);

  const transitiveNsOfNs = isYarnResolution({
    meta: {resolutions: {'@a/b/**/@c/d': '0.0.0'}, name: '', version: ''},
    name: '@c/d',
  });
  assert.equal(transitiveNsOfNs, true);

  const nested = isYarnResolution({
    meta: {resolutions: {'a/b/c': '0.0.0'}, name: '', version: ''},
    name: 'c',
  });
  assert.equal(nested, true);

  const nestedOfNs = isYarnResolution({
    meta: {resolutions: {'a/@b/c/d': '0.0.0'}, name: '', version: ''},
    name: 'd',
  });
  assert.equal(nestedOfNs, true);

  const positional = isYarnResolution({
    meta: {resolutions: {'a/b': '0.0.0'}, name: '', version: ''},
    name: 'a',
  });
  assert.equal(positional, false);

  const positionalNs = isYarnResolution({
    meta: {resolutions: {'@a/a/b': '0.0.0'}, name: '', version: ''},
    name: 'a',
  });
  assert.equal(positionalNs, false);
}

async function testNodeHelpers() {
  const cmd = `cp -r ${__dirname}/fixtures/node-helpers/ ${tmp}/tmp/node-helpers`;
  await exec(cmd);

  assert.equal(await exec('echo abc'), 'abc\n');

  assert(await exists(__filename));

  const files = await ls(`${__dirname}/fixtures/node-helpers`);
  assert.deepEqual(files, ['file.txt']);

  const file = `${tmp}/tmp/node-helpers/file.txt`;
  await write(file, 'hello', 'utf8');

  const text = readFileSync(file, 'utf8');
  assert.equal(await read(file, 'utf8'), text);
  assert.equal(text, 'hello');

  const stats = await lstat(`${tmp}/tmp/node-helpers/file.txt`);
  assert.equal(stats.isFile(), true);

  await exec(`mkdir -p ${tmp}/tmp/node-helpers-remove/a/b`);
  await rm(`${tmp}/tmp/node-helpers-remove`);
  assert(!(await exists(`${tmp}/tmp/node-helpers-remove`)));
}

async function testParse() {
  assert.deepEqual(parse(['hello', '--foo', '111', '--bar=222', '--baz']), {
    name: 'hello',
    foo: '111',
    bar: '222',
    baz: true,
  });
}

async function testGetPassThroughArgs() {
  const args = getPassThroughArgs(['--cwd', '/foo', '--a', '--b', 'b', 'c']);
  assert.deepEqual(args, ['--a', '--b', 'b', 'c']);
}

async function testReportMismatchedTopLevelDeps() {
  const cmd = `cp -r ${__dirname}/fixtures/report-mismatched-top-level-deps/ ${tmp}/tmp/report-mismatched-top-level-deps`;
  await exec(cmd);

  const withoutLockstep = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: false,
      exceptions: ['no-bugs', '@uber/mismatched'],
    },
  });
  assert.deepEqual(withoutLockstep, {
    valid: false,
    policy: {lockstep: false, exceptions: ['no-bugs', '@uber/mismatched']},
    reported: {
      'no-bugs': {
        '^1.0.0': ['@uber/a', '@uber/b'],
        'npm:function-bind': ['@uber/c'],
      },
      '@uber/mismatched': {'^2.0.0': ['@uber/b'], '^1.0.0': ['@uber/a']},
    },
  });

  const withoutPartialLockstep = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: false,
      exceptions: ['@uber/mismatched'],
    },
  });
  assert.deepEqual(withoutPartialLockstep, {
    valid: false,
    policy: {lockstep: false, exceptions: ['@uber/mismatched']},
    reported: {
      '@uber/mismatched': {'^2.0.0': ['@uber/b'], '^1.0.0': ['@uber/a']},
    },
  });

  const withLockstep = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: true,
      exceptions: ['no-bugs'],
    },
  });
  assert.deepEqual(withLockstep, {
    valid: false,
    policy: {lockstep: true, exceptions: ['no-bugs']},
    reported: {
      '@uber/mismatched': {'^2.0.0': ['@uber/b'], '^1.0.0': ['@uber/a']},
    },
  });

  const withAllExceptions = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: true,
      exceptions: ['no-bugs', '@uber/mismatched'],
    },
  });
  assert.deepEqual(withAllExceptions, {
    valid: true,
    policy: {lockstep: true, exceptions: ['no-bugs', '@uber/mismatched']},
    reported: {},
  });

  const withVersionedExceptions = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: false,
      exceptions: [{name: '@uber/mismatched', versions: ['^1.0.0']}],
    },
  });
  assert.deepEqual(withVersionedExceptions, {
    valid: false,
    policy: {
      lockstep: false,
      exceptions: [{name: '@uber/mismatched', versions: ['^1.0.0']}],
    },
    reported: {'@uber/mismatched': {'^2.0.0': ['@uber/b']}},
  });

  const withAllVersionedExceptions = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: false,
      exceptions: [{name: '@uber/mismatched', versions: ['^1.0.0', '^2.0.0']}],
    },
  });
  assert.deepEqual(withAllVersionedExceptions, {
    valid: true,
    policy: {
      lockstep: false,
      exceptions: [{name: '@uber/mismatched', versions: ['^1.0.0', '^2.0.0']}],
    },
    reported: {},
  });

  const withLockstepVersionedExceptions = await reportMismatchedTopLevelDeps({
    root: `${tmp}/tmp/report-mismatched-top-level-deps`,
    projects: ['packages/a', 'packages/b', 'packages/c'],
    versionPolicy: {
      lockstep: true,
      exceptions: ['no-bugs', {name: '@uber/mismatched', versions: ['^1.0.0']}],
    },
  });
  assert.deepEqual(withLockstepVersionedExceptions, {
    valid: false,
    policy: {
      lockstep: true,
      exceptions: ['no-bugs', {name: '@uber/mismatched', versions: ['^1.0.0']}],
    },
    reported: {'@uber/mismatched': {'^2.0.0': ['@uber/b']}},
  });

  const withLockstepAllVersionedExceptions = await reportMismatchedTopLevelDeps(
    {
      root: `${tmp}/tmp/report-mismatched-top-level-deps`,
      projects: ['packages/a', 'packages/b', 'packages/c'],
      versionPolicy: {
        lockstep: true,
        exceptions: [
          'no-bugs',
          {name: '@uber/mismatched', versions: ['^1.0.0', '^2.0.0']},
        ],
      },
    }
  );
  assert.deepEqual(withLockstepAllVersionedExceptions, {
    valid: true,
    policy: {
      lockstep: true,
      exceptions: [
        'no-bugs',
        {name: '@uber/mismatched', versions: ['^1.0.0', '^2.0.0']},
      ],
    },
    reported: {},
  });
}

async function testStarlark() {
  await exec(`cp -r ${__dirname}/fixtures/starlark/ ${tmp}/tmp/starlark`);
  {
    const buildFile = `${tmp}/tmp/starlark/indented/BUILD.bazel`;
    const indented = await read(buildFile, 'utf8');
    assert.deepEqual(getCallArgItems(indented, 'web_library', 'deps'), [
      '"//a:a"',
      '"//b:b"',
    ]);

    const added = addCallArgItem(indented, 'web_library', 'deps', '"//c:c"');
    const expected = `
web_library(
  name = "foo",
  deps = [
    "//a:a",
    "//b:b",
    "//c:c",
  ]
)`;
    assert.equal(added.trim(), expected.trim());

    const removed = removeCallArgItem(added, 'web_library', 'deps', '"//b:b"');
    const reset = `
web_library(
  name = "foo",
  deps = [
    "//a:a",
    "//c:c",
  ]
)`;
    assert.equal(removed.trim(), reset.trim());
  }

  {
    const buildFile = `${tmp}/tmp/starlark/inline/BUILD.bazel`;
    const inline = await read(buildFile, 'utf8');
    const added = addCallArgItem(inline, 'web_library', 'deps', '"//c:c"');
    const expected = `
web_library(
  name = "foo",
  deps = ["//a:a", "//b:b", "//c:c"]
)`;
    assert.equal(added.trim(), expected.trim());
  }
  {
    const buildFile = `${tmp}/tmp/starlark/comments/BUILD.bazel`;
    const commented = await read(buildFile, 'utf8');
    const added = addCallArgItem(commented, 'web_library', 'deps', '"//c:c"');
    const trimmed = added
      .split('\n')
      .map(l => l.replace(/\s+$/, ''))
      .join('\n');
    const expected = `
web_library(    # comment
  name = "foo", # comment
  deps = [
    "//a:a",
    "//b:b",
    "//c:c",
  ]             # comment
)               # comment`;
    assert.equal(trimmed.trim(), expected.trim());

    const removed = removeCallArgItem(added, 'web_library', 'deps', '"//b:b"');
    const clean = removed
      .split('\n')
      .map(l => l.replace(/\s+$/, ''))
      .join('\n');
    const reset = `
web_library(    # comment
  name = "foo", # comment
  deps = [
    "//a:a",
    "//c:c",
  ]             # comment
)               # comment`;
    assert.equal(clean.trim(), reset.trim());
  }
}

async function testVersionOnboarding() {
  {
    const versionPolicy = {
      lockstep: true,
      exceptions: ['foo'],
    };
    const name = 'foo';
    assert(!shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: false,
      exceptions: ['foo'],
    };
    const name = 'foo';
    assert(shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: true,
      exceptions: ['foo'],
    };
    const name = 'bar';
    assert(shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: false,
      exceptions: ['foo'],
    };
    const name = 'bar';
    assert(!shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: true,
      exceptions: [
        {
          name: 'foo',
          versions: ['^1.0.0'],
        },
      ],
    };
    const name = 'foo';
    assert(shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: false,
      exceptions: [
        {
          name: 'foo',
          versions: ['^1.0.0'],
        },
      ],
    };
    const name = 'foo';
    assert(shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: true,
      exceptions: [
        {
          name: 'foo',
          versions: ['^1.0.0'],
        },
      ],
    };
    const name = 'bar';
    assert(shouldSync({versionPolicy, name}));
  }
  {
    const versionPolicy = {
      lockstep: false,
      exceptions: [
        {
          name: 'foo',
          versions: ['^1.0.0'],
        },
      ],
    };
    const name = 'bar';
    assert(!shouldSync({versionPolicy, name}));
  }
  {
    const name = 'foo';
    const deps = [
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: '^1.0.0',
          },
        },
        depth: 0,
      },
    ];
    assert.equal(getVersion({name, deps}), '^1.0.0');
  }
  {
    const name = 'foo';
    const deps = [
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: '~1.0.0',
          },
        },
        depth: 0,
      },
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: '^2.0.0',
          },
        },
        depth: 0,
      },
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: 'x.1.0',
          },
        },
        depth: 0,
      },
    ];
    assert.equal(getVersion({name, deps}), '^2.0.0');
  }
  {
    const name = 'foo';
    const deps = [
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: '~1.0.0',
          },
        },
        depth: 0,
      },
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: 'npm:foo@3',
          },
        },
        depth: 0,
      },
    ];
    assert.equal(getVersion({name, deps}), '~1.0.0');
  }
  {
    const name = 'foo';
    const deps = [
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          dependencies: {
            foo: '~1.0.0',
          },
        },
        depth: 0,
      },
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          devDependencies: {
            foo: '^2.0.0',
          },
        },
        depth: 0,
      },
      {
        dir: '',
        meta: {
          name: '',
          version: '',
          resolutions: {
            foo: '^3.1.0',
          },
        },
        depth: 0,
      },
    ];
    assert.equal(getVersion({name, deps}), '^2.0.0'); // do not use 'resolutions' version
  }
}

async function testYarnCommands() {
  const cmd = `cp -r ${__dirname}/fixtures/yarn-commands ${tmp}/tmp/yarn-commands`;
  await exec(cmd);
  const deps = [
    {
      dir: `${tmp}/tmp/yarn-commands/a`,
      meta: JSON.parse(
        await read(`${tmp}/tmp/yarn-commands/a/package.json`, 'utf8')
      ),
      depth: 1,
    },
  ];
  const root = `${tmp}/tmp/yarn-commands`;

  await install({root, cwd: `${root}/a`});

  // build
  const buildStreamFile = `${tmp}/tmp/yarn-commands/build-stream.txt`;
  const buildStream = createWriteStream(buildStreamFile);
  await new Promise(resolve => buildStream.on('open', resolve));
  await yarnCmds.build({
    root,
    deps,
    stdio: ['ignore', buildStream, 'ignore'],
  });
  // build twice to check that it cached
  await yarnCmds.build({
    root,
    deps,
    stdio: ['ignore', buildStream, 'ignore'],
  });
  assert.equal(await read(buildStreamFile, 'utf8'), '111\n');

  // dev
  const devStreamFile = `${tmp}/tmp/yarn-commands/dev-stream.txt`;
  const devStream = createWriteStream(devStreamFile);
  await new Promise(resolve => devStream.on('open', resolve));
  await yarnCmds.dev({
    root,
    deps,
    args: [],
    stdio: ['ignore', devStream, 'ignore'],
  });
  assert.equal(await read(devStreamFile, 'utf8'), '333\n');

  // test
  const testStreamFile = `${tmp}/tmp/yarn-commands/test-stream.txt`;
  const testStream = createWriteStream(testStreamFile);
  await new Promise(resolve => testStream.on('open', resolve));
  await yarnCmds.test({
    root,
    deps,
    args: [],
    stdio: ['ignore', testStream, 'ignore'],
  });
  assert.equal(await read(testStreamFile, 'utf8'), '444\n');

  // lint
  const lintStreamFile = `${tmp}/tmp/yarn-commands/lint-stream.txt`;
  const lintStream = createWriteStream(lintStreamFile);
  await new Promise(resolve => lintStream.on('open', resolve));
  await yarnCmds.lint({
    root,
    deps,
    args: [],
    stdio: ['ignore', lintStream, 'ignore'],
  });
  assert.equal(await read(lintStreamFile, 'utf8'), '555\n');

  // flow
  const flowStreamFile = `${tmp}/tmp/yarn-commands/flow-stream.txt`;
  const flowStream = createWriteStream(flowStreamFile);
  await new Promise(resolve => flowStream.on('open', resolve));
  await yarnCmds.flow({
    root,
    deps,
    args: [],
    stdio: ['ignore', flowStream, 'ignore'],
  });
  assert.equal(await read(flowStreamFile, 'utf8'), '666\n');

  // start
  const startStreamFile = `${tmp}/tmp/yarn-commands/start-stream.txt`;
  const startStream = createWriteStream(startStreamFile);
  await new Promise(resolve => startStream.on('open', resolve));
  await yarnCmds.start({
    root,
    deps,
    args: [],
    stdio: ['ignore', startStream, 'ignore'],
  });
  assert.equal(await read(startStreamFile, 'utf8'), '777\n');
}

async function testCommand() {
  const cmd = `cp -r ${__dirname}/fixtures/bin ${tmp}/tmp/bin`;
  await exec(cmd);

  const cwd = `${tmp}/tmp/bin`;
  const jazelle = `${__dirname}/../bin/bootstrap.sh`;

  const streamFile = `${tmp}/tmp/bin/stream.txt`;
  const stream = createWriteStream(streamFile);
  await new Promise(resolve => stream.on('open', resolve));
  await exec(`${jazelle}`, {cwd}, [stream, stream]);
  assert((await read(streamFile, 'utf8')).includes('Usage: jazelle [command]'));
}

async function testYarnCommand() {
  const cmd = `cp -r ${__dirname}/fixtures/bin ${tmp}/tmp/bin`;
  await exec(cmd);

  const cwd = `${tmp}/tmp/bin`;
  const jazelle = `${__dirname}/../bin/bootstrap.sh`;

  const yarnStreamFile = `${tmp}/tmp/bin/yarn-stream.txt`;
  const yarnStream = createWriteStream(yarnStreamFile);
  await new Promise(resolve => yarnStream.on('open', resolve));
  await exec(`${jazelle} yarn --version --cwd a`, {cwd}, [yarnStream]);
  assert((await read(yarnStreamFile, 'utf8')).includes('.'));

  const cwdStreamFile = `${tmp}/tmp/bin/cwd-stream.txt`;
  const cwdStream = createWriteStream(cwdStreamFile);
  await new Promise(resolve => cwdStream.on('open', resolve));
  await exec(`${jazelle} yarn --version`, {cwd: `${cwd}/a`}, [cwdStream]);
  assert((await read(cwdStreamFile, 'utf8')).includes('.'));
}

async function testBazelCommand() {
  const cmd = `cp -r ${__dirname}/fixtures/bin ${tmp}/tmp/bin`;
  await exec(cmd);

  const cwd = `${tmp}/tmp/bin`;
  const jazelle = `${__dirname}/../bin/bootstrap.sh`;

  const bazelStreamFile = `${tmp}/tmp/bin/bazel-stream.txt`;
  const bazelStream = createWriteStream(bazelStreamFile);
  await new Promise(resolve => bazelStream.on('open', resolve));
  await exec(`${jazelle} bazel version`, {cwd}, [bazelStream]);
  assert((await read(bazelStreamFile, 'utf8')).includes('Build label:'));
}

async function testStartCommand() {
  const cmd = `cp -r ${__dirname}/fixtures/bin ${tmp}/tmp/bin`;
  await exec(cmd);

  const workspaceFile = `${tmp}/tmp/bin/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  const cwd = `${tmp}/tmp/bin`;
  const jazelle = `${__dirname}/../bin/bootstrap.sh`;

  const startStreamFile = `${tmp}/tmp/bin/start-stream.txt`;
  const startStream = createWriteStream(startStreamFile);
  await new Promise(resolve => startStream.on('open', resolve));

  await install({root: cwd, cwd: `${cwd}/a`});

  await exec(`${jazelle} start`, {cwd: `${cwd}/a`}, [startStream]);
  assert((await read(startStreamFile, 'utf8')).includes('\nstart\n'));
}

async function testBazelDependentBuilds() {
  const cmd = `cp -r ${__dirname}/fixtures/bazel-dependent-builds ${tmp}/tmp/bazel-dependent-builds`;
  await exec(cmd);

  const workspaceFile = `${tmp}/tmp/bazel-dependent-builds/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  const cwd = `${tmp}/tmp/bazel-dependent-builds`;
  const jazelle = `${__dirname}/../bin/bootstrap.sh`;

  const startStreamFile = `${tmp}/tmp/bazel-dependent-builds/start-stream.txt`;
  const startStream = createWriteStream(startStreamFile);
  await new Promise(resolve => startStream.on('open', resolve));

  const a = `${cwd}/a/package.json`;
  const b = `${cwd}/b/package.json`;
  const c = `${cwd}/c/package.json`;
  assert((await read(c)).includes('module.exports = 222'));
  assert((await read(b)).includes('module.exports = 111'));
  assert((await read(a)).includes('require(\\"b\\") + require(\\"c\\")'));

  await install({root: cwd, cwd: `${cwd}/a`});

  await exec(`${jazelle} start`, {cwd: `${cwd}/a`}, [startStream]);
  assert.equal(await read(startStreamFile, 'utf8'), '333\n');
  assert(await exists(`${cwd}/a/foo/foo.js`));
  assert(await exists(`${cwd}/b/compiled/foo.js`));
  assert(await exists(`${cwd}/c/dist/foo.js`));
}

async function testBazelDependentFailure() {
  const cmd = `cp -r ${__dirname}/fixtures/bazel-dependent-failure ${tmp}/tmp/bazel-dependent-failure`;
  await exec(cmd);

  const workspaceFile = `${tmp}/tmp/bazel-dependent-failure/WORKSPACE`;
  const workspace = await read(workspaceFile, 'utf8');
  const replaced = workspace.replace(
    'path = "../../.."',
    `path = "${__dirname}/.."`
  );
  await write(workspaceFile, replaced, 'utf8');

  const cwd = `${tmp}/tmp/bazel-dependent-failure`;
  const jazelle = `${__dirname}/../bin/bootstrap.sh`;

  const startStreamFile = `${tmp}/tmp/bazel-dependent-failure/start-stream.txt`;
  const startStream = createWriteStream(startStreamFile);
  await new Promise(resolve => startStream.on('open', resolve));

  const c = `${cwd}/c/package.json`;
  assert((await read(c, 'utf8')).includes('mkdir -p dist && mkdir dist'));

  await install({root: cwd, cwd: `${cwd}/a`});

  // $FlowFixMe `assert` typedef is missing `rejects` method
  await assert.rejects(
    exec(`${jazelle} start`, {cwd: `${cwd}/a`}, [startStream, startStream])
  );
}

async function testSortPackageJSON() {
  const pkg = {
    description: 'description',
    name: 'name',
    author: 'author',
    version: 'version',
    scripts: {
      test: 'test',
      lint: 'lint',
      cover: 'cover',
    },
    list: ['zzz', 'a', 'ab', 'b'],
    nestedList: {
      list: ['zzz', 'a', 'ab', 'b'],
    },
    dependencies: {
      a: '0.0.0',
      c: '0.0.0',
      '@uber/test': '0.0.0',
      asdf: '0.0.0',
      '@uber/asdf': '0.0.0',
    },
  };

  const sortedPkg =
    JSON.stringify(
      {
        name: 'name',
        description: 'description',
        version: 'version',
        author: 'author',
        dependencies: {
          '@uber/asdf': '0.0.0',
          '@uber/test': '0.0.0',
          a: '0.0.0',
          asdf: '0.0.0',
          c: '0.0.0',
        },
        list: ['a', 'ab', 'b', 'zzz'],
        nestedList: {
          list: ['a', 'ab', 'b', 'zzz'],
        },
        scripts: {
          cover: 'cover',
          lint: 'lint',
          test: 'test',
        },
      },
      null,
      2
    ) + '\n';
  assert.equal(sortPackageJson(pkg), sortedPkg);
}

async function testLocalize() {
  const cmd = `cp -r ${__dirname}/fixtures/localize ${tmp}/tmp/localize`;
  await exec(cmd);

  const root = `${tmp}/tmp/localize`;
  await localize({root});
  const meta = JSON.parse(await read(`${root}/b/package.json`, 'utf8'));
  assert.equal(meta.dependencies.a, '0.0.0-monorepo');
  assert.equal(meta.devDependencies.a, '0.0.0-monorepo');
}

async function testCheck() {
  const cmd = `cp -r ${__dirname}/fixtures/check ${tmp}/tmp/check`;
  await exec(cmd);

  const root = `${tmp}/tmp/check`;

  // Check default
  let result = await check({
    root,
    json: true,
    all: false,
  });
  if (!result) {
    assert.ok(result);
    return;
  }
  assert.deepEqual(
    JSON.parse(result), // resolve formatting
    {
      a: {
        '0.0.1': ['a'],
        '0.0.0': ['b'],
      },
    }
  );

  // Check with --all
  result = await check({root, json: true, all: true});
  if (!result) {
    assert.ok(result);
    return;
  }
  assert.deepEqual(
    JSON.parse(result), // resolve formatting
    {
      a: {
        '0.0.1': ['a'],
        '0.0.0': ['b'],
      },
      b: {
        '1.0.0': ['a'],
      },
      c: {
        '0.0.0': ['b'],
      },
    }
  );
}

async function testOutdated() {
  const cmd = `cp -r ${__dirname}/fixtures/outdated ${tmp}/tmp/outdated`;
  await exec(cmd);

  const data = [];
  const flush = () => data.splice(0);
  const logger = (...args) => data.push(args.join(' '));

  const root = `${tmp}/tmp/outdated`;

  // Sanity check
  await outdated({root, logger});
  assert.equal(data[0], 'only-version-one-zero-zero 0.1.0 1.0.0');
  assert.equal(data[1], 'only-version-one-zero-zero 0.2.0 1.0.0');
  flush();

  // Test --dedup option
  await outdated({root, logger, dedup: true});
  assert.equal(data.join(), 'only-version-one-zero-zero 0.1.0 0.2.0 1.0.0');
  flush();

  // Test --json option w/ --dedup
  await outdated({root, logger, json: true, dedup: true});
  let parsed /*: ?{[string]: string} */;
  try {
    parsed = JSON.parse(data.join(''));
  } catch (e) {
    // $FlowFixMe
    assert.fail(`Unable to call JSON.parse on data: ${data.join('')}`);
  }
  assert.deepEqual(parsed, [
    {
      packageName: 'only-version-one-zero-zero',
      installed: ['0.1.0', '0.2.0'],
      latest: '1.0.0',
    },
  ]);
}
