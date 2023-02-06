// @flow
const {check: checkDeps} = require('./lockfile.js');
const {red} = require('./red');

/*::
import type {VersionPolicy, ExceptionMetadata} from './get-manifest.js';

export type ReportMismatchedTopLevelDepsArgs = {
  dirs: Array<string>,
  versionPolicy: VersionPolicy | void,
}
export type ReportMismatchedTopLevelDeps = (ReportMismatchedTopLevelDepsArgs) => Promise<Report>;
export type Report = {
  valid: boolean,
  policy: VersionPolicy,
  reported: DependencyReport,
};
export type DependencyReport = {
  [string]: {
    [string]: Array<string>,
  },
};
*/
const reportMismatchedTopLevelDeps /*: ReportMismatchedTopLevelDeps */ = async ({
  dirs,
  versionPolicy,
}) => {
  const reported = await checkDeps({roots: dirs});
  if (!versionPolicy) {
    return {
      valid: true,
      policy: {
        lockstep: false,
        exceptions: [],
      },
      reported,
    };
  }

  const policy = {
    lockstep: !!versionPolicy.lockstep,
    exceptions: versionPolicy.exceptions || [],
  };

  let reportedFilter = Object.keys(reported)
    .filter((dep /*: string */) =>
      policy.lockstep
        ? !policy.exceptions.includes(dep)
        : policy.exceptions.filter(
            // $FlowFixMe
            exception => exception === dep || exception.name === dep
          ).length > 0
    )
    .reduce((obj, dep /*: string */) => {
      const meta /*: ExceptionMetadata */ = (policy.exceptions /*: any */)
        .filter(meta => meta.name === dep)[0];

      if (!meta) {
        // for blanket exemptions, include all reportedly mismatched versions
        obj[dep] = reported[dep];
      } else {
        // otherwise, keep only versions that are not specifically exempt in the version policy
        for (let version of Object.keys(reported[dep])) {
          if (!meta.versions.includes(version)) {
            if (!obj[dep]) obj[dep] = {};
            obj[dep][version] = reported[dep][version];
          }
        }
      }
      return obj;
    }, {});
  const valid = Object.keys(reportedFilter).length === 0;
  return {valid, policy, reported: reportedFilter};
};

/*::
export type GetErrorMessage = (Report, boolean) => string;
*/
const getErrorMessage /*: GetErrorMessage */ = (result, json = false) => {
  if (!result.valid) {
    const message = red(
      `Version policy violation. Use \`jazelle upgrade\` to ensure all projects use the same dependency version`
    );
    const report = JSON.stringify(result.reported, null, 2);
    let violations = `\nViolations:\n${report}`;
    for (const dep in result.reported) {
      const group = result.reported[dep];
      const versions = Object.keys(group);
      if (versions.length === 2) {
        const [correctVersion, incorrectVersion] =
          group[versions[0]].length > group[versions[1]].length
            ? [versions[0], versions[1]]
            : [versions[1], versions[0]];
        violations = red(
          `\nWorkpaces: ${group[incorrectVersion].join(
            ', '
          )} have incorrect version of ${dep}\nShould be using ${correctVersion} instead of ${incorrectVersion}`
        );
      }
    }
    return json ? report : message + violations;
  } else {
    return json ? '{}' : '';
  }
};

module.exports = {reportMismatchedTopLevelDeps, getErrorMessage};
